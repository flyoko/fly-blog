import type { NewsContentMode } from '../../../../../shared/admin/news'

const MAX_BODY_LENGTH = 100_000
const MAX_IMAGE_CANDIDATES = 24
const BLOCK_TAGS = ['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']
const REMOVED_TAGS = ['script', 'style', 'noscript', 'iframe', 'form', 'template', 'svg']

export interface ParsedNewsImage {
	url: string
	alt: string | null
}

export interface ParsedRssEntry {
	guid: string
	title: string
	link: string
	descriptionHtml: string
	descriptionText: string
	contentEncodedHtml: string | null
	images: ParsedNewsImage[]
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
	images: ParsedNewsImage[]
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

function absoluteHttpUrl(value: string, baseUrl: string): string | null {
	const candidate = decodeEntities(value).trim()
	if (!candidate)
		return null
	try {
		const url = new URL(candidate, baseUrl)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
	}
	catch {
		return null
	}
}

function largestSrcsetUrl(value: string): string {
	let best = ''
	let bestScore = -1
	for (const candidate of decodeEntities(value).split(',')) {
		const parts = candidate.trim().split(/\s+/u)
		const url = parts[0] || ''
		const descriptor = parts[1] || ''
		const score = descriptor.endsWith('w')
			? Number.parseFloat(descriptor.slice(0, -1))
			: descriptor.endsWith('x')
				? Number.parseFloat(descriptor.slice(0, -1)) * 10_000
				: 0
		if (url && Number.isFinite(score) && score >= bestScore) {
			best = url
			bestScore = score
		}
	}
	return best
}

function pushUniqueImage(
	images: ParsedNewsImage[],
	seen: Set<string>,
	value: string,
	baseUrl: string,
	alt: string | null,
): void {
	if (images.length >= MAX_IMAGE_CANDIDATES)
		return
	const url = absoluteHttpUrl(value, baseUrl)
	if (!url || seen.has(url))
		return
	seen.add(url)
	images.push({ url, alt })
}

export function extractHtmlImages(html: string, baseUrl: string): ParsedNewsImage[] {
	const images: ParsedNewsImage[] = []
	const seen = new Set<string>()
	for (const match of html.matchAll(/<img(?:\s[^>]*)?>/giu)) {
		const tag = match[0]
		const altText = decodeEntities(attributeValue(tag, 'alt')).replace(/\s+/gu, ' ').trim().slice(0, 500)
		const values = [
			attributeValue(tag, 'data-src'),
			attributeValue(tag, 'data-original'),
			attributeValue(tag, 'data-lazy-src'),
			largestSrcsetUrl(attributeValue(tag, 'srcset')),
			attributeValue(tag, 'src'),
		]
		const before = images.length
		for (const value of values) {
			pushUniqueImage(images, seen, value, baseUrl, altText || null)
			if (images.length > before)
				break
		}
	}
	return images
}

function rssMediaImages(block: string, baseUrl: string): ParsedNewsImage[] {
	const images: ParsedNewsImage[] = []
	const seen = new Set<string>()
	for (const match of block.matchAll(/<(?:enclosure|media:content|media:thumbnail)\b[^>]*>/giu)) {
		const tag = match[0]
		const mime = attributeValue(tag, 'type').toLowerCase()
		if (mime && !mime.startsWith('image/'))
			continue
		const alt = decodeEntities(attributeValue(tag, 'title') || attributeValue(tag, 'description'))
			.replace(/\s+/gu, ' ')
			.trim()
			.slice(0, 500)
		pushUniqueImage(images, seen, attributeValue(tag, 'url'), baseUrl, alt || null)
	}
	return images
}

function mergeImages(...groups: ParsedNewsImage[][]): ParsedNewsImage[] {
	const images: ParsedNewsImage[] = []
	const seen = new Set<string>()
	for (const group of groups) {
		for (const image of group)
			pushUniqueImage(images, seen, image.url, image.url, image.alt)
	}
	return images
}

function divInnerHtmlByClass(html: string, expectedClass: string): string {
	for (const match of html.matchAll(/<div(?:\s[^>]*)?>/giu)) {
		const className = attributeValue(match[0], 'class')
		if (!className.split(/\s+/u).includes(expectedClass))
			continue
		const contentStart = (match.index || 0) + match[0].length
		const tokenPattern = /<\/?div\b[^>]*>/giu
		let depth = 1
		for (const token of html.slice(contentStart).matchAll(tokenPattern)) {
			const absoluteIndex = contentStart + (token.index || 0)
			if (token[0].startsWith('</'))
				depth -= 1
			else
				depth += 1
			if (depth === 0)
				return html.slice(contentStart, absoluteIndex)
		}
	}
	return ''
}

interface HtmlLink {
	label: string
	url: string
}

function htmlLinks(html: string): HtmlLink[] {
	const links: HtmlLink[] = []
	for (const match of html.matchAll(/<a(?:\s[^>]*)?>([\s\S]*?)<\/a>/giu)) {
		const href = decodeEntities(attributeValue(match[0], 'href')).trim()
		const label = htmlToReadableText(match[1] || '').slice(0, 160)
		try {
			const url = new URL(href)
			if ((url.protocol === 'http:' || url.protocol === 'https:') && label)
				links.push({ label, url: url.toString() })
		}
		catch {
			// 无效链接由调用方忽略。
		}
	}
	return links
}

function isZaihuaIntermediaryLink(value: string): boolean {
	try {
		const hostname = new URL(value).hostname.toLowerCase()
		return hostname === 'www.zaihua.news'
			|| hostname === 'zaihua.news'
			|| hostname.endsWith('.zaihua.news')
			|| hostname === 't.me'
			|| hostname === 'telegram.me'
			|| hostname.endsWith('.telegram.me')
	}
	catch {
		return true
	}
}

function isZaihuaDecorativeImage(image: ParsedNewsImage): boolean {
	try {
		const url = new URL(image.url)
		return url.hostname.toLowerCase().endsWith('.zaihua.news')
			&& url.pathname.includes('/emojis/custom/')
	}
	catch {
		return true
	}
}

function zaihuaContentMetaImages(html: string, baseUrl: string): ParsedNewsImage[] {
	let articleId = ''
	try {
		const pageUrl = new URL(baseUrl)
		articleId = pageUrl.pathname.match(/^\/article\/(\d+)\/?$/u)?.[1] || ''
	}
	catch {
		return []
	}
	if (!articleId)
		return []
	const images: ParsedNewsImage[] = []
	const seen = new Set<string>()
	for (const value of [
		metaContent(html, 'property', 'og:image'),
		metaContent(html, 'property', 'og:image:secure_url'),
	]) {
		pushUniqueImage(images, seen, value, baseUrl, null)
	}
	return images.filter((image) => {
		try {
			const url = new URL(image.url)
			return url.protocol === 'https:'
				&& url.hostname.toLowerCase() === 'cdn.zaihua.news'
				&& url.pathname.startsWith(`/main/${articleId}/`)
		}
		catch {
			return false
		}
	})
}

function cleanZaihuaBodyHtml(bodyHtml: string, source: HtmlLink | null): string {
	return bodyHtml.replace(/<p\b[^>]*>[\s\S]*?<\/p>/giu, (paragraph) => {
		const paragraphText = htmlToReadableText(paragraph).replace(/\s+/gu, ' ').trim()
		if (/在花频道|茶馆水群|投稿通道/u.test(paragraphText))
			return ''
		if (!source)
			return paragraph
		const normalizedText = paragraphText.replace(/^(?:来源|原文来源)\s*[:：]?\s*/u, '')
		const containsSource = htmlLinks(paragraph).some(link => link.url === source.url)
		return containsSource && normalizedText === source.label ? '' : paragraph
	})
}

const ZAIHUA_PROMOTION_SUFFIX = /(?: ?🌸\uFE0F?)? ?在花频道 ?[·•・|｜] ?茶馆水群 ?[·•・|｜] ?投稿通道(?: ?[↗→])?[。.!！]?$/u

export function cleanZaihuaText(value: string): string {
	return value
		.split(/\n{2,}/u)
		.map(paragraph => paragraph
			.replace(/\s+/gu, ' ')
			.trim()
			.replace(ZAIHUA_PROMOTION_SUFFIX, '')
			.trim())
		.filter(Boolean)
		.join('\n\n')
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

export function cleanAiHotBodyText(value: string): string {
	return value
		.split(/\n{2,}/u)
		.map(paragraph => paragraph.replace(/\s+/gu, ' ').trim())
		.filter(Boolean)
		.filter((paragraph) => {
			return !/^🔗?\s*阅读原文(?:\s*[↗→])?$/u.test(paragraph)
				&& !/^via\s+AI\s+HOT[\s\S]*aihot\.virxact\.com\/items\//iu.test(paragraph)
				&& !/^(?:——?\s*)?本文由\s*AI\s+HOT\s*聚合整理[\s\S]*aihot\.virxact\.com\/items\//iu.test(paragraph)
		})
		.join('\n\n')
		.slice(0, MAX_BODY_LENGTH)
}

export function parseRssFeed(xml: string, limit = 50): ParsedRssEntry[] {
	return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/giu)]
		.slice(0, limit)
		.map((match) => {
			const block = match[1] || ''
			const descriptionHtml = stripCdata(xmlField(block, 'description'))
			const contentEncoded = stripCdata(xmlField(block, 'content:encoded')).trim()
			const link = decodeEntities(stripCdata(xmlField(block, 'link'))).trim()
			const images = link
				? mergeImages(
						rssMediaImages(block, link),
						extractHtmlImages(contentEncoded, link),
						extractHtmlImages(descriptionHtml, link),
					)
				: []
			return {
				guid: htmlToReadableText(xmlField(block, 'guid')),
				title: htmlToReadableText(xmlField(block, 'title')).slice(0, 500),
				link,
				descriptionHtml,
				descriptionText: htmlToReadableText(descriptionHtml).slice(0, 5_000),
				contentEncodedHtml: contentEncoded || null,
				images,
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
			? cleanAiHotBodyText(htmlToReadableText(entry.contentEncodedHtml))
			: ''
		const summaryText = cleanAiHotBodyText(entry.descriptionText)
		return {
			upstreamId,
			title: entry.title,
			bodyText: fullText || summaryText,
			images: entry.images,
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

export function extractAiHotArticle(
	html: string,
	baseUrl = 'https://aihot.virxact.com/',
): { bodyText: string, images: ParsedNewsImage[] } | null {
	const bodyHtml = divInnerHtmlByClass(html, 'm-detail-html')
	const bodyText = cleanAiHotBodyText(htmlToReadableText(bodyHtml))
	const images = extractHtmlImages(bodyHtml, baseUrl)
	return bodyText || images.length
		? { bodyText, images }
		: null
}

export function extractZaihuaArticle(html: string, baseUrl = 'https://www.zaihua.news/'): {
	title: string
	bodyText: string
	images: ParsedNewsImage[]
	originalUrl: string | null
	sourceName: string | null
} | null {
	const bodyHtml = divInnerHtmlByClass(html, 'msg-prose')
	if (!bodyHtml)
		return null
	const source = htmlLinks(bodyHtml).find(link => !isZaihuaIntermediaryLink(link.url)) || null
	const bodyText = htmlToReadableText(cleanZaihuaBodyHtml(bodyHtml, source))
	if (!bodyText)
		return null
	const images = mergeImages(
		extractHtmlImages(bodyHtml, baseUrl).filter(image => !isZaihuaDecorativeImage(image)),
		zaihuaContentMetaImages(html, baseUrl),
	)
	const title = (
		metaContent(html, 'property', 'og:title')
		|| htmlToReadableText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] || '')
	).replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/gu, '').slice(0, 500)
	return title
		? {
				title,
				bodyText,
				images,
				originalUrl: source?.url || null,
				sourceName: source?.label || null,
			}
		: null
}
