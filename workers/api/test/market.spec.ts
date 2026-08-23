import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { MarketBreadth, MarketIndexQuote, SectorFlowQuote, SectorKind } from '../../../shared/market'
import type { Env } from '../src/env'
import type { MarketDataProvider, MarketProviderResult } from '../src/features/market/contracts'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isChinaMarketSyncWindow, shanghaiParts } from '../src/features/market/contracts'
import { MarketService } from '../src/features/market/service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const marketAt = '2026-08-24T02:30:00.000Z'
const fetchedAt = '2026-08-24T02:30:05.000Z'
const source = {
	sourceId: 'test-market-source',
	sourceName: '测试市场源',
	endpoint: 'https://market.example.test/data',
}

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function result<T>(data: T, at = marketAt): MarketProviderResult<T> {
	return { data, source, marketAt: at, fetchedAt, latencyMs: 23 }
}

function indices(value = 3666.12, at = marketAt): MarketIndexQuote[] {
	return [
		{ code: '000001', name: '上证指数', value, change: 12.51, changePct: 0.34, turnover: 520000000000, marketAt: at },
		{ code: '399001', name: '深证成指', value: 11288.45, change: 0, changePct: 0, turnover: 630000000000, marketAt: at },
		{ code: '399006', name: '创业板指', value: 2788.21, change: -14.62, changePct: -0.52, turnover: 210000000000, marketAt: at },
	]
}

function breadth(at = marketAt): MarketBreadth {
	return { advancing: 3100, declining: 1900, flat: 120, total: 5120, limitUp: 68, limitDown: 9, marketAt: at }
}

function sector(kind: SectorKind, amount = 5_020_000_000, at = marketAt): SectorFlowQuote[] {
	return [{
		code: kind === 'industry' ? 'BK1036' : 'BK0816',
		name: kind === 'industry' ? '通信设备' : 'CPO概念',
		kind,
		changePct: 1.23,
		mainNetInflow: amount,
		mainNetInflowRatio: 6.51,
		leaderStockCode: '300308',
		leaderStockName: '中际旭创',
		marketAt: at,
	}]
}

function provider(overrides: Partial<MarketDataProvider> = {}): MarketDataProvider {
	return {
		fetchIndices: vi.fn(async () => result(indices())),
		fetchBreadth: vi.fn(async () => result(breadth())),
		fetchSectorFlows: vi.fn(async kind => result(sector(kind))),
		...overrides,
	}
}

function failingProvider(message = 'upstream unavailable'): MarketDataProvider {
	return provider({
		fetchIndices: vi.fn(async () => { throw new Error(message) }),
		fetchBreadth: vi.fn(async () => { throw new Error(message) }),
		fetchSectorFlows: vi.fn(async () => { throw new Error(message) }),
	})
}

function previousBusinessDates(endDate: string, count: number): string[] {
	const dates: string[] = []
	const cursor = new Date(`${endDate}T00:00:00.000Z`)
	cursor.setUTCDate(cursor.getUTCDate() - 1)
	while (dates.length < count) {
		const day = cursor.getUTCDay()
		if (day !== 0 && day !== 6)
			dates.push(cursor.toISOString().slice(0, 10))
		cursor.setUTCDate(cursor.getUTCDate() - 1)
	}
	return dates
}

async function seedSectorHistory(kind: SectorKind, code: string, days: number, amount: number) {
	const dates = previousBusinessDates('2026-08-24', days)
	for (const tradeDate of dates) {
		await testEnv.DB.prepare(`
			INSERT INTO market_sector_flow_daily (
				trade_date, sector_kind, sector_code, sector_name, change_pct,
				main_net_inflow, main_net_inflow_ratio, leader_stock_code, leader_stock_name,
				market_at, fetched_at, source_id, updated_at
			) VALUES (?, ?, ?, ?, 1.2, ?, 4.2, '300308', '中际旭创', ?, ?, ?, ?)
		`).bind(
			tradeDate,
			kind,
			code,
			kind === 'industry' ? '通信设备' : 'CPO概念',
			amount,
			`${tradeDate}T07:00:00.000Z`,
			`${tradeDate}T07:00:05.000Z`,
			source.sourceId,
			`${tradeDate}T07:00:05.000Z`,
		).run()
	}
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM market_source_health'),
		testEnv.DB.prepare('DELETE FROM market_daily_snapshot'),
		testEnv.DB.prepare('DELETE FROM market_sector_flow_daily'),
	])
})

