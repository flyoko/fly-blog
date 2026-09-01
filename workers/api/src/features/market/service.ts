import type {
	MarketBreadth,
	MarketDataQuality,
	MarketEnvelope,
	MarketIndexQuote,
	MarketOverview,
	MarketSourceRef,
	SectorFlowItem,
	SectorFlowQuote,
	SectorFlowStreak,
	SectorFlowWeek,
	SectorKind,
	SectorWeekOffset,
} from '../../../../../shared/market'
import type { Env } from '../../env'
import type { MarketCapability, MarketDataProvider, MarketProviderResult } from './contracts'
import { marketIndexCodes, sectorWeekOffsets, sectorWindowDays } from '../../../../../shared/market'
import { isChinaAShareTradingDate } from '../../../../../shared/market-calendar'
import { preparePublicCacheVersionBump, readPublicCacheVersion } from '../../lib/public-cache-version'
import { isChinaMarketSectorSyncWindow, isChinaMarketSyncWindow, shanghaiParts } from './contracts'
import { EastMoneyMarketProvider } from './eastmoney'
import { recordMarketSourceObservation } from './observability'

const SECTOR_FLOW_RETENTION_DAYS = 30
const SECTOR_FLOW_HISTORY_LIMIT = 20
const DAY_MS = 86_400_000

interface MarketDailySnapshotRow {
	trade_date: string
	market_at: string
	fetched_at: string
	indices_json: string | null
	breadth_json: string | null
	sources_json: string
	updated_at: string
}

interface MarketSectorFlowRow {
	trade_date: string
	sector_kind: SectorKind
	sector_code: string
	sector_name: string
	change_pct: number | null
	main_net_inflow: number | null
	main_net_inflow_ratio: number | null
	leader_stock_code: string | null
	leader_stock_name: string | null
	market_at: string
	fetched_at: string
	source_id: string
	updated_at: string
}

interface MarketDailySnapshot {
	tradeDate: string
	marketAt: string
	fetchedAt: string
	indices: MarketIndexQuote[] | null
	breadth: MarketBreadth | null
	sources: MarketSourceRef[]
}

interface CapabilitySuccess<T> {
	ok: true
	value: MarketProviderResult<T>
}

interface CapabilityFailure {
	ok: false
	error: unknown
}

type CapabilityOutcome<T> = CapabilitySuccess<T> | CapabilityFailure

export interface MarketSyncCapabilityResult {
	capability: MarketCapability
	status: 'success' | 'failed'
	itemCount: number
	error?: string
}

export interface MarketSyncResult {
	status: 'success' | 'partial' | 'failed' | 'skipped'
	reason?: 'outside-market-window' | 'trade-date-mismatch'
	capabilities: MarketSyncCapabilityResult[]
}

function settle<T>(promise: Promise<MarketProviderResult<T>>): Promise<CapabilityOutcome<T>> {
	return promise.then(
		value => ({ ok: true, value }),
		error => ({ ok: false, error }),
	)
}

function errorSummary(error: unknown): string {
	const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
	return raw.replace(/[\r\n\t]+/gu, ' ').slice(0, 500)
}

function jsonOrNull<T>(value: string | null): T | null {
	if (!value)
		return null
	try {
		return JSON.parse(value) as T
	}
	catch {
		return null
	}
}

function validIso(value: string | null | undefined): value is string {
	return Boolean(value && Number.isFinite(Date.parse(value)))
}

function latestIso(values: Array<string | null | undefined>): string | null {
	const valid = values.filter(validIso)
	if (!valid.length)
		return null
	return valid.slice().sort((left, right) => Date.parse(right) - Date.parse(left))[0]!
}

function oldestIso(values: Array<string | null | undefined>): string | null {
	const valid = values.filter(validIso)
	if (!valid.length)
		return null
	return valid.slice().sort((left, right) => Date.parse(left) - Date.parse(right))[0]!
}

function ageMs(now: Date, marketAt: string | null): number | null {
	if (!marketAt)
		return null
	const parsed = Date.parse(marketAt)
	if (!Number.isFinite(parsed))
		return null
	return Math.max(0, now.getTime() - parsed)
}

