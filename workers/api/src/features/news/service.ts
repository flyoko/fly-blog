import type { NewsDocumentDto, NewsItemDto } from '../../../../../shared/admin/news'
import type { NewsSourcesConfig } from '../../../../../shared/admin/site-config'
import type { Env } from '../../env'
import pLimit from 'p-limit'
import newsSourcesRaw from '../../../../../config/news/sources.json'
import { newsSourcesConfigSchema } from '../../../../../shared/admin/site-config'
import { isPublicHttpUrl } from '../../../../../shared/utils/public-url'
import {
	extractAiHotArticle,
	extractZaihuaArticle,
	parseAiHotDaily,
	parseAiHotFullFeed,
	parseAiHotItems,
	parseRssFeed,
} from './parsers'

interface NewsRow {
	id: string
	source_id: string
	kind: NewsItemDto['kind']
	title: string
	summary: string | null
	url: string
	original_url: string | null
	category: string | null
	rank: number | null
	published_at: string | null
	fetched_at: string
	selected: number
	metadata_json?: string
	reader_key?: string | null
	content_mode?: NewsDocumentDto['contentMode'] | null
}

interface BriefingRow {
	date: string
	title: string
	lead: string | null
	content_json: string
	source_url: string
	generated_at: string
}

interface SyncStateRow {
	source_id: string
	status: 'success' | 'failed'
	item_count: number
	last_success_at: string | null
	last_error: string | null
	updated_at: string
	etag: string | null
	last_modified: string | null
	next_sync_at: string | null
}

interface DocumentRow extends NewsRow {
	reader_key: string
	body_text: string
	content_mode: NewsDocumentDto['contentMode']
	attribution_name: string
	attribution_url: string
	document_source_url: string
	document_original_url: string | null
	document_fetched_at: string
}

interface ExistingZaihuaRow {
	id: string
	title: string
	original_url: string | null
	metadata_json: string
	document_item_id: string | null
}

export interface NewsSyncSourceResult {
	sourceId: string
	title: string
	status: 'success' | 'failed' | 'skipped'
	itemCount: number
	nextSyncAt: string | null
	error?: string
}

export interface NewsSyncResult {
	sources: NewsSyncSourceResult[]
	syncedAt: string
}

type NewsSource = NewsSourcesConfig['sources'][number]

class SourceRequestError extends Error {
	constructor(message: string, readonly nextSyncAt: string | null = null) {
		super(message)
	}
}

const sourcesConfig = newsSourcesConfigSchema.parse(newsSourcesRaw)
const AIHOT_HOST = 'aihot.virxact.com'
const ZAIHUA_HOST = 'www.zaihua.news'
const CATEGORY_LABELS: Record<string, string> = {
	'ai-agents': 'AI 智能体',
	'ai-models': 'AI 模型',
	'ai-products': 'AI 产品',
	'community': '社区动态',
	'funding': '投融资',
	'industry': '行业动态',
	'paper': '论文',
	'tip': '技巧与观点',
}

function publicUrl(value: unknown): string | null {
	return typeof value === 'string' && isPublicHttpUrl(value) ? value : null
}

function hostOf(value: string): string | null {
	try {
		return new URL(value).hostname.toLowerCase()
	}
	catch {
		return null
	}
}

function isAiHotReaderUrl(value: string): boolean {
	return hostOf(value) === AIHOT_HOST
}

function isZaihuaReaderUrl(value: string): boolean {
	return hostOf(value) === ZAIHUA_HOST
}

function isIntermediaryUrl(value: string | null | undefined): boolean {
	if (!value)
		return false
	const hostname = hostOf(value)
	return hostname === AIHOT_HOST
		|| hostname === ZAIHUA_HOST
		|| hostname === 'zaihua.news'
		|| Boolean(hostname?.endsWith('.zaihua.news'))
}

function externalPublicUrl(value: unknown): string | null {
	const url = publicUrl(value)
	return url && !isIntermediaryUrl(url) ? url : null
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
	const value = metadata[key]
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null
}

