import type { NewsItemDto } from '../../../../../shared/admin/news'
import type { NewsSourcesConfig } from '../../../../../shared/admin/site-config'
import type { Env } from '../../env'
import sourcesRaw from '../../../../../config/news/sources.json'
import { newsSourcesConfigSchema } from '../../../../../shared/admin/site-config'
import { isPublicHttpUrl } from '../../../../../shared/utils/public-url'
import { ApiError } from '../../lib/api-error'

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
}

const sources: NewsSourcesConfig = newsSourcesConfigSchema.parse(sourcesRaw)

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : ''
}

function publicUrl(value: unknown): string {
	const candidate = text(value)
	return isPublicHttpUrl(candidate) ? candidate : ''
}

function xmlDecode(value: string): string {
	return value
		.replaceAll('<![CDATA[', '')
		.replaceAll(']]>', '')
		.replaceAll('&amp;', '&')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&#39;', '\'')
		.replace(/<[^>]+>/gu, '')
		.trim()
}

function rssItems(xml: string, sourceId: string, fetchedAt: string): NewsItemDto[] {
	return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gu)].slice(0, 30).map((match) => {
		const block = match[1] || ''
		const field = (name: string) => xmlDecode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'u'))?.[1] || '')
		const url = publicUrl(field('link'))
		const published = new Date(field('pubDate'))
		return {
			id: `${sourceId}:${url || field('guid')}`,
			sourceId,
			kind: 'rss' as const,
			title: field('title').slice(0, 500),
			summary: field('description').slice(0, 5000) || null,
			url,
			originalUrl: url,
			category: '站长资讯',
			rank: null,
			publishedAt: Number.isNaN(published.getTime()) ? null : published.toISOString(),
			fetchedAt,
			selected: true,
		}
	}).filter(item => item.title && item.url)
}

function hotItems(payload: unknown, sourceId: string, fetchedAt: string): NewsItemDto[] {
	const items = Array.isArray((payload as { items?: unknown[] })?.items) ? (payload as { items: unknown[] }).items : []
	return items.slice(0, 30).map((raw, index) => {
		const item = raw as Record<string, unknown>
		const links = (item.links || {}) as Record<string, unknown>
		const originalUrl = publicUrl(links.original)
		const url = publicUrl(links.aihot) || originalUrl
		return {
			id: `${sourceId}:${text(item.id) || url}`,
			sourceId,
			kind: 'hot' as const,
			title: text(item.title).slice(0, 500),
			summary: null,
			url,
			originalUrl: originalUrl || null,
			category: 'AI 热点',
			rank: Number.isInteger(item.rank) ? Number(item.rank) : index + 1,
			publishedAt: text(item.latestAt) || null,
			fetchedAt,
			selected: true,
		}
	}).filter(item => item.title && item.url.startsWith('http'))
}

function daily(payload: unknown, fetchedAt: string) {
	const report = (payload as { report?: Record<string, unknown> })?.report
	if (!report)
		return null
	const links = (report.links || {}) as Record<string, unknown>
	return {
		date: text(report.date),
		title: `AI 日报 · ${text(report.date)}`,
		lead: text(report.lead) || null,
		content: report.sections || [],
		sourceUrl: publicUrl(links.aihot),
		generatedAt: text(report.generatedAt) || fetchedAt,
		fetchedAt,
	}
}

export class NewsService {
	constructor(private readonly env: Env) {}

	async sync() {
		const enabled = sources.sources.filter(source => sources.enabled && source.enabled)
		const results = await Promise.all(enabled.map(source => this.syncSource(source)))
		return { sources: results, syncedAt: new Date().toISOString() }
	}

	async list(page = 1, pageSize = 30) {
		const count = await this.env.DB.prepare('SELECT COUNT(*) AS count FROM news_items WHERE selected = 1').first<{ count: number }>()
		const rows = await this.env.DB.prepare(`
			SELECT * FROM news_items WHERE selected = 1
			ORDER BY CASE kind WHEN 'manual' THEN 0 WHEN 'hot' THEN 1 WHEN 'daily' THEN 2 ELSE 3 END,
				COALESCE(published_at, fetched_at) DESC, COALESCE(rank, 9999), id DESC
			LIMIT ? OFFSET ?
		`).bind(pageSize, (page - 1) * pageSize).all<NewsRow>()
		const briefing = await this.env.DB.prepare('SELECT * FROM news_briefings ORDER BY date DESC LIMIT 1').first()
		const state = await this.env.DB.prepare('SELECT * FROM news_sync_state ORDER BY source_id').all()
		return { items: rows.results.map(row => this.dto(row)), total: count?.count ?? 0, page, pageSize, briefing, sources: state.results }
	}