function mergeSources(...groups: Array<MarketSourceRef[] | MarketSourceRef | null | undefined>): MarketSourceRef[] {
	const result = new Map<string, MarketSourceRef>()
	for (const group of groups) {
		const sources = Array.isArray(group) ? group : group ? [group] : []
		for (const source of sources)
			result.set(`${source.sourceId}:${source.endpoint}`, source)
	}
	return [...result.values()]
}

function storedSource(sourceId: string): MarketSourceRef {
	return {
		sourceId,
		sourceName: sourceId.startsWith('eastmoney-') ? '东方财富' : sourceId,
		endpoint: 'd1:last-good',
	}
}

function capabilityItemCount(capability: MarketCapability, value: MarketProviderResult<unknown>): number {
	if (capability === 'breadth')
		return 1
	return Array.isArray(value.data) ? value.data.length : 1
}

function isSectorResultForTradeDate(result: MarketProviderResult<SectorFlowQuote[]>, tradeDate: string): boolean {
	const timestamps = [result.marketAt, ...result.data.map(item => item.marketAt)]
	return timestamps.length > 1 && timestamps.every((timestamp) => {
		const date = new Date(timestamp)
		return Number.isFinite(date.getTime()) && shanghaiParts(date).date === tradeDate
	})
}

function dateKeyAtOffset(dateKey: string, dayOffset: number): string | null {
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(dateKey))
		return null
	const parsed = Date.parse(`${dateKey}T00:00:00.000Z`)
	if (!Number.isFinite(parsed))
		return null
	return new Date(parsed + dayOffset * DAY_MS).toISOString().slice(0, 10)
}

function sectorWeekTradingDates(anchorDate: string, weekOffset: SectorWeekOffset): string[] {
	const parsed = Date.parse(`${anchorDate}T00:00:00.000Z`)
	if (!Number.isFinite(parsed))
		return []
	const weekday = new Date(parsed).getUTCDay()
	const daysSinceMonday = (weekday + 6) % 7
	const mondayMs = parsed - (daysSinceMonday + weekOffset * 7) * DAY_MS
	const dates: string[] = []
	for (let day = 0; day < 5; day += 1) {
		const dateKey = new Date(mondayMs + day * DAY_MS).toISOString().slice(0, 10)
		const shanghaiNoon = new Date(`${dateKey}T04:00:00.000Z`)
		if (isChinaAShareTradingDate(shanghaiNoon))
			dates.push(dateKey)
	}
	return dates
}

function aggregateSectorWeek(
	values: Map<string, number | null>,
	anchorDate: string,
	weekOffset: SectorWeekOffset,
): SectorFlowWeek {
	const expectedDates = sectorWeekTradingDates(anchorDate, weekOffset)
	const availableDates = expectedDates.filter(date => values.has(date))
	const selected = availableDates.map(date => values.get(date) ?? null)
	const hasMissingValue = selected.includes(null)
	const numericValues = selected.filter((value): value is number => value !== null)
	return {
		weekOffset,
		netInflow: availableDates.length && !hasMissingValue
			? numericValues.reduce((sum, value) => sum + value, 0)
			: null,
		availableDays: availableDates.length,
		expectedDays: expectedDates.length,
		complete: expectedDates.length > 0 && availableDates.length === expectedDates.length && !hasMissingValue,
		startDate: availableDates[0] ?? null,
		endDate: availableDates.at(-1) ?? null,
	}
}

function sectorRecentTradingDates(anchorDate: string, limit = SECTOR_FLOW_HISTORY_LIMIT): string[] {
	const parsed = Date.parse(`${anchorDate}T00:00:00.000Z`)
	if (!Number.isFinite(parsed) || limit < 1)
		return []
	const dates: string[] = []
	for (let offset = 0; dates.length < limit && offset < 64; offset += 1) {
		const dateKey = new Date(parsed - offset * DAY_MS).toISOString().slice(0, 10)
		const shanghaiNoon = new Date(`${dateKey}T04:00:00.000Z`)
		if (isChinaAShareTradingDate(shanghaiNoon))
			dates.push(dateKey)
	}
	return dates
}