function readableSourceName(preferred: string | null, originalUrl: string | null, fallback: string): string {
	if (preferred && preferred !== 'AI HOT' && preferred !== '在花')
		return preferred.slice(0, 160)
	if (originalUrl) {
		try {
			return new URL(originalUrl).hostname.replace(/^www\./u, '').slice(0, 160)
		}
		catch {
			// 使用调用方提供的通用名称。
		}
	}
	return fallback
}

function futureIso(now: Date, minutes: number): string {
	return new Date(now.getTime() + minutes * 60_000).toISOString()
}

function retryAfterIso(value: string | null, now: Date, fallbackMinutes: number): string {
	const minimum = now.getTime() + fallbackMinutes * 60_000
	if (value) {
		const seconds = Number(value)
		if (Number.isFinite(seconds) && seconds >= 0)
			return new Date(Math.max(minimum, now.getTime() + seconds * 1_000)).toISOString()
		const date = new Date(value)
		if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime())
			return new Date(Math.max(minimum, date.getTime())).toISOString()
	}
	return new Date(minimum).toISOString()
}

function categoryLabel(value: string | null): string | null {
	return value ? CATEGORY_LABELS[value] || value : null
}

function safeMetadata(value: string | undefined): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value || '{}')
		return parsed && typeof parsed === 'object' ? parsed : {}
	}
	catch {
		return {}
	}
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
	return [...new Uint8Array(digest)]
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('')
}

export class NewsService {
	constructor(private readonly env: Env) {}

	private dto(row: NewsRow): NewsItemDto {
		const readerPath = row.reader_key ? `/ai.news/read/${row.reader_key}` : null
		const originalUrl = externalPublicUrl(row.original_url)
		const publicUrlValue = isIntermediaryUrl(row.url)
			? originalUrl || `${this.env.PUBLIC_ORIGIN}${readerPath || '/ai.news'}`
			: row.url
		return {
			id: row.id,
			sourceId: row.source_id,
			kind: row.kind,
			title: row.title,
			summary: row.summary,
			url: publicUrlValue,
			originalUrl,
			category: row.category,
			rank: row.rank,
			publishedAt: row.published_at,
			fetchedAt: row.fetched_at,
			selected: Boolean(row.selected),
			readerPath,
			contentMode: row.content_mode || null,
		}
	}

	private async state(sourceId: string): Promise<SyncStateRow | null> {
		return this.env.DB.prepare('SELECT * FROM news_sync_state WHERE source_id = ?')
			.bind(sourceId)
			.first<SyncStateRow>()
	}

	private async writeState(input: {
		source: NewsSource
		status: 'success' | 'failed'
		itemCount: number
		now: string
		nextSyncAt: string
		etag: string | null
		lastModified: string | null
		error: string | null
	}): Promise<void> {
		await this.env.DB.prepare(`
			INSERT INTO news_sync_state (
				source_id, status, item_count, last_success_at, last_error, updated_at,
				etag, last_modified, next_sync_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(source_id) DO UPDATE SET
				status = excluded.status,
				item_count = excluded.item_count,
				last_success_at = CASE
					WHEN excluded.status = 'success' THEN excluded.last_success_at
					ELSE news_sync_state.last_success_at
				END,
				last_error = excluded.last_error,
				updated_at = excluded.updated_at,
				etag = COALESCE(excluded.etag, news_sync_state.etag),
				last_modified = COALESCE(excluded.last_modified, news_sync_state.last_modified),
				next_sync_at = excluded.next_sync_at
		`).bind(
			input.source.id,
			input.status,
			input.itemCount,
			input.status === 'success' ? input.now : null,
			input.error,
			input.now,
			input.etag,
			input.lastModified,
			input.nextSyncAt,
		).run()
	}

