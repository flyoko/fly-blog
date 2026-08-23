import type { AdminFinanceFlashDto, AdminFinanceFlashListDto, FinanceAdminVisibility, FinanceCategory, FinanceFlashDto, FinanceFlashListDto, FinanceFlashQuality, FinanceImportanceOrigin } from '../../../../../shared/admin/finance'
import type { Env } from '../../env'
import { ClsFinanceFlashAdapter } from './cls'
import { groupFinanceEvents } from './dedupe'
import { Jin10FinanceFlashAdapter } from './jin10'
import { prototypeFinanceItems } from './prototype-data'
import { WallstreetCnFinanceFlashAdapter } from './wallstreetcn'

const FINANCE_EXCLUSION_RETENTION_DAYS = 180

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
	public_visible: number
	fetched_at: string
	updated_at: string
}

interface AdminFinanceFlashRow extends FinanceFlashRow {
	hidden_at: string | null
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
	publicVisible?: boolean
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
	status: 'success' | 'failed' | 'skipped'
	itemCount: number
	changedCount?: number
	deletedCount?: number
	unchangedCount?: number
	reason?: 'missing-secret'
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

	private publicRowCondition(alias = 'f'): string {
		const prefix = alias ? `${alias}.` : ''
		const visible = `${prefix}public_visible = 1`
		return this.adapter.prototype ? visible : `${visible} AND ${prefix}importance_origin <> 'prototype'`
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

	private adminDto(row: AdminFinanceFlashRow): AdminFinanceFlashDto {
		return {
			...this.dto(row),
			publicVisible: Boolean(row.public_visible),
			hidden: Boolean(row.hidden_at),
			hiddenAt: row.hidden_at,
		}
	}

	private async syncAdapter(adapter: FinanceFlashAdapter, options: { replaceFallback?: boolean } = {}): Promise<FinanceSyncResult> {
		const now = new Date().toISOString()
		try {
			const items = await adapter.fetch()
			if (!items.length)
				throw new Error('Finance source returned no usable items')

			const existing = await this.env.DB.prepare('SELECT * FROM finance_flash_items WHERE source_id = ?')
				.bind(adapter.id)
				.all<FinanceFlashRow>()
			const existingById = new Map(existing.results.map(row => [row.id, row]))
			const incomingIds = new Set<string>()
			const changedItems: Array<{ id: string, item: FinanceFlashSourceItem }> = []

			for (const item of items) {
				const id = `${adapter.id}:${item.id}`
				incomingIds.add(id)
				const row = existingById.get(id)
				const unchanged = row
					&& row.title === item.title
					&& row.summary === (item.summary || null)
					&& row.published_at === item.publishedAt
					&& row.category === item.category
					&& row.category_label === item.categoryLabel
					&& row.topic === (item.topic || null)
					&& Boolean(row.important) === item.important
					&& row.importance_origin === item.importanceOrigin
					&& row.importance_score === (item.importanceScore ?? null)
					&& row.source_name === item.sourceName
					&& row.source_url === (item.sourceUrl || null)
					&& Boolean(row.public_visible) === (item.publicVisible ?? true)
				if (!unchanged)
					changedItems.push({ id, item })
			}

			const staleIds = existing.results
				.filter(row => !incomingIds.has(row.id))
				.map(row => row.id)
			const statements = changedItems.map(({ id, item }) => this.env.DB.prepare(`
				INSERT INTO finance_flash_items (
					id, source_id, title, summary, published_at, category, category_label, topic,
					important, importance_origin, importance_score, source_name, source_url, fetched_at, updated_at,
					public_visible
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(id) DO UPDATE SET
					title = excluded.title, summary = excluded.summary, published_at = excluded.published_at,
					category = excluded.category, category_label = excluded.category_label, topic = excluded.topic,
					important = excluded.important, importance_origin = excluded.importance_origin,
					importance_score = excluded.importance_score, source_name = excluded.source_name,
					source_url = excluded.source_url, public_visible = excluded.public_visible,
					fetched_at = excluded.fetched_at, updated_at = excluded.updated_at
			`).bind(
				id,
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
				item.publicVisible === false ? 0 : 1,
			))

			if (staleIds.length) {
				const placeholders = staleIds.map(() => '?').join(', ')
				statements.push(this.env.DB.prepare(`DELETE FROM finance_flash_items WHERE source_id = ? AND id IN (${placeholders})`)
					.bind(adapter.id, ...staleIds))
			}

			statements.push(this.env.DB.prepare(`
				INSERT INTO finance_flash_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
				VALUES (?, 'success', ?, ?, NULL, ?)
				ON CONFLICT(source_id) DO UPDATE SET
					status = 'success', item_count = excluded.item_count,
					last_success_at = excluded.last_success_at, last_error = NULL,
					updated_at = excluded.updated_at
			`).bind(adapter.id, items.length, now, now))
			await this.env.DB.batch(statements)

			if (options.replaceFallback && !adapter.prototype && this.fallbackAdapter.id !== adapter.id) {
				await this.env.DB.batch([
					this.env.DB.prepare('DELETE FROM finance_flash_items WHERE source_id = ?').bind(this.fallbackAdapter.id),
					this.env.DB.prepare('DELETE FROM finance_flash_sync_state WHERE source_id = ?').bind(this.fallbackAdapter.id),
				])
			}
			return {
				sourceId: adapter.id,
				status: 'success',
				itemCount: items.length,
				changedCount: changedItems.length,
				deletedCount: staleIds.length,
				unchangedCount: items.length - changedItems.length,
			}
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
		return this.syncAdapter(this.adapter, { replaceFallback: true })
	}

	async syncAll(): Promise<FinanceSyncResult[]> {
		const results: FinanceSyncResult[] = []
		const jin10 = new Jin10FinanceFlashAdapter(
			this.env.JIN10_MCP_TOKEN,
			undefined,
			this.env.JIN10_PUBLIC_VISIBLE?.trim().toLowerCase() === 'true',
		)
		if (jin10.enabled) {
			results.push(await this.syncAdapter(jin10))
		}
		else {
			results.push({
				sourceId: jin10.id,
				status: 'skipped',
				itemCount: 0,
				reason: 'missing-secret',
			})
		}
		results.push(await this.syncAdapter(new ClsFinanceFlashAdapter()))
		results.push(await this.sync())
		return results
	}

	async ensureSeeded(): Promise<void> {
		const publicRowCondition = this.publicRowCondition('f')
		const snapshot = await this.env.DB.prepare(`
			SELECT COUNT(*) AS count
			FROM finance_flash_items f
			WHERE ${publicRowCondition}
		`).first<{ count: number }>()
		const itemCount = snapshot?.count || 0
		if (itemCount > 0)
			return

		if (!this.adapter.prototype) {
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
		if (this.adapter.prototype)
			throw new Error(primary.error || 'Finance sync failed')
		// 实时来源不可用时保持空列表或最后成功快照，不生成 prototype 新闻。
	}

	async list(options: { importantOnly?: boolean, category?: FinanceCategory, limit?: number } = {}): Promise<FinanceFlashListDto> {
		const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 50)))
		const rawLimit = 500
		const publicRowCondition = this.publicRowCondition('f')
		const conditions = [
			publicRowCondition,
			'NOT EXISTS (SELECT 1 FROM finance_flash_exclusions e WHERE e.item_id = f.id AND e.restored_at IS NULL)',
		]
		const bindings: Array<string | number> = []
		if (options.category) {
			conditions.push('f.category = ?')
			bindings.push(options.category)
		}
		const where = `WHERE ${conditions.join(' AND ')}`
		const [items, state, sourceMix, sourceHealth] = await Promise.all([
			this.env.DB.prepare(`
				SELECT f.* FROM finance_flash_items f
				${where}
				ORDER BY f.published_at DESC, f.id DESC
				LIMIT ?
			`).bind(...bindings, rawLimit).all<FinanceFlashRow>(),
			this.env.DB.prepare(`
				SELECT MAX(s.last_success_at) AS updated_at
				FROM finance_flash_sync_state s
				WHERE s.last_success_at IS NOT NULL
					AND EXISTS (
						SELECT 1 FROM finance_flash_items f
						WHERE f.source_id = s.source_id AND ${publicRowCondition}
					)
			`)
				.first<{ updated_at: string | null }>(),
			this.env.DB.prepare(`
				SELECT COUNT(*) AS total,
				SUM(CASE WHEN f.importance_origin = 'prototype' THEN 1 ELSE 0 END) AS prototype_count
				FROM finance_flash_items f
				WHERE ${publicRowCondition}
			`).first<{ total: number, prototype_count: number | null }>(),
			this.env.DB.prepare(`
				SELECT
					SUM(CASE WHEN s.status = 'success' THEN 1 ELSE 0 END) AS success_count,
					SUM(CASE WHEN s.status = 'failed' THEN 1 ELSE 0 END) AS failed_count
				FROM finance_flash_sync_state s
				WHERE EXISTS (
					SELECT 1 FROM finance_flash_items f
					WHERE f.source_id = s.source_id AND ${publicRowCondition}
				)
			`).first<{ success_count: number | null, failed_count: number | null }>(),
		])
		const groupedItems = groupFinanceEvents(items.results.map(row => this.dto(row)))
		const filteredItems = options.importantOnly
			? groupedItems.filter(item => item.important)
			: groupedItems
		const storedTotal = sourceMix?.total || 0
		const prototypeCount = sourceMix?.prototype_count || 0
		const prototype = storedTotal > 0 && prototypeCount === storedTotal
		const successCount = sourceHealth?.success_count || 0
		const failedCount = sourceHealth?.failed_count || 0
		const quality: FinanceFlashQuality = storedTotal === 0
			? 'unavailable'
			: prototype
				? 'prototype'
				: failedCount > 0 && successCount === 0
					? 'stale'
					: failedCount > 0
						? 'degraded'
						: 'live'
		return {
			items: filteredItems.slice(0, limit),
			total: filteredItems.length,
			updatedAt: state?.updated_at || null,
			prototype,
			stale: quality === 'stale',
			quality,
		}
	}