function sectorFlowStreak(
	values: Map<string, number | null>,
	anchorDate: string,
	limit = SECTOR_FLOW_HISTORY_LIMIT,
): SectorFlowStreak {
	const first = values.get(anchorDate) ?? null
	if (first === null || first === 0)
		return { direction: 'neutral', days: 0, complete: true }

	const direction = first > 0 ? 'inflow' : 'outflow'
	const dates = sectorRecentTradingDates(anchorDate, limit)
	if (dates[0] !== anchorDate)
		return { direction, days: 1, complete: false }

	let days = 0
	for (const date of dates) {
		if (!values.has(date))
			return { direction, days, complete: false }
		const value = values.get(date)
		if (value === null || value === undefined)
			return { direction, days, complete: false }
		if (value === 0 || (value > 0) !== (first > 0))
			return { direction, days, complete: true }
		days += 1
	}
	return { direction, days, complete: false }
}

export class MarketService {
	constructor(
		private readonly env: Env,
		private readonly provider: MarketDataProvider = new EastMoneyMarketProvider(),
		private readonly now: () => Date = () => new Date(),
	) {}

	private async latestDailySnapshot(): Promise<MarketDailySnapshot | null> {
		const row = await this.env.DB.prepare(`
			SELECT trade_date, market_at, fetched_at, indices_json, breadth_json, sources_json, updated_at
			FROM market_daily_snapshot
			ORDER BY trade_date DESC
			LIMIT 1
		`).first<MarketDailySnapshotRow>()
		if (!row)
			return null
		const storedIndices = jsonOrNull<MarketIndexQuote[]>(row.indices_json)
		const indices = storedIndices?.filter(item => marketIndexCodes.includes(item.code)) || null
		const breadth = jsonOrNull<MarketBreadth>(row.breadth_json)
		const sources = jsonOrNull<MarketSourceRef[]>(row.sources_json) || []
		if (!indices?.length && !breadth)
			return null
		return {
			tradeDate: row.trade_date,
			marketAt: row.market_at,
			fetchedAt: row.fetched_at,
			indices: indices?.length ? indices : null,
			breadth,
			sources,
		}
	}

	private async persistDailySnapshot(
		indices: MarketProviderResult<MarketIndexQuote[]>,
		breadthResult: MarketProviderResult<MarketBreadth> | null,
	): Promise<void> {
		const tradeDate = shanghaiParts(new Date(indices.marketAt)).date
		const existingRow = await this.env.DB.prepare(`
			SELECT trade_date, market_at, fetched_at, indices_json, breadth_json, sources_json, updated_at
			FROM market_daily_snapshot
			WHERE trade_date = ?
		`).bind(tradeDate).first<MarketDailySnapshotRow>()
		const existingBreadth = existingRow ? jsonOrNull<MarketBreadth>(existingRow.breadth_json) : null
		const existingSources = existingRow ? jsonOrNull<MarketSourceRef[]>(existingRow.sources_json) || [] : []
		const breadth = breadthResult
			? { ...breadthResult.data, marketAt: indices.marketAt }
			: existingBreadth
		const sources = mergeSources(existingSources, indices.source, breadthResult?.source)
		const marketTime = oldestIso([
			indices.marketAt,
			breadth?.marketAt,
		]) || indices.marketAt
		const fetchedTime = latestIso([
			indices.fetchedAt,
			breadthResult?.fetchedAt,
			existingRow?.fetched_at,
		]) || indices.fetchedAt
		const updatedAt = this.now().toISOString()

		await this.env.DB.batch([
			this.env.DB.prepare(`
				INSERT INTO market_daily_snapshot (
					trade_date, market_at, fetched_at, indices_json, breadth_json, sources_json, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(trade_date) DO UPDATE SET
					market_at = excluded.market_at,
					fetched_at = excluded.fetched_at,
					indices_json = excluded.indices_json,
					breadth_json = excluded.breadth_json,
					sources_json = excluded.sources_json,
					updated_at = excluded.updated_at
			`).bind(
				tradeDate,
				marketTime,
				fetchedTime,
				JSON.stringify(indices.data),
				breadth ? JSON.stringify(breadth) : null,
				JSON.stringify(sources),
				updatedAt,
			),
			preparePublicCacheVersionBump(this.env.DB, 'market', updatedAt),
		])
	}

