import type { NewsDocumentDto, NewsImageDto, NewsItemDto } from '../../../../../shared/admin/news'
import type { NewsSourcesConfig } from '../../../../../shared/admin/site-config'
import type { Env } from '../../env'
import type { ParsedNewsImage } from './parsers'
import pLimit from 'p-limit'
import newsSourcesRaw from '../../../../../config/news/sources.json'
import { newsSourcesConfigSchema } from '../../../../../shared/admin/site-config'
import { isPublicHttpUrl } from '../../../../../shared/utils/public-url'
import { detectAllowedMedia } from '../media/file-signatures'
import {
	cleanAiHotBodyText,
	cleanZaihuaText,
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
	images_json?: string
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
	images_json: string
}

interface ExistingZaihuaRow {
	id: string
	title: string
	summary: string | null
	original_url: string | null
	metadata_json: string
	document_item_id: string | null
	document_images_json: string | null
	document_content_mode: NewsDocumentDto['contentMode'] | null
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
const STATION_NEWS_SOURCE_ID = 'station-news'
const MAX_NEWS_IMAGES = 6
const MAX_NEWS_IMAGE_CANDIDATES = 24
const MAX_NEWS_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_NEWS_IMAGE_REDIRECTS = 3
const NEWS_IMAGE_REQUEST_TIMEOUT_MS = 12_000
const NEWS_IMAGE_DOCUMENT_BUDGET_MS = 20_000
const NEWS_IMAGE_SOURCE_SYNC_BUDGET_MS = 45_000
const NEWS_RETENTION_DAYS = 15
const NEWS_BRIEFING_RETENTION_DAYS = 180
const NEWS_EXCLUSION_RETENTION_DAYS = 180
const NEWS_IMAGE_MIMES = new Set<NewsImageDto['mime']>([
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
])
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
	if (preferred && !['AI HOT', '在花', '原文来源'].includes(preferred))
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

function safeImages(value: string | undefined, mediaOrigin: string): NewsImageDto[] {
	try {
		const parsed = JSON.parse(value || '[]')
		if (!Array.isArray(parsed))
			return []
		const originPrefix = `${mediaOrigin.replace(/\/$/u, '')}/`
		return parsed.slice(0, MAX_NEWS_IMAGES).flatMap((raw) => {
			if (!raw || typeof raw !== 'object')
				return []
			const image = raw as Record<string, unknown>
			const url = publicUrl(image.url)
			const mime = typeof image.mime === 'string' && NEWS_IMAGE_MIMES.has(image.mime as NewsImageDto['mime'])
				? image.mime as NewsImageDto['mime']
				: null
			if (!url || !url.startsWith(originPrefix) || !mime)
				return []
			const alt = typeof image.alt === 'string'
				? image.alt.trim().slice(0, 500) || null
				: null
			return [{ url, alt, mime }]
		})
	}
	catch {
		return []
	}
}

function mergeParsedImages(...groups: Array<ParsedNewsImage[] | undefined>): ParsedNewsImage[] {
	const images: ParsedNewsImage[] = []
	const seen = new Set<string>()
	for (const group of groups) {
		for (const image of group || []) {
			if (!image.url || seen.has(image.url) || images.length >= MAX_NEWS_IMAGE_CANDIDATES)
				continue
			seen.add(image.url)
			images.push({ url: image.url, alt: image.alt?.trim().slice(0, 500) || null })
		}
	}
	return images
}

function mediaUrl(origin: string, key: string): string {
	return `${origin.replace(/\/$/u, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
	return [...new Uint8Array(digest)]
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('')
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', value)
	return [...new Uint8Array(digest)]
		.map(byte => byte.toString(16).padStart(2, '0'))
		.join('')
}

async function limitedBytes(response: Response): Promise<Uint8Array | null> {
	const contentLength = Number(response.headers.get('content-length'))
	if (Number.isFinite(contentLength) && contentLength > MAX_NEWS_IMAGE_BYTES) {
		await response.body?.cancel().catch(() => undefined)
		return null
	}
	if (!response.body) {
		const bytes = new Uint8Array(await response.arrayBuffer())
		return bytes.byteLength <= MAX_NEWS_IMAGE_BYTES ? bytes : null
	}
	const reader = response.body.getReader()
	const chunks: Uint8Array[] = []
	let total = 0
	try {
		while (true) {
			const { done, value } = await reader.read()
			if (done)
				break
			total += value.byteLength
			if (total > MAX_NEWS_IMAGE_BYTES) {
				await reader.cancel()
				return null
			}
			chunks.push(value)
		}
	}
	finally {
		reader.releaseLock()
	}
	const bytes = new Uint8Array(total)
	let offset = 0
	for (const chunk of chunks) {
		bytes.set(chunk, offset)
		offset += chunk.byteLength
	}
	return bytes
}

async function fetchPublicImage(url: string, timeoutMs: number): Promise<Response | null> {
	let currentUrl = url
	const signal = AbortSignal.timeout(timeoutMs)
	for (let redirects = 0; redirects <= MAX_NEWS_IMAGE_REDIRECTS; redirects++) {
		if (!isPublicHttpUrl(currentUrl))
			return null
		const response = await fetch(currentUrl, {
			headers: { accept: 'image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1' },
			redirect: 'manual',
			signal,
		})
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get('location')
			await response.body?.cancel().catch(() => undefined)
			if (!location || redirects >= MAX_NEWS_IMAGE_REDIRECTS)
				return null
			try {
				currentUrl = new URL(location, currentUrl).toString()
			}
			catch {
				return null
			}
			continue
		}
		if (response.ok)
			return response
		await response.body?.cancel().catch(() => undefined)
		return null
	}
	return null
}

export class NewsService {
	private imageSyncDeadline = 0

	constructor(private readonly env: Env) {}

	private async syncImage(candidate: ParsedNewsImage, timeoutMs: number): Promise<NewsImageDto | null> {
		if (!isPublicHttpUrl(candidate.url))
			return null
		try {
			const response = await fetchPublicImage(candidate.url, timeoutMs)
			if (!response)
				return null
			const bytes = await limitedBytes(response)
			if (!bytes?.byteLength)
				return null
			const detected = detectAllowedMedia(bytes)
			if (!detected || detected.kind !== 'image' || !NEWS_IMAGE_MIMES.has(detected.mime as NewsImageDto['mime']))
				return null
			const hash = await sha256Bytes(bytes)
			const key = `public/news/${hash}.${detected.extension}`
			const existing = await this.env.MEDIA.head(key)
			if (!existing) {
				await this.env.MEDIA.put(key, bytes, {
					httpMetadata: { contentType: detected.mime },
					customMetadata: {
						sha256: hash,
						sourceUrl: candidate.url.slice(0, 1_024),
					},
				})
				const stored = await this.env.MEDIA.head(key)
				if (!stored || stored.size !== bytes.byteLength) {
					await this.env.MEDIA.delete(key).catch(() => undefined)
					return null
				}
			}
			return {
				url: mediaUrl(this.env.MEDIA_ORIGIN, key),
				alt: candidate.alt?.trim().slice(0, 500) || null,
				mime: detected.mime as NewsImageDto['mime'],
			}
		}
		catch {
			return null
		}
	}

	private async syncImages(candidates: ParsedNewsImage[]): Promise<NewsImageDto[]> {
		const sourceImages = mergeParsedImages(candidates)
		const images: NewsImageDto[] = []
		const seen = new Set<string>()
		const documentDeadline = Date.now() + NEWS_IMAGE_DOCUMENT_BUDGET_MS
		const deadline = this.imageSyncDeadline > 0
			? Math.min(documentDeadline, this.imageSyncDeadline)
			: documentDeadline
		for (let offset = 0; offset < sourceImages.length && images.length < MAX_NEWS_IMAGES; offset += 2) {
			const remainingMs = deadline - Date.now()
			if (remainingMs <= 0)
				break
			const timeoutMs = Math.max(1, Math.min(NEWS_IMAGE_REQUEST_TIMEOUT_MS, remainingMs))
			const batch = sourceImages.slice(offset, offset + 2)
			const results = await Promise.all(batch.map(image => this.syncImage(image, timeoutMs)))
			for (const image of results) {
				if (!image || seen.has(image.url))
					continue
				seen.add(image.url)
				images.push(image)
				if (images.length >= MAX_NEWS_IMAGES)
					break
			}
		}
		return images
	}

	private dto(row: NewsRow): NewsItemDto {
		const readerPath = row.reader_key ? `/ai.news/read/${row.reader_key}` : null
		const originalUrl = externalPublicUrl(row.original_url)
		const publicUrlValue = isIntermediaryUrl(row.url)
			? originalUrl || `${this.env.PUBLIC_ORIGIN}${readerPath || '/ai.news'}`
			: row.url
		const summary = row.source_id === STATION_NEWS_SOURCE_ID && row.summary
			? cleanZaihuaText(row.summary) || null
			: row.summary
		return {
			id: row.id,
			sourceId: row.source_id,
			kind: row.kind,
			title: row.title,
			summary,
			url: publicUrlValue,
			originalUrl,
			category: row.category,
			rank: row.rank,
			publishedAt: row.published_at,
			fetchedAt: row.fetched_at,
			selected: Boolean(row.selected),
			readerPath,
			contentMode: row.content_mode || null,
			coverImage: safeImages(row.images_json, this.env.MEDIA_ORIGIN)[0] || null,
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
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE
				WHEN EXISTS (SELECT 1 FROM news_exclusions WHERE item_id = ?) THEN 0
				ELSE ?
			END, ?, ?)
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
			item.id,
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
		imageCandidates?: ParsedNewsImage[]
		contentMode: NewsDocumentDto['contentMode']
		attributionName: string
		attributionUrl: string
		publishedAt: string | null
		fetchedAt: string
	}): Promise<void> {
		if (!input.bodyText.trim())
			return
		const bodyText = input.bodyText.trim().slice(0, 100_000)
		const existing = await this.env.DB.prepare('SELECT images_json FROM news_documents WHERE item_id = ?')
			.bind(input.itemId)
			.first<{ images_json: string }>()
		let images = safeImages(existing?.images_json, this.env.MEDIA_ORIGIN)
		if (input.imageCandidates) {
			if (input.imageCandidates.length === 0) {
				images = []
			}
			else {
				const synced = await this.syncImages(input.imageCandidates)
				if (synced.length || !existing)
					images = synced
			}
		}
		const imagesJson = JSON.stringify(images)
		const [readerKey, contentHash] = await Promise.all([
			sha256(input.itemId).then(value => value.slice(0, 32)),
			sha256(`${input.contentMode}\0${input.title}\0${bodyText}\0${imagesJson}`),
		])
		await this.env.DB.prepare(`
			INSERT INTO news_documents (
				item_id, reader_key, source_id, source_url, original_url, title, body_text, images_json,
				content_mode, attribution_name, attribution_url, published_at, content_hash,
				fetched_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
				images_json = CASE
					WHEN news_documents.content_hash <> excluded.content_hash THEN excluded.images_json
					ELSE news_documents.images_json
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
			imagesJson,
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

	private async fetchAiHotArticle(url: string): Promise<{ bodyText: string, images: ParsedNewsImage[] } | null> {
		try {
			const response = await fetch(url, {
				headers: { accept: 'text/html,application/xhtml+xml' },
				signal: AbortSignal.timeout(12_000),
			})
			if (!response.ok)
				return null
			return extractAiHotArticle(await response.text(), url)
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
				SELECT body_text, content_mode, images_json
				FROM news_documents WHERE item_id = ?
			`).bind(itemId).first<{
				body_text: string
				content_mode: NewsDocumentDto['contentMode']
				images_json: string
			}>()
			const existingImages = safeImages(existingDocument?.images_json, this.env.MEDIA_ORIGIN)
			const originalUrl = externalPublicUrl(entry.originalUrl) || externalPublicUrl(existing.original_url)
			const metadata = safeMetadata(existing.metadata_json)
			const sourceName = readableSourceName(
				metadataString(metadata, 'sourceName'),
				originalUrl,
				'原文来源',
			)
			let bodyText = entry.bodyText
			let contentMode = entry.contentMode
			let imageCandidates: ParsedNewsImage[] | undefined
			const needsPageBody = entry.contentMode === 'summary' && existingDocument?.content_mode !== 'full'
			const needsPageImages = existingImages.length === 0
			const pageArticle = needsPageBody || needsPageImages
				? await this.fetchAiHotArticle(sourceUrl)
				: null
			if (entry.contentMode === 'summary' && existingDocument?.content_mode === 'full') {
				bodyText = existingDocument.body_text
				contentMode = 'full'
			}
			else if (pageArticle?.bodyText) {
				bodyText = pageArticle.bodyText
				contentMode = 'full'
			}
			if (pageArticle?.images.length)
				imageCandidates = pageArticle.images
			return {
				entry,
				existing,
				itemId,
				sourceUrl,
				originalUrl,
				sourceName,
				bodyText: cleanAiHotBodyText(bodyText),
				imageCandidates,
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
				imageCandidates: value.imageCandidates,
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
		images: ParsedNewsImage[]
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
			return extractZaihuaArticle(await response.text(), url)
		}
		catch {
			return null
		}
	}

	private async syncZaihua(source: NewsSource, response: Response, fetchedAt: string): Promise<number> {
		const entries = parseRssFeed(await response.text(), 30)
			.filter(entry => publicUrl(entry.link))
		const existingRows = await this.env.DB.prepare(`
			SELECT
				n.id,
				n.title,
				n.summary,
				n.original_url,
				n.metadata_json,
				d.item_id AS document_item_id,
				d.images_json AS document_images_json,
				d.content_mode AS document_content_mode
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
			const cleanedDescription = cleanZaihuaText(entry.descriptionText)
			const shouldRefresh = isZaihuaReaderUrl(entry.link) && (
				index < 5
				|| !existing?.document_item_id
				|| safeImages(existing?.document_images_json || undefined, this.env.MEDIA_ORIGIN).length === 0
				|| previousMetadata.rssHash !== rssHash
				|| !metadataString(previousMetadata, 'sourceName')
				|| !externalPublicUrl(previousMetadata.originalUrl)
				|| isIntermediaryUrl(existing?.original_url)
			)
			const article = shouldRefresh ? await this.fetchZaihuaArticle(entry.link) : null
			return { entry, itemId, existing, previousMetadata, rssHash, cleanedDescription, article, shouldRefresh }
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
			const existingSummary = cleanZaihuaText(value.existing?.summary || '')
			const summary = value.article?.bodyText.slice(0, 5_000)
				|| (value.existing?.document_content_mode === 'full' ? existingSummary : '')
				|| value.cleanedDescription
				|| existingSummary
				|| null
			await this.upsertItem({
				id: value.itemId,
				sourceId: source.id,
				kind: 'rss',
				title,
				summary,
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
						imageCandidates: value.article.images,
						contentMode: 'full',
						attributionName: sourceName,
						attributionUrl: originalUrl || this.env.PUBLIC_ORIGIN,
						publishedAt: value.entry.publishedAt,
						fetchedAt,
					})
				}
				else if (value.cleanedDescription && (!existingDocument || value.existing?.document_content_mode === 'summary')) {
					await this.upsertDocument({
						itemId: value.itemId,
						sourceId: source.id,
						sourceUrl: url,
						originalUrl,
						title,
						bodyText: value.cleanedDescription,
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
				SELECT n.*, d.reader_key, d.content_mode, d.images_json
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
				d.fetched_at AS document_fetched_at,
				d.images_json
			FROM news_documents d
			JOIN news_items n ON n.id = d.item_id
			WHERE d.reader_key = ? AND n.selected = 1
			LIMIT 1
		`).bind(readerKey).first<DocumentRow>()
		if (!row)
			return null
		const readableSource = row.kind === 'manual'
			? externalPublicUrl(row.document_source_url)
			: isAiHotReaderUrl(row.document_source_url) || isZaihuaReaderUrl(row.document_source_url)
		if (!readableSource)
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
		const bodyText = row.source_id === STATION_NEWS_SOURCE_ID
			? cleanZaihuaText(row.body_text)
			: row.body_text
		return {
			item: this.dto(row),
			readerKey: row.reader_key,
			bodyText,
			images: safeImages(row.images_json, this.env.MEDIA_ORIGIN),
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
			SELECT
				(SELECT MAX(version) FROM (
					SELECT MAX(updated_at) AS version FROM news_items
					UNION ALL
					SELECT MAX(updated_at) AS version FROM news_sync_state
					UNION ALL
					SELECT MAX(updated_at) AS version FROM news_documents
					UNION ALL
					SELECT MAX(created_at) AS version FROM news_exclusions
				)) AS version,
				(SELECT COUNT(*) FROM news_items WHERE selected = 1) AS selected_count,
				(SELECT COUNT(*) FROM news_exclusions) AS excluded_count
		`).first<{ version: string | null, selected_count: number, excluded_count: number }>()
		return `${row?.version || 'empty'}:${row?.selected_count || 0}:${row?.excluded_count || 0}`
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
		const safeUrl = externalPublicUrl(input.url)
		if (!safeUrl)
			throw new Error('Only direct public HTTP(S) news links are allowed')
		const now = new Date().toISOString()
		const id = `manual:${crypto.randomUUID()}`
		const sourceName = readableSourceName(null, safeUrl, '原文来源')
		const bodyText = input.summary?.trim() || '这条手动精选暂未填写摘要，请通过原始来源阅读完整内容。'
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
			metadata: { manual: true, sourceName },
		})
		await this.upsertDocument({
			itemId: id,
			sourceId: 'manual',
			sourceUrl: safeUrl,
			originalUrl: safeUrl,
			title: input.title,
			bodyText,
			contentMode: 'summary',
			attributionName: sourceName,
			attributionUrl: safeUrl,
			publishedAt: input.publishedAt || now,
			fetchedAt: now,
		})
		const row = await this.env.DB.prepare(`
			SELECT n.*, d.reader_key, d.content_mode
			FROM news_items n
			LEFT JOIN news_documents d ON d.item_id = n.id
			WHERE n.id = ?
		`).bind(id).first<NewsRow>()
		if (!row)
			throw new Error('Manual news card was not persisted')
		return this.dto(row)
	}

	async deleteItem(id: string): Promise<{ id: string, title: string, kind: NewsItemDto['kind'] } | null> {
		const item = await this.env.DB.prepare('SELECT id, title, kind FROM news_items WHERE id = ?')
			.bind(id)
			.first<{ id: string, title: string, kind: NewsItemDto['kind'] }>()
		if (!item)
			return null
		const now = new Date().toISOString()
		await this.env.DB.batch([
			this.env.DB.prepare(`
				INSERT INTO news_exclusions (item_id, created_at)
				VALUES (?, ?)
				ON CONFLICT(item_id) DO UPDATE SET created_at = excluded.created_at
			`).bind(id, now),
			this.env.DB.prepare('DELETE FROM news_documents WHERE item_id = ?').bind(id),
			this.env.DB.prepare('DELETE FROM news_items WHERE id = ?').bind(id),
		])
		return item
	}

	async cleanupRetention(now = new Date()): Promise<{ deletedItems: number, deletedBriefings: number, deletedExclusions: number }> {
		const itemCutoff = new Date(now.getTime() - NEWS_RETENTION_DAYS * 86_400_000).toISOString()
		const briefingCutoff = new Date(now.getTime() - NEWS_BRIEFING_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10)
		const exclusionCutoff = new Date(now.getTime() - NEWS_EXCLUSION_RETENTION_DAYS * 86_400_000).toISOString()
		await this.env.DB.prepare(`
			DELETE FROM news_documents
			WHERE item_id IN (
				SELECT id FROM news_items
				WHERE kind <> 'manual' AND fetched_at < ?
			)
		`).bind(itemCutoff).run()
		const deletedItems = await this.env.DB.prepare(`
			DELETE FROM news_items
			WHERE kind <> 'manual' AND fetched_at < ?
		`).bind(itemCutoff).run()
		const deletedBriefings = await this.env.DB.prepare('DELETE FROM news_briefings WHERE date < ?')
			.bind(briefingCutoff)
			.run()
		const deletedExclusions = await this.env.DB.prepare(`
			DELETE FROM news_exclusions
			WHERE created_at < ?
				AND NOT EXISTS (SELECT 1 FROM news_items n WHERE n.id = news_exclusions.item_id)
		`).bind(exclusionCutoff).run()
		return {
			deletedItems: deletedItems.meta.changes || 0,
			deletedBriefings: deletedBriefings.meta.changes || 0,
			deletedExclusions: deletedExclusions.meta.changes || 0,
		}
	}

	async sync(options: { force?: boolean, sourceId?: string } = {}): Promise<NewsSyncResult> {
		if (!sourcesConfig.enabled)
			return { sources: [], syncedAt: new Date().toISOString() }
		const sources = sourcesConfig.sources
			.filter(source => source.enabled && (!options.sourceId || source.id === options.sourceId))
			.sort((left, right) => left.priority - right.priority)
		const results: NewsSyncSourceResult[] = []
		for (const source of sources) {
			this.imageSyncDeadline = Date.now() + NEWS_IMAGE_SOURCE_SYNC_BUDGET_MS
			try {
				results.push(await this.syncConfiguredSource(source, Boolean(options.force)))
			}
			finally {
				this.imageSyncDeadline = 0
			}
		}
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