describe('market contracts and schema', () => {
	it('creates the P1 market tables', async () => {
		for (const table of ['market_source_health', 'market_daily_snapshot', 'market_sector_flow_daily']) {
			const row = await testEnv.DB.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?')
				.bind(table)
				.first<{ name: string }>()
			expect(row?.name).toBe(table)
		}
	})

	it('converts timestamps to Shanghai date, weekday and minute-of-day', () => {
		expect(shanghaiParts(new Date('2026-08-24T01:20:00.000Z'))).toEqual({
			date: '2026-08-24',
			weekday: 'Mon',
			minutes: 9 * 60 + 20,
		})
	})

	it('only opens the scheduled market window during weekday trading sessions', () => {
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T01:20:00.000Z'))).toBe(true)
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T03:35:00.000Z'))).toBe(true)
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T03:36:00.000Z'))).toBe(false)
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T04:55:00.000Z'))).toBe(true)
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T07:15:00.000Z'))).toBe(true)
		expect(isChinaMarketSyncWindow(new Date('2026-08-24T07:16:00.000Z'))).toBe(false)
		expect(isChinaMarketSyncWindow(new Date('2026-08-23T02:00:00.000Z'))).toBe(false)
		expect(isChinaMarketSyncWindow(new Date('2026-10-02T02:00:00.000Z'))).toBe(false)
		expect(isChinaMarketSyncWindow(new Date('2027-01-04T02:00:00.000Z'))).toBe(false)
	})
})

describe('market overview quality', () => {
	it('returns live when indices and breadth both succeed', async () => {
		const data = await new MarketService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z')).overview()

		expect(data).toMatchObject({ quality: 'live', stale: false, staleAgeMs: null })
		expect(data.data?.indices).toHaveLength(3)
		expect(data.data?.breadth?.advancing).toBe(3100)
	})

	it('anchors live breadth marketAt to the index exchange timestamp instead of fetch time', async () => {
		const indexAt = '2026-08-21T07:00:00.000Z'
		const fetchAt = '2026-08-23T04:00:00.000Z'
		const fake = provider({
			fetchIndices: vi.fn(async () => result(indices(3666.12, indexAt), indexAt)),
			fetchBreadth: vi.fn(async () => result(breadth(fetchAt), fetchAt)),
		})

		const data = await new MarketService(runtimeEnv(), fake, () => new Date(fetchAt)).overview()

		expect(data.data?.breadth?.marketAt).toBe(indexAt)
		expect(data.marketAt).toBe(indexAt)
	})

	it('returns degraded and uses last-good only for the failed capability', async () => {
		const seed = new MarketService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z'))
		expect((await seed.syncScheduled()).status).toBe('success')

		const mixed = provider({
			fetchIndices: vi.fn(async () => result(indices(3777.77), '2026-08-24T02:35:00.000Z')),
			fetchBreadth: vi.fn(async () => { throw new Error('breadth unavailable') }),
		})
		const data = await new MarketService(runtimeEnv(), mixed, () => new Date('2026-08-24T02:36:00.000Z')).overview()

		expect(data).toMatchObject({ quality: 'degraded', stale: false })
		expect(data.data?.indices[0]?.value).toBe(3777.77)
		expect(data.data?.breadth?.advancing).toBe(3100)
		expect(data.staleAgeMs).toBeGreaterThan(0)
	})

	it('returns stale when all live capabilities fail but a last-good snapshot exists', async () => {
		const seed = new MarketService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z'))
		await seed.syncScheduled()

		const data = await new MarketService(runtimeEnv(), failingProvider(), () => new Date('2026-08-24T02:40:00.000Z')).overview()

		expect(data).toMatchObject({ quality: 'stale', stale: true })
		expect(data.data?.indices[0]?.value).toBe(3666.12)
		expect(data.data?.breadth?.total).toBe(5120)
		expect(data.staleAgeMs).toBeGreaterThan(0)
	})

	it('returns unavailable instead of synthetic values when live and D1 are both empty', async () => {
		const data = await new MarketService(runtimeEnv(), failingProvider(), () => new Date('2026-08-24T02:40:00.000Z')).overview()

		expect(data).toEqual({
			data: null,
			source: [],
			fetchedAt: null,
			marketAt: null,
			stale: false,
			staleAgeMs: null,
			quality: 'unavailable',
		})
	})
})

