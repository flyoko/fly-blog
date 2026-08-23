import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { CiticFuturesProduct, CiticFuturesSeries, MarketEnvelope, MarketOverview, SectorFlowItem } from '../../../shared/market'
import type { AppEnvironment, Env } from '../src/env'
import type { CiticPositionProvider } from '../src/features/market/cffex'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCffexCiticPositionCsv } from '../src/features/market/cffex'
import { FuturesPositionService } from '../src/features/market/futures-position-service'
import { createPublicMarketRoutes } from '../src/features/market/routes'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'
import { scheduledJobsFor } from '../src/scheduled-tasks'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

const csv = [
	'交易日,合约,排名,成交量排名,,,持买单量排名,,,持卖单量排名,,',
	',,,会员简称,成交量,比上一交易日增减,会员简称,持买单量,比上一交易日增减,会员简称,持卖单量,比上一交易日增减',
	'20260821,IF2609,1,中信期货(代客),29100,3542,中信期货(代客),20721,3077,中信期货(代客),28074,3305',
	'20260821,IF2612,1,中信期货(代客),10183,4158,中信期货(代客),8020,2038,中信期货(代客),16012,1169',
].join('\n')

function point(product: CiticFuturesProduct, value = 1000) {
	return {
		tradeDate: '2026-08-24',
		product,
		longPosition: value,
		longChange: 100,
		shortPosition: value - 200,
		shortChange: 50,
		netPosition: 200,
		netChange: 50,
		contractCount: 2,
		longRankedContractCount: 2,
		shortRankedContractCount: 2,
		complete: true,
	}
}

async function insertDay(tradeDate: string, values: Record<CiticFuturesProduct, [number, number, number, number]>) {
	for (const product of ['IF', 'IH', 'IC', 'IM'] as const) {
		const [longPosition, longChange, shortPosition, shortChange] = values[product]
		await testEnv.DB.prepare(`
			INSERT INTO citic_futures_position_daily (
				trade_date, product, long_position, long_change, short_position, short_change,
				net_position, net_change, contract_count, long_ranked_contract_count,
				short_ranked_contract_count, complete, source_url, fetched_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?, ?)
		`).bind(
			tradeDate,
			product,
			longPosition,
			longChange,
			shortPosition,
			shortChange,
			longPosition - shortPosition,
			longChange - shortChange,
			`http://www.cffex.com.cn/${product}.csv`,
			`${tradeDate}T09:30:00.000Z`,
			`${tradeDate}T09:30:00.000Z`,
		).run()
	}
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))

beforeEach(async () => {
	await testEnv.DB.prepare('DELETE FROM citic_futures_position_daily').run()
})