	private async persistSectorFlows(result: MarketProviderResult<SectorFlowQuote[]>): Promise<void> {
		if (!result.data.length)
			return
		const updatedAt = this.now().toISOString()
		const rows = result.data.map(item => ({
			tradeDate: shanghaiParts(new Date(item.marketAt)).date,
			sectorKind: item.kind,
			sectorCode: item.code,
			sectorName: item.name,
			changePct: item.changePct,
			mainNetInflow: item.mainNetInflow,
			mainNetInflowRatio: item.mainNetInflowRatio,
			leaderStockCode: item.leaderStockCode,
			leaderStockName: item.leaderStockName,
			marketAt: item.marketAt,
		}))
		const upsert = this.env.DB.prepare(`
			INSERT INTO market_sector_flow_daily (
				trade_date, sector_kind, sector_code, sector_name, change_pct,
				main_net_inflow, main_net_inflow_ratio, leader_stock_code, leader_stock_name,
				market_at, fetched_at, source_id, updated_at
			)
			SELECT
				json_extract(value, '$.tradeDate'),
				json_extract(value, '$.sectorKind'),
				json_extract(value, '$.sectorCode'),
				json_extract(value, '$.sectorName'),
				json_extract(value, '$.changePct'),
				json_extract(value, '$.mainNetInflow'),
				json_extract(value, '$.mainNetInflowRatio'),
				json_extract(value, '$.leaderStockCode'),
				json_extract(value, '$.leaderStockName'),
				json_extract(value, '$.marketAt'),
				?, ?, ?
			FROM json_each(?)
			WHERE 1
			ON CONFLICT(trade_date, sector_kind, sector_code) DO UPDATE SET
				sector_name = excluded.sector_name,
				change_pct = excluded.change_pct,
				main_net_inflow = excluded.main_net_inflow,
				main_net_inflow_ratio = excluded.main_net_inflow_ratio,
				leader_stock_code = excluded.leader_stock_code,
				leader_stock_name = excluded.leader_stock_name,
				market_at = excluded.market_at,
				fetched_at = excluded.fetched_at,
				source_id = excluded.source_id,
				updated_at = excluded.updated_at
		`).bind(
			result.fetchedAt,
			result.source.sourceId,
			updatedAt,
			JSON.stringify(rows),
		)
		const latestTradeDate = rows.map(row => row.tradeDate).sort().at(-1)
		const cutoff = latestTradeDate
			? dateKeyAtOffset(latestTradeDate, -(SECTOR_FLOW_RETENTION_DAYS - 1))
			: null
		const statements = [upsert]
		if (cutoff)
			statements.push(this.env.DB.prepare('DELETE FROM market_sector_flow_daily WHERE trade_date < ?').bind(cutoff))
		statements.push(preparePublicCacheVersionBump(this.env.DB, 'market', updatedAt))
		await this.env.DB.batch(statements)
	}

	private async writeHealth(
		capability: MarketCapability,
		outcome: CapabilityOutcome<unknown>,
		scheduledAt?: string,
	): Promise<MarketSyncCapabilityResult> {
		const now = this.now().toISOString()
		const sourceId = outcome.ok
			? outcome.value.source.sourceId
			: this.provider.sourceId?.(capability) || 'market-provider'
		const itemCount = outcome.ok ? capabilityItemCount(capability, outcome.value) : 0
		const error = outcome.ok ? null : errorSummary(outcome.error)
		await this.env.DB.prepare(`
			INSERT INTO market_source_health (
				capability, source_id, status, item_count, latency_ms,
				last_attempt_at, last_success_at, last_error, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(capability, source_id) DO UPDATE SET
				status = excluded.status,
				item_count = excluded.item_count,
				latency_ms = excluded.latency_ms,
				last_attempt_at = excluded.last_attempt_at,
				last_success_at = CASE
					WHEN excluded.status = 'success' THEN excluded.last_success_at
					ELSE market_source_health.last_success_at
				END,
				last_error = excluded.last_error,
				updated_at = excluded.updated_at
		`).bind(
			capability,
			sourceId,
			outcome.ok ? 'success' : 'failed',
			itemCount,
			outcome.ok ? outcome.value.latencyMs : null,
			now,
			outcome.ok ? now : null,
			error,
			now,
		).run()
		if (scheduledAt) {
			await recordMarketSourceObservation(this.env, {
				capability,
				status: outcome.ok ? 'success' : 'failed',
				sourceId,
				endpoint: outcome.ok ? outcome.value.source.endpoint : null,
				itemCount,
				expectedItemCount: null,
				missingCount: 0,
				latencyMs: outcome.ok ? outcome.value.latencyMs : null,
				scheduledAt,
				observedAt: now,
			}).catch(() => undefined)
		}
		return outcome.ok
			? { capability, status: 'success', itemCount }
			: { capability, status: 'failed', itemCount: 0, error: error || 'Market provider failed' }
	}