	private async requestSource(source: NewsSource, state: SyncStateRow | null, force: boolean, now: Date): Promise<Response | null> {
		if (!force && state?.next_sync_at && Date.parse(state.next_sync_at) > now.getTime())
			return null
		const headers = new Headers({
			accept: source.type === 'rss' ? 'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8' : 'application/json',
		})
		if (state?.etag)
			headers.set('if-none-match', state.etag)
		if (state?.last_modified)
			headers.set('if-modified-since', state.last_modified)
		const response = await fetch(source.url, {
			headers,
			signal: AbortSignal.timeout(15_000),
		})
		if (response.status === 304)
			return response
		if (response.status === 429) {
			throw new SourceRequestError(
				`${source.title} 请求过于频繁`,
				retryAfterIso(response.headers.get('retry-after'), now, source.intervalMinutes),
			)
		}
		if (!response.ok)
			throw new SourceRequestError(`${source.title} 请求失败：HTTP ${response.status}`)
		return response
	}

	private async upsertItem(item: {
		id: string
		sourceId: string
		kind: NewsItemDto['kind']
		title: string
		summary: string | null
		url: string
		originalUrl: string | null
		category: string | null
		rank: number | null
		publishedAt: string | null
		fetchedAt: string
		selected: boolean
		metadata: Record<string, unknown>
	}): Promise<void> {
		await this.env.DB.prepare(`
			INSERT INTO news_items (
				id, source_id, kind, title, summary, url, original_url, category, rank,
				published_at, fetched_at, selected, metadata_json, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				source_id = excluded.source_id,
				kind = excluded.kind,
				title = excluded.title,
				summary = excluded.summary,
				url = excluded.url,
				original_url = excluded.original_url,
				category = excluded.category,
				rank = excluded.rank,
				published_at = excluded.published_at,
				fetched_at = excluded.fetched_at,
				selected = excluded.selected,
				metadata_json = excluded.metadata_json,
				updated_at = excluded.updated_at
		`).bind(
			item.id,
			item.sourceId,
			item.kind,
			item.title.slice(0, 500),
			item.summary?.slice(0, 5_000) || null,
			item.url,
			item.originalUrl,
			item.category?.slice(0, 120) || null,
			item.rank,
			item.publishedAt,
			item.fetchedAt,
			item.selected ? 1 : 0,
			JSON.stringify(item.metadata),
			item.fetchedAt,
		).run()
	}

	private async upsertDocument(input: {
		itemId: string
		sourceId: string
		sourceUrl: string
		originalUrl: string | null
		title: string
		bodyText: string
		contentMode: NewsDocumentDto['contentMode']
		attributionName: string
		attributionUrl: string
		publishedAt: string | null
		fetchedAt: string
	}): Promise<void> {
		if (!input.bodyText.trim())
			return
		const bodyText = input.bodyText.trim().slice(0, 100_000)
		const [readerKey, contentHash] = await Promise.all([
			sha256(input.itemId).then(value => value.slice(0, 32)),
			sha256(`${input.contentMode}\0${input.title}\0${bodyText}`),
		])
		await this.env.DB.prepare(`
			INSERT INTO news_documents (
				item_id, reader_key, source_id, source_url, original_url, title, body_text,
				content_mode, attribution_name, attribution_url, published_at, content_hash,
				fetched_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(item_id) DO UPDATE SET
				reader_key = excluded.reader_key,
				source_id = excluded.source_id,
				source_url = excluded.source_url,
				original_url = excluded.original_url,
				title = excluded.title,
				body_text = CASE
					WHEN news_documents.content_hash <> excluded.content_hash THEN excluded.body_text
					ELSE news_documents.body_text
				END,
				content_mode = excluded.content_mode,
				attribution_name = excluded.attribution_name,
				attribution_url = excluded.attribution_url,
				published_at = excluded.published_at,
				content_hash = excluded.content_hash,
				fetched_at = excluded.fetched_at,
				updated_at = CASE
					WHEN news_documents.content_hash <> excluded.content_hash THEN excluded.updated_at
					ELSE news_documents.updated_at
				END
		`).bind(
			input.itemId,
			readerKey,
			input.sourceId,
			input.sourceUrl,
			input.originalUrl,
			input.title.slice(0, 500),
			bodyText,
			input.contentMode,
			input.attributionName.slice(0, 160),
			input.attributionUrl,
			input.publishedAt,
			contentHash,
			input.fetchedAt,
			input.fetchedAt,
		).run()
	}