describe('citic futures position', () => {
	it('aggregates Citic Futures long and short rankings across contracts', () => {
		expect(parseCffexCiticPositionCsv(csv, 'IF', '2026-08-21')).toEqual({
			tradeDate: '2026-08-21',
			product: 'IF',
			longPosition: 28741,
			longChange: 5115,
			shortPosition: 44086,
			shortChange: 4474,
			netPosition: -15345,
			netChange: 641,
			contractCount: 2,
			longRankedContractCount: 2,
			shortRankedContractCount: 2,
			complete: true,
		})
	})

	it('does not treat a missing ranking side as a complete zero position', () => {
		const partialCsv = `${csv}\n20260821,IF2703,1,海通期货(代客),100,0,中信期货(代客),2203,360,国泰君安(代客),1473,-175`
		const parsed = parseCffexCiticPositionCsv(partialCsv, 'IF', '2026-08-21')
		expect(parsed.contractCount).toBe(3)
		expect(parsed.longRankedContractCount).toBe(3)
		expect(parsed.shortRankedContractCount).toBe(2)
		expect(parsed.complete).toBe(false)
	})

	it('matches the verified aggregate figures for 2026-08-18 and 2026-08-19', async () => {
		await insertDay('2026-08-18', {
			IF: [29914, -369, 47913, -599],
			IH: [12778, 275, 24428, 196],
			IC: [47638, 3395, 58753, 12],
			IM: [63052, -1802, 87791, -2968],
		})
		await insertDay('2026-08-19', {
			IF: [33040, 3126, 51549, 3636],
			IH: [13743, 965, 25877, 1449],
			IC: [50970, 3332, 62299, 3546],
			IM: [70790, 7738, 97451, 9660],
		})
		const service = new FuturesPositionService(runtimeEnv(), {} as CiticPositionProvider, () => new Date('2026-08-20T06:00:00.000Z'))
		const history = await service.history('ALL', 30)

		expect(history.productName).toBe('股指期货合计')
		expect(history.items).toEqual([
			expect.objectContaining({ tradeDate: '2026-08-18', longChange: 1499, shortChange: -3359, netChange: 4858, complete: true }),
			expect.objectContaining({ tradeDate: '2026-08-19', longChange: 15161, shortChange: 18291, netChange: -3130, complete: true }),
		])
	})

	it('marks an aggregate day degraded if any product is missing', async () => {
		await insertDay('2026-08-19', {
			IF: [33040, 3126, 51549, 3636],
			IH: [13743, 965, 25877, 1449],
			IC: [50970, 3332, 62299, 3546],
			IM: [70790, 7738, 97451, 9660],
		})
		await testEnv.DB.prepare(`DELETE FROM citic_futures_position_daily WHERE trade_date = '2026-08-19' AND product = 'IM'`).run()
		const service = new FuturesPositionService(runtimeEnv(), {} as CiticPositionProvider, () => new Date('2026-08-20T06:00:00.000Z'))
		const history = await service.history('ALL', 30)
		expect(history.items[0]?.complete).toBe(false)
		expect(history.quality).toBe('degraded')
	})

	it('upserts the same trading day idempotently and reads a 30-day history', async () => {
		const fetchProduct = vi.fn(async (product: CiticFuturesProduct) => ({
			data: point(product),
			sourceUrl: `http://www.cffex.com.cn/${product}.csv`,
			fetchedAt: '2026-08-24T09:31:00.000Z',
		}))
		const provider: CiticPositionProvider = { fetchProduct }
		const service = new FuturesPositionService(runtimeEnv(), provider, () => new Date('2026-08-24T09:35:00.000Z'))

		await expect(service.syncScheduled('2026-08-24T09:30:00.000Z')).resolves.toMatchObject({ status: 'success', itemCount: 4 })
		await expect(service.syncScheduled('2026-08-24T09:30:00.000Z')).resolves.toMatchObject({ status: 'success', itemCount: 4 })

		const count = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM citic_futures_position_daily').first<{ count: number }>()
		expect(count?.count).toBe(4)
		const history = await service.history('ALL', 30)
		expect(history.quality).toBe('live')
		expect(history.items).toHaveLength(1)
		expect(history.items[0]).toMatchObject({ product: 'ALL', longChange: 400, shortChange: 200, netChange: 200 })
	})

	it('skips non-trading days without calling the provider', async () => {
		const fetchProduct = vi.fn()
		const service = new FuturesPositionService(runtimeEnv(), { fetchProduct }, () => new Date('2026-08-23T09:35:00.000Z'))
		await expect(service.syncScheduled('2026-08-23T09:30:00.000Z')).resolves.toMatchObject({ status: 'skipped', reason: 'non-trading-day' })
		expect(fetchProduct).not.toHaveBeenCalled()
	})

	it('removes rows older than the inclusive 30-calendar-day retention window', async () => {
		await testEnv.DB.prepare(`
			INSERT INTO citic_futures_position_daily (
				trade_date, product, long_position, long_change, short_position, short_change,
				net_position, net_change, contract_count, long_ranked_contract_count,
				short_ranked_contract_count, complete, source_url, fetched_at, updated_at
			) VALUES ('2026-07-25', 'IF', 10, 1, 8, 0, 2, 1, 1, 1, 1, 1, 'http://example.invalid/old.csv', '2026-07-25T09:30:00.000Z', '2026-07-25T09:30:00.000Z')
		`).run()
		const provider: CiticPositionProvider = {
			fetchProduct: async product => ({
				data: point(product),
				sourceUrl: `http://www.cffex.com.cn/${product}.csv`,
				fetchedAt: '2026-08-24T09:31:00.000Z',
			}),
		}
		const service = new FuturesPositionService(runtimeEnv(), provider, () => new Date('2026-08-24T09:35:00.000Z'))
		await service.syncScheduled('2026-08-24T09:30:00.000Z')
		const old = await testEnv.DB.prepare(`SELECT trade_date FROM citic_futures_position_daily WHERE trade_date = '2026-07-25'`).first()
		expect(old).toBeNull()
	})

	it('routes the weekday post-close cron to the Citic futures job', () => {
		expect(scheduledJobsFor('30 9 * * 1-5')).toEqual(['citic-futures-sync'])
	})

	it('serves aggregate history by default and supports product drilldown', async () => {
		const unavailable: MarketEnvelope<MarketOverview> = {
			data: null,
			source: [],
			fetchedAt: null,
			marketAt: null,
			stale: false,
			staleAgeMs: null,
			quality: 'unavailable',
		}
		const market = {
			overview: vi.fn(async () => unavailable),
			sectorFlows: vi.fn(async () => ({ ...unavailable, data: [] as SectorFlowItem[] })),
			listVersion: vi.fn(async () => 'test-version'),
		}
		const futures = {
			history: vi.fn(async (product: CiticFuturesSeries) => ({
				product,
				productName: product === 'ALL' ? '股指期货合计' : '股指期货',
				brokerName: '中信期货(代客)' as const,
				sourceName: '中国金融期货交易所' as const,
				sourceUrl: 'http://www.cffex.com.cn/ccpm/',
				fetchedAt: null,
				quality: 'unavailable' as const,
				items: [],
			})),
		}
		const app = new Hono<AppEnvironment>()
		app.use('*', contextMiddleware)
		app.route('/api/market', createPublicMarketRoutes(() => market, () => futures))
		app.onError((error, c) => failure(c, normalizeError(error)))

		const aggregate = await app.request('/api/market/citic-futures-positions?days=30', {}, {} as Env)
		expect(aggregate.status).toBe(200)
		expect(futures.history).toHaveBeenCalledWith('ALL', 30)

		const product = await app.request('/api/market/citic-futures-positions?product=IF&days=30', {}, {} as Env)
		expect(product.status).toBe(200)
		expect(futures.history).toHaveBeenCalledWith('IF', 30)

		const sectorResponse = await app.request('/api/market/sector-flows?kind=industry&limit=600', {}, {} as Env)
		expect(sectorResponse.status).toBe(200)
		expect(market.sectorFlows).toHaveBeenCalledWith('industry', 600)

		for (const url of [
			'/api/market/citic-futures-positions?product=XX',
			'/api/market/citic-futures-positions?product=ALL&days=31',
			'/api/market/sector-flows?kind=industry&limit=601',
		]) {
			const response = await app.request(url, {}, {} as Env)
			expect(response.status).toBe(400)
		}
	})
})