	async overview(): Promise<MarketEnvelope<MarketOverview>> {
		const [indicesOutcome, breadthOutcome] = await Promise.all([
			settle(this.provider.fetchIndices()),
			settle(this.provider.fetchBreadth()),
		])
		const needsSnapshot = !indicesOutcome.ok || !breadthOutcome.ok
		const snapshot = needsSnapshot ? await this.latestDailySnapshot() : null

		const liveIndices = indicesOutcome.ok ? indicesOutcome.value.data : null
		const liveBreadth = breadthOutcome.ok ? breadthOutcome.value.data : null
		const indices = liveIndices || snapshot?.indices || []
		const indexMarketTime = oldestIso(indices.map(item => item.marketAt))
		const rawBreadth = liveBreadth || snapshot?.breadth || null
		const breadth = rawBreadth && indexMarketTime
			? { ...rawBreadth, marketAt: indexMarketTime }
			: rawBreadth
		const liveCount = Number(indicesOutcome.ok) + Number(breadthOutcome.ok)
		const hasData = indices.length > 0 || Boolean(breadth)
		if (!hasData) {
			return {
				data: null,
				source: [],
				fetchedAt: null,
				marketAt: null,
				stale: false,
				staleAgeMs: null,
				quality: 'unavailable',
			}
		}

		const quality: MarketDataQuality = liveCount === 2
			? 'live'
			: liveCount > 0
				? 'degraded'
				: 'stale'
		const fallbackMarketTimes: string[] = []
		if (!indicesOutcome.ok && snapshot?.indices?.length)
			fallbackMarketTimes.push(...snapshot.indices.map(item => item.marketAt))
		if (!breadthOutcome.ok && snapshot?.breadth)
			fallbackMarketTimes.push(snapshot.breadth.marketAt)
		const sourceRefs = mergeSources(
			indicesOutcome.ok ? indicesOutcome.value.source : null,
			breadthOutcome.ok ? breadthOutcome.value.source : null,
			needsSnapshot ? snapshot?.sources : null,
		)
		const fetchedTime = latestIso([
			indicesOutcome.ok ? indicesOutcome.value.fetchedAt : null,
			breadthOutcome.ok ? breadthOutcome.value.fetchedAt : null,
			needsSnapshot ? snapshot?.fetchedAt : null,
		])
		const marketTime = oldestIso([
			...indices.map(item => item.marketAt),
			breadth?.marketAt,
		])

		return {
			data: { indices, breadth },
			source: sourceRefs,
			fetchedAt: fetchedTime,
			marketAt: marketTime,
			stale: quality === 'stale',
			staleAgeMs: fallbackMarketTimes.length ? ageMs(this.now(), oldestIso(fallbackMarketTimes)) : null,
			quality,
		}
	}

	private rowToSector(row: MarketSectorFlowRow): SectorFlowQuote {
		return {
			code: row.sector_code,
			name: row.sector_name,
			kind: row.sector_kind,
			changePct: row.change_pct,
			mainNetInflow: row.main_net_inflow,
			mainNetInflowRatio: row.main_net_inflow_ratio,
			leaderStockCode: row.leader_stock_code,
			leaderStockName: row.leader_stock_name,
			marketAt: row.market_at,
		}
	}

