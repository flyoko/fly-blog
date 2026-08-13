import type { FinanceCategory, FinanceFlashDto, FinanceFlashListDto, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { Env } from '../../env'
import { prototypeFinanceItems } from './prototype-data'
import { WallstreetCnFinanceFlashAdapter } from './wallstreetcn'

interface FinanceFlashRow {
	id: string
	source_id: string
	title: string
	summary: string | null
	published_at: string
	category: FinanceCategory
	category_label: string
	topic: string | null
	important: number
	importance_origin: FinanceImportanceOrigin
	importance_score: number | null
	source_name: string
	source_url: string | null
	fetched_at: string
	updated_at: string
}

export interface FinanceFlashSourceItem {
	id: string
	title: string
	summary?: string | null
	publishedAt: string
	category: FinanceCategory
	categoryLabel: string
	topic?: string | null
	important: boolean
	importanceOrigin: FinanceImportanceOrigin
	importanceScore?: number | null
	sourceName: string
	sourceUrl?: string | null
}

export interface FinanceFlashAdapter {
	id: string
	prototype: boolean
	fetch: () => Promise<FinanceFlashSourceItem[]>
}

export class PrototypeFinanceFlashAdapter implements FinanceFlashAdapter {
	readonly id = 'prototype-finance-7x24'
	readonly prototype = true

	async fetch(): Promise<FinanceFlashSourceItem[]> {
		return prototypeFinanceItems
	}
}

export interface FinanceSyncResult {
	sourceId: string
	status: 'success' | 'failed'
	itemCount: number
	error?: string
}

export class FinanceFlashService {
	constructor(
		private readonly env: Env,
		private readonly adapter: FinanceFlashAdapter = new WallstreetCnFinanceFlashAdapter(),
		private readonly fallbackAdapter: FinanceFlashAdapter = new PrototypeFinanceFlashAdapter(),
	) {}

	get prototype() {
		return this.adapter.prototype
	}

	private dto(row: FinanceFlashRow): FinanceFlashDto {
		return {
			id: row.id,
			sourceId: row.source_id,
			title: row.title,
			summary: row.summary,
			publishedAt: row.published_at,
			category: row.category,
			categoryLabel: row.category_label,
			topic: row.topic,
			important: Boolean(row.important),
			importanceOrigin: row.importance_origin,
			importanceScore: row.importance_score,
			sourceName: row.source_name,
			sourceUrl: row.source_url,
		}
	}

	private async syncAdapter(adapter: FinanceFlashAdapter): Promise<FinanceSyncResult> {
		const now = new Date().toISOString()
		try {
			const items = await adapter.fetch()
			if (!items.length)
				throw new Error('Finance source returned no usable items')
			const statements = [
				this.env.DB.prepare('DELETE FROM finance_flash_items WHERE source_id = ?').bind(adapter.id),
				...items.map(item => this.env.DB.prepare(`
					INSERT INTO finance_flash_items (
						id, source_id, title, summary, published_at, category, category_label, topic,
						important, importance_origin, importance_score, source_name, source_url, fetched_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`).bind(
					`${adapter.id}:${item.id}`,
					adapter.id,
					item.title,
					item.summary || null,
					item.publishedAt,
					item.category,
					item.categoryLabel,
					item.topic || null,
					item.important ? 1 : 0,
					item.importanceOrigin,
					item.importanceScore ?? null,
					item.sourceName,
					item.sourceUrl || null,
					now,
					now,
				)),
				this.env.DB.prepare(`
					INSERT INTO finance_flash_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
					VALUES (?, 'success', ?, ?, NULL, ?)
					ON CONFLICT(source_id) DO UPDATE SET
						status = 'success', item_count = excluded.item_count,
						last_success_at = excluded.last_success_at, last_error = NULL,
						updated_at = excluded.updated_at
				`).bind(adapter.id, items.length, now, now),
			]
			await this.env.DB.batch(statements)
			if (!adapter.prototype && this.fallbackAdapter.id !== adapter.id) {
				await this.env.DB.batch([
					this.env.DB.prepare('DELETE FROM finance_flash_items WHERE source_id = ?').bind(this.fallbackAdapter.id),
					this.env.DB.prepare('DELETE FROM finance_flash_sync_state WHERE source_id = ?').bind(this.fallbackAdapter.id),
				])
			}
			return { sourceId: adapter.id, status: 'success', itemCount: items.length }
		}
		catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause)
			await this.env.DB.prepare(`
				INSERT INTO finance_flash_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
				VALUES (?, 'failed', 0, NULL, ?, ?)
				ON CONFLICT(source_id) DO UPDATE SET
					status = 'failed', last_error = excluded.last_error, updated_at = excluded.updated_at
			`).bind(adapter.id, message.slice(0, 2_000), now).run()
			return { sourceId: adapter.id, status: 'failed', itemCount: 0, error: message }
		}
	}

	async sync(): Promise<FinanceSyncResult> {
		return this.syncAdapter(this.adapter)
	}

	async ensureSeeded(): Promise<void> {
		const snapshot = await this.env.DB.prepare(`
			SELECT COUNT(*) AS count,
				SUM(CASE WHEN importance_origin = 'prototype' THEN 1 ELSE 0 END) AS prototype_count
			FROM finance_flash_items
		`).first<{ count: number, prototype_count: number | null }>()
		const itemCount = snapshot?.count || 0
		const prototypeCount = snapshot?.prototype_count || 0
		if (itemCount > 0 && prototypeCount !== itemCount)
			return

		if (itemCount > 0 && !this.adapter.prototype) {
			const state = await this.env.DB.prepare('SELECT updated_at FROM finance_flash_sync_state WHERE source_id = ?')
				.bind(this.adapter.id)
				.first<{ updated_at: string | null }>()
			const lastAttempt = state?.updated_at ? new Date(state.updated_at).getTime() : 0
			if (lastAttempt && Date.now() - lastAttempt < 60_000)
				return
		}

		const primary = await this.sync()
		if (primary.status === 'success')
			return
		if (itemCount > 0)
			return
		if (this.adapter.prototype || this.fallbackAdapter.id === this.adapter.id)
			throw new Error(primary.error || 'Finance sync failed')

		const fallback = await this.syncAdapter(this.fallbackAdapter)
		if (fallback.status === 'failed')
			throw new Error(fallback.error || primary.error || 'Finance fallback sync failed')
	}

	async list(options: { importantOnly?: boolean, category?: FinanceCategory, limit?: number } = {}): Promise<FinanceFlashListDto> {
		const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 50)))
		const conditions: string[] = []
		const bindings: Array<string | number> = []
		if (options.importantOnly)
			conditions.push('important = 1')
		if (options.category) {
			conditions.push('category = ?')
			bindings.push(options.category)
		}
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
		const [items, total, state, sourceMix] = await Promise.all([
			this.env.DB.prepare(`
				SELECT * FROM finance_flash_items
				${where}
				ORDER BY published_at DESC, id DESC
				LIMIT ?
			`).bind(...bindings, limit).all<FinanceFlashRow>(),
			this.env.DB.prepare(`SELECT COUNT(*) AS total FROM finance_flash_items ${where}`)
				.bind(...bindings)
				.first<{ total: number }>(),
			this.env.DB.prepare('SELECT MAX(last_success_at) AS updated_at FROM finance_flash_sync_state WHERE last_success_at IS NOT NULL')
				.first<{ updated_at: string | null }>(),
			this.env.DB.prepare(`
				SELECT COUNT(*) AS total,
					SUM(CASE WHEN importance_origin = 'prototype' THEN 1 ELSE 0 END) AS prototype_count
				FROM finance_flash_items
			`).first<{ total: number, prototype_count: number | null }>(),
		])
		const storedTotal = sourceMix?.total || 0
		const prototypeCount = sourceMix?.prototype_count || 0
		return {
			items: items.results.map(row => this.dto(row)),
			total: total?.total || 0,
			updatedAt: state?.updated_at || null,
			prototype: storedTotal > 0 && prototypeCount === storedTotal,
		}
	}

	async listVersion(): Promise<string> {
		const row = await this.env.DB.prepare(`
			SELECT MAX(updated_at) AS version, COUNT(*) AS item_count
			FROM finance_flash_items
		`).first<{ version: string | null, item_count: number }>()
		return `${row?.version || 'empty'}:${row?.item_count || 0}`
	}
}