	private async syncAiHotItems(source: NewsSource, response: Response, fetchedAt: string): Promise<number> {
		const items = parseAiHotItems(await response.json())
		await this.env.DB.prepare('UPDATE news_items SET selected = 0, updated_at = ? WHERE source_id IN (\'ai-hot\', \'ai-hot-items\')')
			.bind(fetchedAt)
			.run()
		let accepted = 0
		for (const item of items) {
			const url = publicUrl(item.aihotUrl)
			if (!url)
				continue
			const originalUrl = externalPublicUrl(item.originalUrl)
			const itemId = `ai-hot:${item.upstreamId}`
			await this.upsertItem({
				id: itemId,
				sourceId: source.id,
				kind: 'hot',
				title: item.title,
				summary: item.summary,
				url,
				originalUrl,
				category: categoryLabel(item.category),
				rank: null,
				publishedAt: item.publishedAt,
				fetchedAt,
				selected: source.publishItems && item.selected,
				metadata: { sourceName: item.sourceName, score: item.score },
			})
			const existingDocument = isAiHotReaderUrl(url)
				? await this.env.DB.prepare('SELECT content_mode FROM news_documents WHERE item_id = ?')
						.bind(itemId)
						.first<{ content_mode: NewsDocumentDto['contentMode'] }>()
				: null
			if (isAiHotReaderUrl(url) && item.summary && existingDocument?.content_mode !== 'full') {
				await this.upsertDocument({
					itemId,
					sourceId: source.id,
					sourceUrl: url,
					originalUrl,
					title: item.title,
					bodyText: item.summary,
					contentMode: 'summary',
					attributionName: readableSourceName(item.sourceName, originalUrl, '原文来源'),
					attributionUrl: originalUrl || this.env.PUBLIC_ORIGIN,
					publishedAt: item.publishedAt,
					fetchedAt,
				})
			}
			accepted += 1
		}
		return accepted
	}

	private async fetchAiHotArticle(url: string): Promise<{ bodyText: string } | null> {
		try {
			const response = await fetch(url, {
				headers: { accept: 'text/html,application/xhtml+xml' },
				signal: AbortSignal.timeout(12_000),
			})
			if (!response.ok)
				return null
			return extractAiHotArticle(await response.text())
		}
		catch {
			return null
		}
	}