	private async decorateSectorWindows(items: SectorFlowQuote[]): Promise<SectorFlowItem[]> {
		if (!items.length)
			return []
		const codes = [...new Set(items.map(item => item.code))]
		const history = await this.env.DB.prepare(`
			SELECT trade_date, sector_kind, sector_code, sector_name, change_pct,
				main_net_inflow, main_net_inflow_ratio, leader_stock_code, leader_stock_name,
				market_at, fetched_at, source_id, updated_at
			FROM (
				SELECT *, ROW_NUMBER() OVER (
					PARTITION BY sector_kind, sector_code
					ORDER BY trade_date DESC
				) AS row_number
				FROM market_sector_flow_daily
				WHERE sector_kind = ?
					AND sector_code IN (SELECT CAST(value AS TEXT) FROM json_each(?))
			)
			WHERE row_number <= ?
			ORDER BY sector_code, trade_date DESC
		`).bind(items[0]!.kind, JSON.stringify(codes), SECTOR_FLOW_HISTORY_LIMIT).all<MarketSectorFlowRow>()
		const byCode = new Map<string, Map<string, number | null>>()
		for (const row of history.results) {
			const values = byCode.get(row.sector_code) || new Map<string, number | null>()
			values.set(row.trade_date, row.main_net_inflow)
			byCode.set(row.sector_code, values)
		}

		return items.map((item) => {
			const values = new Map(byCode.get(item.code) || [])
			const anchorDate = shanghaiParts(new Date(item.marketAt)).date
			values.set(anchorDate, item.mainNetInflow)
			const dates = [...values.keys()].sort().reverse()
			return {
				...item,
				streak: sectorFlowStreak(values, anchorDate),
				windows: sectorWindowDays.map((days) => {
					const selectedDates = dates.slice(0, days)
					const selected = selectedDates.map(date => values.get(date) ?? null)
					const hasMissingValue = selected.includes(null)
					const numericValues = selected.filter((value): value is number => value !== null)
					return {
						days,
						netInflow: selectedDates.length && !hasMissingValue
							? numericValues.reduce((sum, value) => sum + value, 0)
							: null,
						availableDays: selectedDates.length,
						complete: selectedDates.length >= days && !hasMissingValue,
					}
				}),
				weeks: sectorWeekOffsets.map(weekOffset => aggregateSectorWeek(values, anchorDate, weekOffset)),
			}
		})
	}

	private async latestSectorRows(kind: SectorKind, limit: number): Promise<MarketSectorFlowRow[]> {
		const rows = await this.env.DB.prepare(`
			SELECT trade_date, sector_kind, sector_code, sector_name, change_pct,
				main_net_inflow, main_net_inflow_ratio, leader_stock_code, leader_stock_name,
				market_at, fetched_at, source_id, updated_at
			FROM market_sector_flow_daily
			WHERE sector_kind = ?
				AND trade_date = (
					SELECT MAX(trade_date) FROM market_sector_flow_daily WHERE sector_kind = ?
				)
			ORDER BY main_net_inflow IS NULL, main_net_inflow DESC, sector_code
			LIMIT ?
		`).bind(kind, kind, limit).all<MarketSectorFlowRow>()
		return rows.results
	}

	async sectorFlows(kind: SectorKind, limit = 20): Promise<MarketEnvelope<SectorFlowItem[]>> {
		try {
			const live = await this.provider.fetchSectorFlows(kind)
			const items = await this.decorateSectorWindows(live.data.slice(0, limit))
			return {
				data: items,
				source: [live.source],
				fetchedAt: live.fetchedAt,
				marketAt: live.marketAt,
				stale: false,
				staleAgeMs: null,
				quality: 'live',
			}
		}
		catch {
			const rows = await this.latestSectorRows(kind, limit)
			if (!rows.length) {
				return {
					data: null,
					source: [],
					fetchedAt: null,
					marketAt: null,
					stale: false,
					staleAgeMs: null,
					quality: 'unavailable',
				}
			}
			const items = await this.decorateSectorWindows(rows.map(row => this.rowToSector(row)))
			const marketTime = oldestIso(rows.map(row => row.market_at))
			return {
				data: items,
				source: [...new Set(rows.map(row => row.source_id))].map(storedSource),
				fetchedAt: latestIso(rows.map(row => row.fetched_at)),
				marketAt: marketTime,
				stale: true,
				staleAgeMs: ageMs(this.now(), marketTime),
				quality: 'stale',
			}
		}
	}

