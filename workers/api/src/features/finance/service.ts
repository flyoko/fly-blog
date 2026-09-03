import type { AdminFinanceFlashDto, AdminFinanceFlashListDto, FinanceAdminVisibility, FinanceCategory, FinanceFlashDto, FinanceFlashListDto, FinanceFlashQuality, FinanceImportanceOrigin, FinanceSourceId, FinanceSourceSettingDto, FinanceTodayThemesDto } from '../../../../../shared/admin/finance'
import type { Env } from '../../env'
import { financeSourceIds } from '../../../../../shared/admin/finance'
import { ApiError } from '../../lib/api-error'
import { preparePublicCacheVersionBump, readPublicCacheVersion } from '../../lib/public-cache-version'
import { AuditRepository } from '../../repositories/audit-repository'
import { ClsFinanceFlashAdapter } from './cls'
import { groupFinanceEvents } from './dedupe'
import { Jin10FinanceFlashAdapter } from './jin10'
import { prototypeFinanceItems } from './prototype-data'
import { WallstreetCnFinanceFlashAdapter } from './wallstreetcn'

const FINANCE_EXCLUSION_RETENTION_DAYS = 180
const FINANCE_FLASH_RETENTION_MS = 16 * 60 * 60_000

const FINANCE_SOURCES: ReadonlyArray<{ sourceId: FinanceSourceId, sourceName: string }> = [
	{ sourceId: 'cls-telegraph-7x24', sourceName: '财联社' },
	{ sourceId: 'jin10-mcp-7x24', sourceName: '金十数据' },
	{ sourceId: 'wallstreetcn-7x24', sourceName: '华尔街见闻' },
]
const FINANCE_ROLLING_SOURCE_IDS = new Set<string>(financeSourceIds)
const FINANCE_GROUPING_SELECT_COLUMNS = `
\tf.id, f.source_id, f.title, NULL AS summary, f.published_at,
\tf.category, f.category_label, f.topic, f.important, f.importance_origin,
\tf.importance_score, f.source_name, f.source_url, f.public_visible,
\tf.fetched_at, f.updated_at
`