	private async syncAiHotFull(response: Response, fetchedAt: string): Promise<number> {
		const entries = parseAiHotFullFeed(await response.text())
		const limit = pLimit(4)
		const prepared = await Promise.all(entries.map(entry => limit(async () => {
			const sourceUrl = publicUrl(entry.sourceUrl)
			if (!sourceUrl || !isAiHotReaderUrl(sourceUrl))
				return null
			const itemId = `ai-hot:${entry.upstreamId}`
			const existing = await this.env.DB.prepare('SELECT * FROM news_items WHERE id = ?')
				.bind(itemId)
				.first<NewsRow>()
			if (!existing)
				return null
			const existingDocument = await this.env.DB.prepare(`
				SELECT body_text, content_mode
				FROM news_documents WHERE item_id = ?
			`).bind(itemId).first<{ body_text: string, content_mode: NewsDocumentDto['contentMode'] }>()
			const originalUrl = externalPublicUrl(entry.originalUrl) || externalPublicUrl(existing.original_url)
			const metadata = safeMetadata(existing.metadata_json)
			const sourceName = readableSourceName(
				metadataString(metadata, 'sourceName'),
				originalUrl,
				'原文来源',
			)
			let bodyText = entry.bodyText
			let contentMode = entry.contentMode
			if (entry.contentMode === 'summary' && existingDocument?.content_mode === 'full') {
				bodyText = existingDocument.body_text
				contentMode = 'full'
			}
			else if (entry.contentMode === 'summary') {
				const pageArticle = await this.fetchAiHotArticle(sourceUrl)
				if (pageArticle?.bodyText) {
					bodyText = pageArticle.bodyText
					contentMode = 'full'
				}
			}
			return {
				entry,
				existing,
				itemId,
				sourceUrl,
				originalUrl,
				sourceName,
				bodyText,
				contentMode,
			}
		})))
		let updated = 0
		for (const value of prepared) {
			if (!value)
				continue
			await this.env.DB.prepare(`
				UPDATE news_items
				SET title = ?, original_url = ?, category = COALESCE(?, category), updated_at = ?
				WHERE id = ?
			`).bind(
				value.entry.title,
				value.originalUrl,
				categoryLabel(value.entry.category),
				fetchedAt,
				value.itemId,
			).run()
			await this.upsertDocument({
				itemId: value.itemId,
				sourceId: value.existing.source_id,
				sourceUrl: value.sourceUrl,
				originalUrl: value.originalUrl,
				title: value.entry.title,
				bodyText: value.bodyText,
				contentMode: value.contentMode,
				attributionName: value.sourceName,
				attributionUrl: value.originalUrl || this.env.PUBLIC_ORIGIN,
				publishedAt: value.entry.publishedAt || value.existing.published_at,
				fetchedAt,
			})
			updated += 1
		}
		return updated
	}

	private async fetchZaihuaArticle(url: string): Promise<{
		title: string
		bodyText: string
		originalUrl: string | null
		sourceName: string | null
	} | null> {
		try {
			const response = await fetch(url, {
				headers: { accept: 'text/html,application/xhtml+xml' },
				signal: AbortSignal.timeout(12_000),
			})
			if (!response.ok)
				return null
			return extractZaihuaArticle(await response.text())
		}
		catch {
			return null
		}
	}

