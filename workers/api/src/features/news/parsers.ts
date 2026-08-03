import type { NewsContentMode } from '../../../../../shared/admin/news'

const MAX_BODY_LENGTH = 100_000
const BLOCK_TAGS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']
const REMOVED_TAGS = ['script', 'style', 'noscript', 'iframe', 'form', 'template', 'svg']

export interface ParsedRssEntry {
	guid: string
	title: string
	link: string
	descriptionHtml: string
	descriptionText: string
	contentEncodedHtml: string | null
	category: string | null
	author: string | null
	publishedAt: string | null
}

export interface ParsedAiHotItem {
	upstreamId: string
	title: string
	summary: string | null
	sourceName: string
	aihotUrl: string
	originalUrl: string | null
	category: string | null
	publishedAt: string | null
	score: number | null
	selected: boolean
}

export interface ParsedAiHotFeedEntry {
	upstreamId: string
	title: string
	bodyText: string
	contentMode: NewsContentMode
	sourceUrl: string
	originalUrl: string | null
	category: string | null
	publishedAt: string | null
}

export interface ParsedAiHotDailyItem {
	title: string
	summary?: string
	source?: { name?: string }
	links?: { original?: string, aihot?: string }
}

export interface ParsedAiHotDailyReport {
	date: string
	title: string
	lead: string | null
	sections: Array<{ label: string, items: ParsedAiHotDailyItem[] }>
	sourceUrl: string
	generatedAt: string
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : ''
}

function stripCdata(value: string): string {
	return value
		.replace(/^\s*<!\[CDATA\[/u, '')
		.replace(/\]\]>\s*$/u, '')
}

function decodeEntities(value: string): string {
	const named: Record<string, string> = {
		amp: '&',
		apos: '\'',
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"',
	}
	return value.replace(/&(#x?[\da-f]+|[a-z]+);/giu, (match, entity: string) => {
		if (entity.startsWith('#')) {
			const hexadecimal = entity[1]?.toLowerCase() === 'x'
			const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
			return Number.isFinite(codePoint) && codePoint > 0
				? String.fromCodePoint(codePoint)
				: match
		}
		return named[entity.toLowerCase()] ?? match
	})
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function xmlField(block: string, name: string): string {
	const escaped = escapeRegExp(name)
	return block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'iu'))?.[1] || ''
}

function normalizeDate(value: unknown): string | null {
	const candidate = text(value)
	if (!candidate)
		return null
	const date = new Date(candidate)
	return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function attributeValue(tag: string, attribute: string): string {
	const escaped = escapeRegExp(attribute)
	return tag.match(new RegExp(`${escaped}\\s*=\\s*(['"])([^'"]*)\\1`, 'iu'))?.[2] || ''
}

function firstExternalHref(html: string): string | null {
	for (const match of html.matchAll(/<a(?:\s[^>]*)?>/giu)) {
		const href = decodeEntities(attributeValue(match[0], 'href')).trim()
		try {
			const url = new URL(href)
			if (url.protocol.startsWith('http') && url.hostname !== 'aihot.virxact.com')
				return url.toString()
		}
		catch {
			// 无效链接由上层忽略。
		}
	}
	return null
}

function metaContent(html: string, attribute: 'name' | 'property', expected: string): string {
	for (const match of html.matchAll(/<meta(?:\s[^>]*)?>/giu)) {
		const tag = match[0]
		const key = attributeValue(tag, attribute)
		if (key.toLowerCase() !== expected.toLowerCase())
			continue
		return decodeEntities(attributeValue(tag, 'content')).trim()
	}
	return ''
}

export function htmlToReadableText(input: string): string {
	let html = stripCdata(input || '')
	for (const tag of REMOVED_TAGS)
		html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'giu'), '')
	html = html.replace(/<!--[\s\S]*?-->/gu, '')
	html = html.replace(/<br(?:\s[^>]*)?>/giu, '\n\n')
	for (const tag of BLOCK_TAGS) {
		html = html
			.replace(new RegExp(`<${tag}\\b[^>]*>`, 'giu'), tag === 'li' ? '\n' : '')
			.replace(new RegExp(`<\\/${tag}>`, 'giu'), '\n\n')
	}
	html = html.replace(/<[^>]+>/gu, '')
	return decodeEntities(html)
		.replaceAll('\r', '')
		.replace(/[\t\f\v ]+/gu, ' ')
		.replace(/ *\n */gu, '\n')
		.replace(/\n{3,}/gu, '\n\n')
		.trim()
		.slice(0, MAX_BODY_LENGTH)
}