	async adminList(options: {
		importantOnly?: boolean
		category?: FinanceCategory
		visibility?: FinanceAdminVisibility
		query?: string
		limit?: number
	} = {}): Promise<AdminFinanceFlashListDto> {
		const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 100)))
		const conditions: string[] = []
		const bindings: Array<string | number> = []
		if (options.importantOnly)
			conditions.push('f.important = 1')
		if (options.category) {
			conditions.push('f.category = ?')
			bindings.push(options.category)
		}
		if (options.visibility === 'visible')
			conditions.push('(e.item_id IS NULL OR e.restored_at IS NOT NULL)')
		else if (options.visibility === 'hidden')
			conditions.push('(e.item_id IS NOT NULL AND e.restored_at IS NULL)')
		const query = options.query?.trim()
		if (query) {
			conditions.push(`(
				f.title LIKE ? OR COALESCE(f.summary, '') LIKE ? OR f.category_label LIKE ?
				OR COALESCE(f.topic, '') LIKE ? OR f.source_name LIKE ?
			)`)
			const like = `%${query.slice(0, 120)}%`
			bindings.push(like, like, like, like, like)
		}
		const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
		const [items, total, counts, state, sourceMix] = await Promise.all([
			this.env.DB.prepare(`
				SELECT f.*, CASE WHEN e.restored_at IS NULL THEN e.created_at ELSE NULL END AS hidden_at
				FROM finance_flash_items f
				LEFT JOIN finance_flash_exclusions e ON e.item_id = f.id
				${where}
				ORDER BY f.published_at DESC, f.id DESC
				LIMIT ?
			`).bind(...bindings, limit).all<AdminFinanceFlashRow>(),
			this.env.DB.prepare(`
				SELECT COUNT(*) AS total
				FROM finance_flash_items f
				LEFT JOIN finance_flash_exclusions e ON e.item_id = f.id
				${where}
			`).bind(...bindings).first<{ total: number }>(),
			this.env.DB.prepare(`
				SELECT
					SUM(CASE WHEN e.item_id IS NULL OR e.restored_at IS NOT NULL THEN 1 ELSE 0 END) AS visible_total,
					SUM(CASE WHEN e.item_id IS NOT NULL AND e.restored_at IS NULL THEN 1 ELSE 0 END) AS hidden_total
				FROM finance_flash_items f
				LEFT JOIN finance_flash_exclusions e ON e.item_id = f.id
			`).first<{ visible_total: number | null, hidden_total: number | null }>(),
			this.env.DB.prepare('SELECT MAX(last_success_at) AS updated_at FROM finance_flash_sync_state WHERE last_success_at IS NOT NULL')
				.first<{ updated_at: string | null }>(),
			this.env.DB.prepare(`
				SELECT COUNT(*) AS total,
					SUM(CASE WHEN importance_origin = 'prototype' THEN 1 ELSE 0 END) AS prototype_count
				FROM finance_flash_items
			`).first<{ total: number, prototype_count: number | null }>(),
		])
		const storedTotal = sourceMix?.total || 0
		return {
			items: items.results.map(row => this.adminDto(row)),
			total: total?.total || 0,
			visibleTotal: counts?.visible_total || 0,
			hiddenTotal: counts?.hidden_total || 0,
			updatedAt: state?.updated_at || null,
			prototype: storedTotal > 0 && (sourceMix?.prototype_count || 0) === storedTotal,
		}
	}

	async hideItem(id: string): Promise<AdminFinanceFlashDto | null> {
		const item = await this.env.DB.prepare('SELECT * FROM finance_flash_items WHERE id = ?')
			.bind(id)
			.first<FinanceFlashRow>()
		if (!item)
			return null
		const now = new Date().toISOString()
		await this.env.DB.prepare(`
			INSERT INTO finance_flash_exclusions (item_id, created_at, restored_at)
			VALUES (?, ?, NULL)
			ON CONFLICT(item_id) DO UPDATE SET created_at = excluded.created_at, restored_at = NULL
		`).bind(id, now).run()
		return this.adminDto({ ...item, hidden_at: now })
	}

	async restoreItem(id: string): Promise<AdminFinanceFlashDto | null> {
		const item = await this.env.DB.prepare(`
			SELECT f.*, CASE WHEN e.restored_at IS NULL THEN e.created_at ELSE NULL END AS hidden_at
			FROM finance_flash_items f
			JOIN finance_flash_exclusions e ON e.item_id = f.id
			WHERE f.id = ? AND e.restored_at IS NULL
		`).bind(id).first<AdminFinanceFlashRow>()
		if (!item)
			return null
		const now = new Date().toISOString()
		await this.env.DB.prepare('UPDATE finance_flash_exclusions SET restored_at = ? WHERE item_id = ?')
			.bind(now, id)
			.run()
		return this.adminDto({ ...item, hidden_at: null })
	}

	async cleanupRetention(now = new Date()): Promise<{ deletedExclusions: number }> {
		const cutoff = new Date(now.getTime() - FINANCE_EXCLUSION_RETENTION_DAYS * 86_400_000).toISOString()
		const result = await this.env.DB.prepare(`
			DELETE FROM finance_flash_exclusions
			WHERE COALESCE(restored_at, created_at) < ?
				AND NOT EXISTS (SELECT 1 FROM finance_flash_items f WHERE f.id = finance_flash_exclusions.item_id)
		`).bind(cutoff).run()
		return { deletedExclusions: result.meta.changes || 0 }
	}

	async status() {
		interface SourceHealth {
			source_id: string
			status: 'success' | 'failed' | 'pending' | 'disabled'
			item_count: number
			last_success_at: string | null
			last_error: string | null
			updated_at: string | null
		}
		const [sources, list] = await Promise.all([
			this.env.DB.prepare(`
				SELECT source_id, status, item_count, last_success_at, last_error, updated_at
				FROM finance_flash_sync_state
				ORDER BY updated_at DESC, source_id ASC
			`).all<SourceHealth>(),
			this.list({ limit: 1 }),
		])
		const sourceMap = new Map(sources.results.map(source => [source.source_id, source]))
		const pending = (sourceId: string): SourceHealth => ({
			source_id: sourceId,
			status: 'pending',
			item_count: 0,
			last_success_at: null,
			last_error: null,
			updated_at: null,
		})
		const disabled = (sourceId: string): SourceHealth => ({
			...sourceMap.get(sourceId),
			source_id: sourceId,
			status: 'disabled',
			item_count: sourceMap.get(sourceId)?.item_count || 0,
			last_success_at: sourceMap.get(sourceId)?.last_success_at || null,
			last_error: null,
			updated_at: sourceMap.get(sourceId)?.updated_at || null,
		})

		if (!sourceMap.has(this.adapter.id))
			sourceMap.set(this.adapter.id, pending(this.adapter.id))
		if (this.env.JIN10_MCP_TOKEN?.trim()) {
			if (!sourceMap.has('jin10-mcp-7x24'))
				sourceMap.set('jin10-mcp-7x24', pending('jin10-mcp-7x24'))
		}
		else {
			sourceMap.set('jin10-mcp-7x24', disabled('jin10-mcp-7x24'))
		}
		if (!sourceMap.has('cls-telegraph-7x24'))
			sourceMap.set('cls-telegraph-7x24', pending('cls-telegraph-7x24'))

		return {
			sources: [...sourceMap.values()],
			total: list.total,
			updatedAt: list.updatedAt,
			prototype: list.prototype,
		}
	}

	async listVersion(): Promise<string> {
		const publicRowCondition = this.publicRowCondition('f')
		const row = await this.env.DB.prepare(`
			SELECT
				(SELECT MAX(version) FROM (
					SELECT MAX(f.updated_at) AS version
					FROM finance_flash_items f
					WHERE ${publicRowCondition}
					UNION ALL
					SELECT MAX(COALESCE(e.restored_at, e.created_at)) AS version
					FROM finance_flash_exclusions e
					JOIN finance_flash_items f ON f.id = e.item_id
					WHERE ${publicRowCondition}
				)) AS version,
				(SELECT COUNT(*) FROM finance_flash_items f WHERE ${publicRowCondition}) AS item_count,
				(SELECT COUNT(*)
				 FROM finance_flash_exclusions e
				 JOIN finance_flash_items f ON f.id = e.item_id
				 WHERE e.restored_at IS NULL AND ${publicRowCondition}) AS exclusion_count,
				(SELECT MAX(s.updated_at)
				 FROM finance_flash_sync_state s
				 WHERE EXISTS (
					 SELECT 1 FROM finance_flash_items f
					 WHERE f.source_id = s.source_id AND ${publicRowCondition}
				 )) AS source_state_version,
				(SELECT COUNT(*)
				 FROM finance_flash_sync_state s
				 WHERE s.status = 'success'
					 AND EXISTS (
						 SELECT 1 FROM finance_flash_items f
						 WHERE f.source_id = s.source_id AND ${publicRowCondition}
					 )) AS success_count,
				(SELECT COUNT(*)
				 FROM finance_flash_sync_state s
				 WHERE s.status = 'failed'
					 AND EXISTS (
						 SELECT 1 FROM finance_flash_items f
						 WHERE f.source_id = s.source_id AND ${publicRowCondition}
					 )) AS failed_count
		`).first<{
			version: string | null
			item_count: number
			exclusion_count: number
			source_state_version: string | null
			success_count: number
			failed_count: number
		}>()
		return `${row?.version || 'empty'}:${row?.item_count || 0}:${row?.exclusion_count || 0}:${row?.source_state_version || 'no-state'}:${row?.success_count || 0}:${row?.failed_count || 0}`
	}
}