	private async syncZaihua(source: NewsSource, response: Response, fetchedAt: string): Promise<number> {
		const entries = parseRssFeed(await response.text(), 30)
			.filter(entry => publicUrl(entry.link))
		const existingRows = await this.env.DB.prepare(`
			SELECT n.id, n.title, n.original_url, n.metadata_json, d.item_id AS document_item_id
			FROM news_items n
			LEFT JOIN news_documents d ON d.item_id = n.id
			WHERE n.source_id = ?
		`).bind(source.id).all<ExistingZaihuaRow>()
		const existingById = new Map(existingRows.results.map(row => [row.id, row]))
		const limit = pLimit(4)
		const prepared = await Promise.all(entries.map((entry, index) => limit(async () => {
			const itemId = `${source.id}:${entry.link}`
			const existing = existingById.get(itemId)
			const previousMetadata = safeMetadata(existing?.metadata_json)
			const rssHash = await sha256(entry.descriptionText)
			const shouldRefresh = isZaihuaReaderUrl(entry.link) && (
				index < 5
				|| !existing?.document_item_id
				|| previousMetadata.rssHash !== rssHash
				|| !metadataString(previousMetadata, 'sourceName')
				|| !externalPublicUrl(previousMetadata.originalUrl)
				|| isIntermediaryUrl(existing?.original_url)
			)
			const article = shouldRefresh ? await this.fetchZaihuaArticle(entry.link) : null
			return { entry, itemId, existing, previousMetadata, rssHash, article, shouldRefresh }
		})))
		await this.env.DB.prepare('UPDATE news_items SET selected = 0, updated_at = ? WHERE source_id = ?')
			.bind(fetchedAt, source.id)
			.run()
		let accepted = 0
		for (const value of prepared) {
			const url = publicUrl(value.entry.link)
			if (!url)
				continue
			const existingDocument = Boolean(value.existing?.document_item_id)
			const preservedAfterFailure = value.shouldRefresh && !value.article && existingDocument
			const title = value.article?.title || value.existing?.title || value.entry.title
			const previousOriginalUrl = externalPublicUrl(value.previousMetadata.originalUrl)
				|| externalPublicUrl(value.existing?.original_url)
			const originalUrl = externalPublicUrl(value.article?.originalUrl) || previousOriginalUrl
			const sourceName = readableSourceName(
				value.article?.sourceName || metadataString(value.previousMetadata, 'sourceName'),
				originalUrl,
				'站长资讯',
			)
			const metadata = preservedAfterFailure
				? value.previousMetadata
				: {
						...value.previousMetadata,
						rssHash: value.rssHash,
						originalUrl,
						sourceName,
					}
			await this.upsertItem({
				id: value.itemId,
				sourceId: source.id,
				kind: 'rss',
				title,
				summary: value.article?.bodyText.slice(0, 5_000) || value.entry.descriptionText || null,
				url,
				originalUrl,
				category: '站长资讯',
				rank: null,
				publishedAt: value.entry.publishedAt,
				fetchedAt,
				selected: source.publishItems,
				metadata,
			})
			if (isZaihuaReaderUrl(url)) {
				if (value.article) {
					await this.upsertDocument({
						itemId: value.itemId,
						sourceId: source.id,
						sourceUrl: url,
						originalUrl,
						title: value.article.title,
						bodyText: value.article.bodyText,
						contentMode: 'full',
						attributionName: sourceName,
						attributionUrl: originalUrl || this.env.PUBLIC_ORIGIN,
						publishedAt: value.entry.publishedAt,
						fetchedAt,
					})
				}
				else if (!existingDocument && value.entry.descriptionText) {
					await this.upsertDocument({
						itemId: value.itemId,
						sourceId: source.id,
						sourceUrl: url,
						originalUrl,
						title,
						bodyText: value.entry.descriptionText,
						contentMode: 'summary',
						attributionName: sourceName,
						attributionUrl: originalUrl || this.env.PUBLIC_ORIGIN,
						publishedAt: value.entry.publishedAt,
						fetchedAt,
					})
				}
			}
			accepted += 1
		}
		return accepted
	}

	private async syncDaily(response: Response, fetchedAt: string): Promise<number> {
		const report = parseAiHotDaily(await response.json())
		if (!report || !publicUrl(report.sourceUrl) || !isAiHotReaderUrl(report.sourceUrl))
			return 0
		await this.env.DB.prepare(`
			INSERT INTO news_briefings (date, title, lead, content_json, source_url, generated_at, fetched_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(date) DO UPDATE SET
				title = excluded.title,
				lead = excluded.lead,
				content_json = excluded.content_json,
				source_url = excluded.source_url,
				generated_at = excluded.generated_at,
				fetched_at = excluded.fetched_at
		`).bind(
			report.date,
			report.title,
			report.lead,
			JSON.stringify(report.sections),
			report.sourceUrl,
			report.generatedAt,
			fetchedAt,
		).run()
		return 1
	}

	private async processSource(source: NewsSource, response: Response, fetchedAt: string): Promise<number> {
		switch (source.adapter) {
			case 'aihot-items':
				return this.syncAiHotItems(source, response, fetchedAt)
			case 'aihot-full':
				return this.syncAiHotFull(response, fetchedAt)
			case 'aihot-daily':
				return this.syncDaily(response, fetchedAt)
			case 'zaihua-rss':
				return this.syncZaihua(source, response, fetchedAt)
		}
	}