interface FinanceSourceSettingRow {
	source_id: FinanceSourceId
	enabled: number
	updated_at: string
}

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
	reason?: 'missing-secret' | 'disabled'
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
		const conditions = [`${prefix}public_visible = 1`]
		if (!this.adapter.prototype)
			conditions.push(`${prefix}importance_origin <> 'prototype'`)
		conditions.push(`NOT EXISTS (
			SELECT 1 FROM finance_source_settings source_setting
			WHERE source_setting.source_id = ${prefix}source_id AND source_setting.enabled = 0
		)`)
		return conditions.join(' AND ')
	}

	async sourceSettings(): Promise<FinanceSourceSettingDto[]> {
		const rows = await this.env.DB.prepare(`
			SELECT source_id, enabled, updated_at
			FROM finance_source_settings
			WHERE source_id IN (?, ?, ?)
		`).bind(...financeSourceIds).all<FinanceSourceSettingRow>()
		const rowMap = new Map(rows.results.map(row => [row.source_id, row]))
		return FINANCE_SOURCES.map((source) => {
			const row = rowMap.get(source.sourceId)
			return {
				...source,
				enabled: row ? Boolean(row.enabled) : true,
				available: source.sourceId !== 'jin10-mcp-7x24' || Boolean(this.env.JIN10_MCP_TOKEN?.trim()),
				updatedAt: row?.updated_at || null,
			}
		})
	}

	private sourceSettingStatement(sourceId: string, enabled: boolean, actorId: string): D1PreparedStatement {
		if (!financeSourceIds.includes(sourceId as FinanceSourceId))
			throw new ApiError('VALIDATION_FAILED', 400, 'Finance source is invalid')
		const now = new Date().toISOString()
		return this.env.DB.prepare(`
			INSERT INTO finance_source_settings (source_id, enabled, updated_at, updated_by)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(source_id) DO UPDATE SET
				enabled = excluded.enabled,
				updated_at = excluded.updated_at,
				updated_by = excluded.updated_by
		`).bind(sourceId, enabled ? 1 : 0, now, actorId)
	}

	async setSourceEnabled(sourceId: string, enabled: boolean, actorId: string): Promise<FinanceSourceSettingDto> {
		await this.env.DB.batch([
			this.sourceSettingStatement(sourceId, enabled, actorId),
			preparePublicCacheVersionBump(this.env.DB, 'finance'),
		])
		return (await this.sourceSettings()).find(source => source.sourceId === sourceId)!
	}

	async setSourceEnabledWithAudit(
		sourceId: string,
		enabled: boolean,
		actorId: string,
		actorLogin: string,
		requestId: string,
	): Promise<FinanceSourceSettingDto> {
		const settingStatement = this.sourceSettingStatement(sourceId, enabled, actorId)
		const auditStatement = new AuditRepository(this.env.DB).prepareAudit({
			actorId,
			actorLogin,
			action: 'finance.source.toggle',
			targetType: 'finance_source',
			targetId: sourceId,
			result: 'success',
			requestId,
			metadata: { sourceId, enabled },
		})
		await this.env.DB.batch([
			settingStatement,
			auditStatement,
			preparePublicCacheVersionBump(this.env.DB, 'finance'),
		])
		return (await this.sourceSettings()).find(source => source.sourceId === sourceId)!
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

	private async hydratePublicSummaries(items: FinanceFlashDto[]): Promise<FinanceFlashDto[]> {
		if (!items.length)
			return []
		const ids = items.map(item => item.id)
		const placeholders = ids.map(() => '?').join(', ')
		const summaries = await this.env.DB.prepare(`
			SELECT id, summary FROM finance_flash_items WHERE id IN (${placeholders})
		`).bind(...ids).all<{ id: string, summary: string | null }>()
		const summaryById = new Map(summaries.results.map(row => [row.id, row.summary]))
		return items.map(item => ({ ...item, summary: summaryById.get(item.id) ?? null }))
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

			// 正式 7×24 来源使用滚动窗口，抓取窗口没再次返回的事件不能提前删除；
			// prototype / 自定义 adapter 仍保留原来的完整快照语义，便于离线样例与扩展源独立工作。
			const staleIds = FINANCE_ROLLING_SOURCE_IDS.has(adapter.id)
				? []
				: existing.results.filter(row => !incomingIds.has(row.id)).map(row => row.id)
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

			if (options.replaceFallback && !adapter.prototype && this.fallbackAdapter.id !== adapter.id) {
				statements.push(
					this.env.DB.prepare('DELETE FROM finance_flash_items WHERE source_id = ?').bind(this.fallbackAdapter.id),
					this.env.DB.prepare('DELETE FROM finance_flash_sync_state WHERE source_id = ?').bind(this.fallbackAdapter.id),
				)
			}
			statements.push(preparePublicCacheVersionBump(this.env.DB, 'finance', now))
			await this.env.DB.batch(statements)
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
			await this.env.DB.batch([
				this.env.DB.prepare(`
					INSERT INTO finance_flash_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at)
					VALUES (?, 'failed', 0, NULL, ?, ?)
					ON CONFLICT(source_id) DO UPDATE SET
						status = 'failed', last_error = excluded.last_error, updated_at = excluded.updated_at
				`).bind(adapter.id, message.slice(0, 2_000), now),
				preparePublicCacheVersionBump(this.env.DB, 'finance', now),
			])
			return { sourceId: adapter.id, status: 'failed', itemCount: 0, error: message }
		}
	}

	async sync(): Promise<FinanceSyncResult> {
		let result: FinanceSyncResult
		if (FINANCE_SOURCES.some(source => source.sourceId === this.adapter.id)) {
			const setting = (await this.sourceSettings()).find(source => source.sourceId === this.adapter.id)
			if (setting && !setting.enabled)
				result = { sourceId: this.adapter.id, status: 'skipped', itemCount: 0, reason: 'disabled' }
			else
				result = await this.syncAdapter(this.adapter, { replaceFallback: true })
		}
		else {
			result = await this.syncAdapter(this.adapter, { replaceFallback: true })
		}
		return result
	}

	async syncAll(): Promise<FinanceSyncResult[]> {
		const results: FinanceSyncResult[] = []
		const settings = new Map((await this.sourceSettings()).map(setting => [setting.sourceId, setting]))
		const jin10 = new Jin10FinanceFlashAdapter(
			this.env.JIN10_MCP_TOKEN,
			undefined,
			this.env.JIN10_PUBLIC_VISIBLE?.trim().toLowerCase() === 'true',
		)
		const adapters = [jin10, new ClsFinanceFlashAdapter(), this.adapter]
		for (const adapter of adapters) {
			const setting = settings.get(adapter.id as FinanceSourceId)
			if (setting && !setting.enabled) {
				results.push({ sourceId: adapter.id, status: 'skipped', itemCount: 0, reason: 'disabled' })
				continue
			}
			if (adapter.id === jin10.id && !jin10.enabled) {
				results.push({ sourceId: adapter.id, status: 'skipped', itemCount: 0, reason: 'missing-secret' })
				continue
			}
			const result = await this.syncAdapter(adapter, { replaceFallback: adapter === this.adapter })
			results.push(result)
		}
		await this.cleanupRetention()
		return results
	}

	async ensureSeeded(): Promise<void> {
		const publicRowCondition = this.publicRowCondition('f')
		const snapshot = await this.env.DB.prepare(`
			SELECT 1 AS present
			FROM finance_flash_items f
			WHERE ${publicRowCondition}
			LIMIT 1
		`).first<{ present: number }>()
		if (snapshot?.present)
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

	async list(options: { importantOnly?: boolean, category?: FinanceCategory, limit?: number, offset?: number } = {}): Promise<FinanceFlashListDto> {
		const limit = Math.max(1, Math.min(100, Math.trunc(options.limit || 50)))
		const offset = Number.isSafeInteger(options.offset) && (options.offset || 0) >= 0 ? options.offset || 0 : 0
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
				SELECT ${FINANCE_GROUPING_SELECT_COLUMNS} FROM finance_flash_items f
				${where}
				ORDER BY f.published_at DESC, f.id DESC
			`).bind(...bindings).all<FinanceFlashRow>(),
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
		const pageItems = await this.hydratePublicSummaries(filteredItems.slice(offset, offset + limit))
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
			items: pageItems,
			total: filteredItems.length,
			updatedAt: state?.updated_at || null,
			prototype,
			stale: quality === 'stale',
			quality,
		}
	}

	private shanghaiToday(now: Date): { dateKey: string, start: string } {
		const parts = new Intl.DateTimeFormat('en-CA', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			timeZone: 'Asia/Shanghai',
		}).formatToParts(now)
		const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || ''
		const dateKey = `${value('year')}-${value('month')}-${value('day')}`
		return { dateKey, start: new Date(`${dateKey}T00:00:00+08:00`).toISOString() }
	}

	async todayThemes(now = new Date()): Promise<FinanceTodayThemesDto> {
		const { start } = this.shanghaiToday(now)
		const publicRowCondition = this.publicRowCondition('f')
		const items = await this.env.DB.prepare(`
			SELECT ${FINANCE_GROUPING_SELECT_COLUMNS} FROM finance_flash_items f
			WHERE ${publicRowCondition}
				AND NOT EXISTS (
					SELECT 1 FROM finance_flash_exclusions e
					WHERE e.item_id = f.id AND e.restored_at IS NULL
				)
				AND f.published_at >= ?
				AND f.published_at <= ?
			ORDER BY f.published_at DESC, f.id DESC
		`).bind(start, now.toISOString()).all<FinanceFlashRow>()
		const groupedItems = groupFinanceEvents(items.results.map(row => this.dto(row)))
		const counts = new Map<string, number>()
		for (const item of groupedItems) {
			const topic = item.topic?.trim()
			if (topic)
				counts.set(topic, (counts.get(topic) || 0) + 1)
		}
		return {
			themes: [...counts.entries()]
				.sort(([leftTopic, leftCount], [rightTopic, rightCount]) => rightCount - leftCount || leftTopic.localeCompare(rightTopic, 'zh-CN'))
				.map(([topic, count]) => ({ topic, count })),
			eventCount: groupedItems.length,
			sourceCount: new Set(items.results.map(row => row.source_id)).size,
			updatedAt: items.results.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null),
		}
	}

	async todayThemesVersion(now = new Date()): Promise<string> {
		const { dateKey } = this.shanghaiToday(now)
		return `${await this.listVersion()}:today=${dateKey}`
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
		await this.env.DB.batch([
			this.env.DB.prepare(`
				INSERT INTO finance_flash_exclusions (item_id, created_at, restored_at)
				VALUES (?, ?, NULL)
				ON CONFLICT(item_id) DO UPDATE SET created_at = excluded.created_at, restored_at = NULL
			`).bind(id, now),
			preparePublicCacheVersionBump(this.env.DB, 'finance', now),
		])
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
		await this.env.DB.batch([
			this.env.DB.prepare('UPDATE finance_flash_exclusions SET restored_at = ? WHERE item_id = ?').bind(now, id),
			preparePublicCacheVersionBump(this.env.DB, 'finance', now),
		])
		return this.adminDto({ ...item, hidden_at: null })
	}

	async cleanupRetention(now = new Date()): Promise<{ deletedExclusions: number }> {
		const flashCutoff = new Date(now.getTime() - FINANCE_FLASH_RETENTION_MS).toISOString()
		const exclusionCutoff = new Date(now.getTime() - FINANCE_EXCLUSION_RETENTION_DAYS * 86_400_000).toISOString()
		const [, exclusions] = await this.env.DB.batch([
			this.env.DB.prepare(`
				DELETE FROM finance_flash_items
				WHERE source_id IN (?, ?, ?)
					AND published_at < ?
			`).bind(...financeSourceIds, flashCutoff),
			this.env.DB.prepare(`
				DELETE FROM finance_flash_exclusions
				WHERE COALESCE(restored_at, created_at) < ?
					AND NOT EXISTS (SELECT 1 FROM finance_flash_items f WHERE f.id = finance_flash_exclusions.item_id)
			`).bind(exclusionCutoff),
			preparePublicCacheVersionBump(this.env.DB, 'finance', now.toISOString()),
		])
		return { deletedExclusions: exclusions.meta.changes || 0 }
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
		const [sources, settings, list] = await Promise.all([
			this.env.DB.prepare(`
				SELECT source_id, status, item_count, last_success_at, last_error, updated_at
				FROM finance_flash_sync_state
				ORDER BY updated_at DESC, source_id ASC
			`).all<SourceHealth>(),
			this.sourceSettings(),
			this.list({ limit: 1 }),
		])
		type SourceStatus = SourceHealth & { enabled: boolean, available: boolean }
		const sourceMap = new Map<string, SourceStatus>(sources.results.map(source => [source.source_id, {
			...source,
			enabled: true,
			available: true,
		}]))
		const pending = (sourceId: string): SourceStatus => ({
			source_id: sourceId,
			status: 'pending',
			item_count: 0,
			last_success_at: null,
			last_error: null,
			updated_at: null,
			enabled: true,
			available: true,
		})
		for (const setting of settings) {
			const source = sourceMap.get(setting.sourceId) || pending(setting.sourceId)
			sourceMap.set(setting.sourceId, {
				...source,
				status: setting.enabled && setting.available ? source.status : 'disabled',
				last_error: setting.enabled && setting.available ? source.last_error : null,
				enabled: setting.enabled,
				available: setting.available,
			})
		}

		return {
			sources: [...sourceMap.values()],
			total: list.total,
			updatedAt: list.updatedAt,
			prototype: list.prototype,
		}
	}

	async listVersion(): Promise<string> {
		return readPublicCacheVersion(this.env.DB, 'finance')
	}
}