describe('market scheduled sync and sector history', () => {
	it('does not call any upstream provider outside the configured market window', async () => {
		const fake = provider()
		const data = await new MarketService(runtimeEnv(), fake, () => new Date('2026-08-23T02:30:00.000Z')).syncScheduled()

		expect(data).toMatchObject({ status: 'skipped', reason: 'outside-market-window' })
		expect(fake.fetchIndices).not.toHaveBeenCalled()
		expect(fake.fetchBreadth).not.toHaveBeenCalled()
		expect(fake.fetchSectorFlows).not.toHaveBeenCalled()
	})

	it('anchors persisted breadth to the index trading timestamp when breadth has no exchange timestamp', async () => {
		const indexAt = '2026-08-21T07:00:00.000Z'
		const breadthFetchedAt = '2026-08-24T02:31:00.000Z'
		const fake = provider({
			fetchIndices: vi.fn(async () => result(indices(3666.12, indexAt), indexAt)),
			fetchBreadth: vi.fn(async () => result(breadth(breadthFetchedAt), breadthFetchedAt)),
		})

		await new MarketService(runtimeEnv(), fake, () => new Date('2026-08-24T02:31:00.000Z')).syncScheduled()

		const row = await testEnv.DB.prepare(`
			SELECT trade_date, breadth_json FROM market_daily_snapshot WHERE trade_date = '2026-08-21'
		`).first<{ trade_date: string, breadth_json: string | null }>()
		const storedBreadth = JSON.parse(row?.breadth_json || 'null') as MarketBreadth | null
		expect(row?.trade_date).toBe('2026-08-21')
		expect(storedBreadth?.marketAt).toBe(indexAt)
	})

	it('keeps successful capabilities when another sector capability fails and records bounded health errors', async () => {
		const longError = `concept disconnected ${'x'.repeat(700)}`
		const fake = provider({
			fetchSectorFlows: vi.fn(async (kind) => {
				if (kind === 'concept')
					throw new Error(longError)
				return result(sector(kind))
			}),
		})
		const sync = await new MarketService(runtimeEnv(), fake, () => new Date('2026-08-24T02:31:00.000Z')).syncScheduled()

		expect(sync.status).toBe('partial')
		const counts = await testEnv.DB.prepare(`
			SELECT sector_kind, COUNT(*) AS count FROM market_sector_flow_daily GROUP BY sector_kind ORDER BY sector_kind
		`).all<{ sector_kind: string, count: number }>()
		expect(counts.results).toEqual([{ sector_kind: 'industry', count: 1 }])
		const health = await testEnv.DB.prepare(`
			SELECT status, last_error FROM market_source_health WHERE capability = 'sector-concept'
		`).first<{ status: string, last_error: string | null }>()
		expect(health?.status).toBe('failed')
		expect(health?.last_error?.length).toBeLessThanOrEqual(500)
	})

	it('upserts the same sector on the same trading day instead of duplicating it', async () => {
		const first = provider({ fetchSectorFlows: vi.fn(async kind => result(sector(kind, 100))) })
		await new MarketService(runtimeEnv(), first, () => new Date('2026-08-24T02:31:00.000Z')).syncScheduled()
		const second = provider({ fetchSectorFlows: vi.fn(async kind => result(sector(kind, 200))) })
		await new MarketService(runtimeEnv(), second, () => new Date('2026-08-24T02:32:00.000Z')).syncScheduled()

		const row = await testEnv.DB.prepare(`
			SELECT COUNT(*) AS count, MAX(main_net_inflow) AS amount
			FROM market_sector_flow_daily
			WHERE trade_date = '2026-08-24' AND sector_kind = 'industry' AND sector_code = 'BK1036'
		`).first<{ count: number, amount: number }>()
		expect(row).toEqual({ count: 1, amount: 200 })
	})

	it('calculates 1/3/5/10/20 day windows from actual stored trading days', async () => {
		await seedSectorHistory('industry', 'BK1036', 19, 10)
		const live = provider({ fetchSectorFlows: vi.fn(async kind => result(sector(kind, kind === 'industry' ? 20 : 1))) })
		const data = await new MarketService(runtimeEnv(), live, () => new Date('2026-08-24T02:31:00.000Z')).sectorFlows('industry', 20)
		const item = data.data?.[0]

		expect(data.quality).toBe('live')
		expect(item?.windows).toEqual([
			{ days: 1, netInflow: 20, availableDays: 1, complete: true },
			{ days: 3, netInflow: 40, availableDays: 3, complete: true },
			{ days: 5, netInflow: 60, availableDays: 5, complete: true },
			{ days: 10, netInflow: 110, availableDays: 10, complete: true },
			{ days: 20, netInflow: 210, availableDays: 20, complete: true },
		])
	})

	it('does not skip a trading day with a missing fund-flow value to pull in an older day', async () => {
		await seedSectorHistory('industry', 'BK1036', 3, 10)
		await testEnv.DB.prepare(`
			UPDATE market_sector_flow_daily
			SET main_net_inflow = NULL
			WHERE trade_date = '2026-08-21' AND sector_kind = 'industry' AND sector_code = 'BK1036'
		`).run()
		const live = provider({ fetchSectorFlows: vi.fn(async kind => result(sector(kind, kind === 'industry' ? 20 : 1))) })
		const data = await new MarketService(runtimeEnv(), live, () => new Date('2026-08-24T02:31:00.000Z')).sectorFlows('industry', 20)
		const item = data.data?.[0]

		expect(item?.windows.find(window => window.days === 3)).toEqual({
			days: 3,
			netInflow: null,
			availableDays: 3,
			complete: false,
		})
		expect(item?.windows.find(window => window.days === 5)).toEqual({
			days: 5,
			netInflow: null,
			availableDays: 4,
			complete: false,
		})
	})

	it('marks a long window incomplete when only part of the trading history exists', async () => {
		await seedSectorHistory('industry', 'BK1036', 3, 10)
		const live = provider({ fetchSectorFlows: vi.fn(async kind => result(sector(kind, kind === 'industry' ? 20 : 1))) })
		const data = await new MarketService(runtimeEnv(), live, () => new Date('2026-08-24T02:31:00.000Z')).sectorFlows('industry', 20)
		const window20 = data.data?.[0]?.windows.find(window => window.days === 20)

		expect(window20).toEqual({ days: 20, netInflow: 50, availableDays: 4, complete: false })
	})
})