export function parseRssFeed(xml: string, limit = 50): ParsedRssEntry[] {
	return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)]
		.slice(0, limit)
		.map((match) => {
			const block = match[1] || ''
			const descriptionHtml = stripCdata(xmlField(block, 'description'))
			const contentEncoded = stripCdata(xmlField(block, 'content:encoded')).trim()
			return {
				guid: htmlToReadableText(xmlField(block, 'guid')),
				title: htmlToReadableText(xmlField(block, 'title')).slice(0, 500),
				link: decodeEntities(stripCdata(xmlField(block, 'link'))).trim(),
				descriptionHtml,
				descriptionText: htmlToReadableText(descriptionHtml).slice(0, 5_000),
				contentEncodedHtml: contentEncoded || null,
				category: htmlToReadableText(xmlField(block, 'category')).slice(0, 120) || null,
				author: htmlToReadableText(xmlField(block, 'author')).slice(0, 160) || null,
				publishedAt: normalizeDate(htmlToReadableText(xmlField(block, 'pubDate'))),
			}
		})
		.filter(entry => entry.title && entry.link)
}

export function parseAiHotItems(payload: unknown): ParsedAiHotItem[] {
	const rawItems = Array.isArray((payload as { items?: unknown[] })?.items)
		? (payload as { items: unknown[] }).items
		: []
	return rawItems.slice(0, 50).map((raw) => {
		const item = raw as Record<string, unknown>
		const links = (item.links || {}) as Record<string, unknown>
		const source = (item.source || {}) as Record<string, unknown>
		return {
			upstreamId: text(item.id),
			title: text(item.title).slice(0, 500),
			summary: text(item.summary).slice(0, 5_000) || null,
			sourceName: text(source.name).slice(0, 160) || 'AI HOT',
			aihotUrl: text(links.aihot),
			originalUrl: text(links.original) || null,
			category: text(item.category).slice(0, 120) || null,
			publishedAt: normalizeDate(item.publishedAt),
			score: numberOrNull(item.score),
			selected: item.selected !== false,
		}
	}).filter(item => item.upstreamId && item.title && item.aihotUrl)
}

export function parseAiHotFullFeed(xml: string): ParsedAiHotFeedEntry[] {
	return parseRssFeed(xml).map((entry) => {
		const upstreamId = entry.guid || entry.link.split('/').filter(Boolean).at(-1) || ''
		const fullText = entry.contentEncodedHtml
			? htmlToReadableText(entry.contentEncodedHtml)
			: ''
		return {
			upstreamId,
			title: entry.title,
			bodyText: fullText || entry.descriptionText,
			contentMode: fullText ? 'full' as const : 'summary' as const,
			sourceUrl: entry.link,
			originalUrl: firstExternalHref(entry.descriptionHtml),
			category: entry.category,
			publishedAt: entry.publishedAt,
		}
	}).filter(entry => entry.upstreamId && entry.bodyText && entry.sourceUrl)
}

export function parseAiHotDaily(payload: unknown): ParsedAiHotDailyReport | null {
	const report = (payload as { report?: Record<string, unknown> })?.report
	if (!report)
		return null
	const links = (report.links || {}) as Record<string, unknown>
	const rawSections = Array.isArray(report.sections) ? report.sections : []
	const sections = rawSections.map((raw) => {
		const section = raw as Record<string, unknown>
		const rawItems = Array.isArray(section.items) ? section.items : []
		return {
			label: text(section.label).slice(0, 120),
			items: rawItems.map((item) => {
				const value = item as Record<string, unknown>
				const source = (value.source || {}) as Record<string, unknown>
				const itemLinks = (value.links || {}) as Record<string, unknown>
				return {
					title: text(value.title).slice(0, 500),
					summary: text(value.summary).slice(0, 5_000) || undefined,
					source: text(source.name) ? { name: text(source.name).slice(0, 160) } : undefined,
					links: {
						original: text(itemLinks.original) || undefined,
						aihot: text(itemLinks.aihot) || undefined,
					},
				}
			}).filter(item => item.title),
		}
	}).filter(section => section.label && section.items.length)
	const date = text(report.date)
	const sourceUrl = text(links.aihot)
	if (!date || !sourceUrl)
		return null
	return {
		date,
		title: `AI 日报 · ${date}`,
		lead: text(report.lead).slice(0, 5_000) || null,
		sections,
		sourceUrl,
		generatedAt: normalizeDate(report.generatedAt) || new Date().toISOString(),
	}
}

export function extractZaihuaArticle(html: string): { title: string, bodyText: string } | null {
	let bodyHtml = ''
	for (const match of html.matchAll(/<div(?:\s[^>]*)?>/giu)) {
		const className = attributeValue(match[0], 'class')
		if (!className.split(/\s+/u).includes('msg-prose'))
			continue
		const contentStart = (match.index || 0) + match[0].length
		const contentEnd = html.indexOf('</div>', contentStart)
		if (contentEnd > contentStart)
			bodyHtml = html.slice(contentStart, contentEnd)
		break
	}
	if (!bodyHtml)
		return null
	const bodyText = htmlToReadableText(bodyHtml)
	if (!bodyText)
		return null
	const title = (
		metaContent(html, 'property', 'og:title')
		|| htmlToReadableText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] || '')
	).slice(0, 500)
	return title ? { title, bodyText } : null
}