	private async syncConfiguredSource(source: NewsSource, force: boolean): Promise<NewsSyncSourceResult> {
		const now = new Date()
		const nowIso = now.toISOString()
		const state = await this.state(source.id)
		if (!force && state?.next_sync_at && Date.parse(state.next_sync_at) > now.getTime()) {
			return {
				sourceId: source.id,
				title: source.title,
				status: 'skipped',
				itemCount: state.item_count,
				nextSyncAt: state.next_sync_at,
			}
		}
		try {
			const response = await this.requestSource(source, state, force, now)
			if (!response) {
				return {
					sourceId: source.id,
					title: source.title,
					status: 'skipped',
					itemCount: state?.item_count || 0,
					nextSyncAt: state?.next_sync_at || null,
				}
			}
			const nextSyncAt = futureIso(now, source.intervalMinutes)
			const itemCount = response.status === 304
				? state?.item_count || 0
				: await this.processSource(source, response, nowIso)
			await this.writeState({
				source,
				status: 'success',
				itemCount,
				now: nowIso,
				nextSyncAt,
				etag: response.headers.get('etag') || state?.etag || null,
				lastModified: response.headers.get('last-modified') || state?.last_modified || null,
				error: null,
			})
			return {
				sourceId: source.id,
				title: source.title,
				status: 'success',
				itemCount,
				nextSyncAt,
			}
		}
		catch (error) {
			const message = error instanceof Error ? error.message : '同步失败'
			const nextSyncAt = error instanceof SourceRequestError && error.nextSyncAt
				? error.nextSyncAt
				: futureIso(now, source.intervalMinutes)
			await this.writeState({
				source,
				status: 'failed',
				itemCount: state?.item_count || 0,
				now: nowIso,
				nextSyncAt,
				etag: state?.etag || null,
				lastModified: state?.last_modified || null,
				error: message.slice(0, 2_000),
			})
			return {
				sourceId: source.id,
				title: source.title,
				status: 'failed',
				itemCount: state?.item_count || 0,
				nextSyncAt,
				error: message,
			}
		}
	}

	async list(page = 1, pageSize = 50): Promise<{
		items: NewsItemDto[]
		total: number
		briefing: BriefingRow | null
		sources: SyncStateRow[]
	}> {
		const safePage = Math.max(1, Math.trunc(page))
		const safePageSize = Math.max(1, Math.min(50, Math.trunc(pageSize)))
		const offset = (safePage - 1) * safePageSize
		const [items, total, briefing, sources] = await Promise.all([
			this.env.DB.prepare(`
				SELECT n.*, d.reader_key, d.content_mode
				FROM news_items n
				LEFT JOIN news_documents d ON d.item_id = n.id
				WHERE n.selected = 1
				ORDER BY
					CASE WHEN n.kind = 'manual' THEN 0 ELSE 1 END,
					COALESCE(n.published_at, n.fetched_at) DESC,
					n.id ASC
				LIMIT ? OFFSET ?
			`).bind(safePageSize, offset).all<NewsRow>(),
			this.env.DB.prepare('SELECT COUNT(*) AS total FROM news_items WHERE selected = 1').first<{ total: number }>(),
			this.env.DB.prepare('SELECT * FROM news_briefings ORDER BY date DESC LIMIT 1').first<BriefingRow>(),
			this.env.DB.prepare('SELECT * FROM news_sync_state ORDER BY source_id').all<SyncStateRow>(),
		])
		return {
			items: items.results.map(row => this.dto(row)),
			total: total?.total || 0,
			briefing: briefing
				? { ...briefing, source_url: `${this.env.PUBLIC_ORIGIN}/ai.news` }
				: null,
			sources: sources.results,
		}
	}