	async addManual(input: { title: string, summary?: string, url: string, category?: string, publishedAt?: string }) {
		const at = new Date().toISOString()
		const id = `manual:${crypto.randomUUID()}`
		await this.env.DB.prepare(`
			INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, published_at, fetched_at, selected)
			VALUES (?, 'manual', 'manual', ?, ?, ?, ?, ?, ?, ?, 1)
		`).bind(id, input.title, input.summary ?? null, input.url, input.url, input.category ?? '手动精选', input.publishedAt ?? at, at).run()
		return (await this.env.DB.prepare('SELECT * FROM news_items WHERE id = ?').bind(id).first<NewsRow>())!
	}

	private async syncSource(source: NewsSourcesConfig['sources'][number]) {
		const fetchedAt = new Date().toISOString()
		try {
			const response = await fetch(source.url, { headers: { 'user-agent': 'fly-living-news/1.0', 'accept': source.type === 'rss' ? 'application/rss+xml, application/xml' : 'application/json' } })
			if (!response.ok)
				throw new ApiError('UPSTREAM_FAILED', 502, `${source.title} returned ${response.status}`)
			let items: NewsItemDto[] = []
			if (source.type === 'rss') {
				items = rssItems(await response.text(), source.id, fetchedAt)
			}
			else {
				const payload = await response.json()
				if (source.id === 'ai-hot-daily') {
					const report = daily(payload, fetchedAt)
					if (report?.date && report.sourceUrl) {
						await this.env.DB.prepare(`
							INSERT INTO news_briefings (date, title, lead, content_json, source_url, generated_at, fetched_at)
							VALUES (?, ?, ?, ?, ?, ?, ?)
							ON CONFLICT(date) DO UPDATE SET title = excluded.title, lead = excluded.lead,
								content_json = excluded.content_json, source_url = excluded.source_url,
								generated_at = excluded.generated_at, fetched_at = excluded.fetched_at
						`).bind(report.date, report.title, report.lead, JSON.stringify(report.content), report.sourceUrl, report.generatedAt, report.fetchedAt).run()
					}
				}
				else {
					items = hotItems(payload, source.id, fetchedAt)
				}
			}
			for (const item of items) {
				await this.env.DB.prepare(`
					INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, rank, published_at, fetched_at, selected)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
					ON CONFLICT(id) DO UPDATE SET title = excluded.title, summary = excluded.summary,
						url = excluded.url, original_url = excluded.original_url, category = excluded.category,
						rank = excluded.rank, published_at = excluded.published_at, fetched_at = excluded.fetched_at
				`).bind(item.id, item.sourceId, item.kind, item.title, item.summary, item.url, item.originalUrl, item.category, item.rank, item.publishedAt, item.fetchedAt).run()
			}
			await this.setState(source.id, 'success', items.length, null, fetchedAt)
			return { id: source.id, status: 'success', count: items.length }
		}
		catch (error) {
			const message = error instanceof Error ? error.message : 'News source failed'
			await this.setState(source.id, 'failed', 0, message, fetchedAt)
			return { id: source.id, status: 'failed', count: 0, error: message }
		}
	}

	private async setState(sourceId: string, status: string, count: number, error: string | null, at: string) {
		await this.env.DB.prepare(`
			INSERT INTO news_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
			VALUES (?, ?, ?, CASE WHEN ? = 'success' THEN ? ELSE NULL END, ?, ?)
			ON CONFLICT(source_id) DO UPDATE SET status = excluded.status, item_count = excluded.item_count,
				last_success_at = CASE WHEN excluded.status = 'success' THEN excluded.updated_at ELSE news_sync_state.last_success_at END,
				last_error = excluded.last_error, updated_at = excluded.updated_at
		`).bind(sourceId, status, count, status, at, error, at).run()
	}

	private dto(row: NewsRow): NewsItemDto {
		return { id: row.id, sourceId: row.source_id, kind: row.kind, title: row.title, summary: row.summary, url: row.url, originalUrl: row.original_url, category: row.category, rank: row.rank, publishedAt: row.published_at, fetchedAt: row.fetched_at, selected: Boolean(row.selected) }
	}
}