	async syncScheduled(scheduledAt?: string): Promise<MarketSyncResult> {
		const runAt = this.now()
		if (!isChinaMarketSectorSyncWindow(runAt)) {
			return {
				status: 'skipped',
				reason: 'outside-market-window',
				capabilities: [],
			}
		}
		if (!isChinaMarketSyncWindow(runAt))
			return this.syncFinalSectorClose(runAt, scheduledAt)

		const [indicesOutcome, breadthOutcome, industryOutcome, conceptOutcome] = await Promise.all([
			settle(this.provider.fetchIndices()),
			settle(this.provider.fetchBreadth()),
			settle(this.provider.fetchSectorFlows('industry')),
			settle(this.provider.fetchSectorFlows('concept')),
		])
		const outcomes = [
			{ capability: 'indices' as const, outcome: indicesOutcome },
			{ capability: 'breadth' as const, outcome: breadthOutcome },
			{ capability: 'sector-industry' as const, outcome: industryOutcome },
			{ capability: 'sector-concept' as const, outcome: conceptOutcome },
		]
		const capabilities: MarketSyncCapabilityResult[] = []
		for (const entry of outcomes)
			capabilities.push(await this.writeHealth(entry.capability, entry.outcome, scheduledAt))

		// 只用指数的真实上游 marketAt 锚定交易日，避免法定休市日用本机日期造出新交易日。
		if (indicesOutcome.ok)
			await this.persistDailySnapshot(indicesOutcome.value, breadthOutcome.ok ? breadthOutcome.value : null)
		if (industryOutcome.ok)
			await this.persistSectorFlows(industryOutcome.value)
		if (conceptOutcome.ok)
			await this.persistSectorFlows(conceptOutcome.value)

		const successCount = capabilities.filter(item => item.status === 'success').length
		return {
			status: successCount === capabilities.length ? 'success' : successCount > 0 ? 'partial' : 'failed',
			capabilities,
		}
	}

	private async syncFinalSectorClose(runAt: Date, scheduledAt?: string): Promise<MarketSyncResult> {
		const [rawIndustryOutcome, rawConceptOutcome] = await Promise.all([
			settle(this.provider.fetchSectorFlows('industry')),
			settle(this.provider.fetchSectorFlows('concept')),
		])
		const tradeDate = shanghaiParts(runAt).date
		let mismatchCount = 0
		const validate = (outcome: CapabilityOutcome<SectorFlowQuote[]>): CapabilityOutcome<SectorFlowQuote[]> => {
			if (!outcome.ok || isSectorResultForTradeDate(outcome.value, tradeDate))
				return outcome
			mismatchCount += 1
			return {
				ok: false,
				error: new Error(`Sector final close trade date mismatch: expected ${tradeDate}`),
			}
		}
		const industryOutcome = validate(rawIndustryOutcome)
		const conceptOutcome = validate(rawConceptOutcome)
		const outcomes = [
			{ capability: 'sector-industry' as const, outcome: industryOutcome },
			{ capability: 'sector-concept' as const, outcome: conceptOutcome },
		]
		const capabilities: MarketSyncCapabilityResult[] = []
		for (const entry of outcomes)
			capabilities.push(await this.writeHealth(entry.capability, entry.outcome, scheduledAt))
		if (industryOutcome.ok)
			await this.persistSectorFlows(industryOutcome.value)
		if (conceptOutcome.ok)
			await this.persistSectorFlows(conceptOutcome.value)

		const successCount = capabilities.filter(item => item.status === 'success').length
		if (successCount === 0 && mismatchCount === outcomes.length) {
			return {
				status: 'skipped',
				reason: 'trade-date-mismatch',
				capabilities,
			}
		}
		return {
			status: successCount === capabilities.length ? 'success' : successCount > 0 ? 'partial' : 'failed',
			capabilities,
		}
	}

	async listVersion(): Promise<string> {
		return readPublicCacheVersion(this.env.DB, 'market')
	}
}