	async read(readerKey: string): Promise<NewsDocumentDto | null> {
		if (!/^[a-f0-9]{32}$/u.test(readerKey))
			return null
		const row = await this.env.DB.prepare(`
			SELECT
				n.*,
				d.reader_key,
				d.body_text,
				d.content_mode,
				d.attribution_name,
				d.attribution_url,
				d.source_url AS document_source_url,
				d.original_url AS document_original_url,
				d.fetched_at AS document_fetched_at
			FROM news_documents d
			JOIN news_items n ON n.id = d.item_id
			WHERE d.reader_key = ? AND n.selected = 1
			LIMIT 1
		`).bind(readerKey).first<DocumentRow>()
		if (!row)
			return null
		if (!isAiHotReaderUrl(row.document_source_url) && !isZaihuaReaderUrl(row.document_source_url))
			return null
		const metadata = safeMetadata(row.metadata_json)
		const originalUrl = externalPublicUrl(row.document_original_url)
			|| externalPublicUrl(row.original_url)
		const sourceName = readableSourceName(
			metadataString(metadata, 'sourceName') || row.attribution_name,
			originalUrl,
			row.kind === 'rss' ? '站长资讯' : '原文来源',
		)
		const publicSourceUrl = originalUrl || `${this.env.PUBLIC_ORIGIN}/ai.news`
		return {
			item: this.dto(row),
			readerKey: row.reader_key,
			bodyText: row.body_text,
			contentMode: row.content_mode,
			attribution: {
				name: sourceName,
				url: publicSourceUrl,
			},
			sourceUrl: publicSourceUrl,
			originalUrl,
			fetchedAt: row.document_fetched_at,
		}
	}

	async listVersion(): Promise<string> {
		const row = await this.env.DB.prepare(`
			SELECT MAX(version) AS version FROM (
				SELECT MAX(updated_at) AS version FROM news_items
				UNION ALL
				SELECT MAX(updated_at) AS version FROM news_sync_state
				UNION ALL
				SELECT MAX(updated_at) AS version FROM news_documents
			)
		`).first<{ version: string | null }>()
		return row?.version || 'empty'
	}

	async documentVersion(readerKey: string): Promise<string> {
		const row = await this.env.DB.prepare('SELECT updated_at FROM news_documents WHERE reader_key = ?')
			.bind(readerKey)
			.first<{ updated_at: string }>()
		return row?.updated_at || 'missing'
	}

	async addManual(input: {
		title: string
		summary?: string
		url: string
		category?: string
		publishedAt?: string
	}): Promise<NewsItemDto> {
		const safeUrl = publicUrl(input.url)
		if (!safeUrl)
			throw new Error('Only public HTTP(S) news links are allowed')
		const now = new Date().toISOString()
		const id = `manual:${crypto.randomUUID()}`
		await this.upsertItem({
			id,
			sourceId: 'manual',
			kind: 'manual',
			title: input.title,
			summary: input.summary || null,
			url: safeUrl,
			originalUrl: safeUrl,
			category: input.category || '手动精选',
			rank: null,
			publishedAt: input.publishedAt || now,
			fetchedAt: now,
			selected: true,
			metadata: { manual: true },
		})
		const row = await this.env.DB.prepare(`
			SELECT n.*, NULL AS reader_key, NULL AS content_mode
			FROM news_items n WHERE n.id = ?
		`).bind(id).first<NewsRow>()
		if (!row)
			throw new Error('Manual news card was not persisted')
		return this.dto(row)
	}

	async sync(options: { force?: boolean, sourceId?: string } = {}): Promise<NewsSyncResult> {
		if (!sourcesConfig.enabled)
			return { sources: [], syncedAt: new Date().toISOString() }
		const sources = sourcesConfig.sources
			.filter(source => source.enabled && (!options.sourceId || source.id === options.sourceId))
			.sort((left, right) => left.priority - right.priority)
		const results: NewsSyncSourceResult[] = []
		for (const source of sources)
			results.push(await this.syncConfiguredSource(source, Boolean(options.force)))
		return { sources: results, syncedAt: new Date().toISOString() }
	}

	async syncSource(sourceId: string): Promise<NewsSyncResult> {
		return this.sync({ force: true, sourceId })
	}

	async sourceState(): Promise<SyncStateRow[]> {
		return this.env.DB.prepare('SELECT * FROM news_sync_state ORDER BY source_id')
			.all<SyncStateRow>()
			.then(result => result.results)
	}
}
