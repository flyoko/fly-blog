import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { MarketObservationCapability, MarketObservationStatus } from '../../../shared/market'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
	MARKET_SYNC_INTERVAL_MINUTES,
	MARKET_SYNC_SLOTS_PER_TRADING_DAY,
	MARKET_SYNC_WINDOWS,
} from '../src/features/market/contracts'
import { MarketObservabilityService, recordMarketSourceObservation } from '../src/features/market/observability'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function scheduledSlots(tradeDate: string): string[] {
	const [year, month, day] = tradeDate.split('-').map(Number)
	return MARKET_SYNC_WINDOWS.flatMap((window) => {
		const slots: string[] = []
		for (let minute = window.startMinute; minute <= window.endMinute; minute += MARKET_SYNC_INTERVAL_MINUTES) {
			const localAsUtc = Date.UTC(year!, month! - 1, day!, 0, minute)
			slots.push(new Date(localAsUtc - SHANGHAI_OFFSET_MS).toISOString())
		}
		return slots
	})
}

async function seedRows(rows: Array<{
	tradeDate: string
	capability: MarketObservationCapability
	status: MarketObservationStatus
	itemCount: number
	expectedItemCount: number | null
	missingCount: number
	latencyMs: number | null
	endpoint: string | null
	scheduledAt: string
}>) {
	for (let offset = 0; offset < rows.length; offset += 50) {
		const statements = rows.slice(offset, offset + 50).map(row => testEnv.DB.prepare(`
			INSERT INTO market_source_observation (
				trade_date, capability, source_id, status, item_count, expected_item_count,
				missing_count, latency_ms, endpoint, scheduled_at, observed_at
			) VALUES (?, ?, 'fixture-source', ?, ?, ?, ?, ?, ?, ?, ?)
		`).bind(
			row.tradeDate,
			row.capability,
			row.status,
			row.itemCount,
			row.expectedItemCount,
			row.missingCount,
			row.latencyMs,
			row.endpoint,
			row.scheduledAt,
			row.scheduledAt,
		))
		await testEnv.DB.batch(statements)
	}
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.prepare('DELETE FROM market_source_observation').run()
})

describe('market production observability', () => {
	it('creates an idempotent source observation table and de-duplicates queue retries by cron slot', async () => {
		const table = await testEnv.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'market_source_observation'`).first<{ name: string }>()
		expect(table?.name).toBe('market_source_observation')
		const scheduledAt = '2026-08-24T02:30:00.000Z'
		await recordMarketSourceObservation(runtimeEnv(), {
			capability: 'indices',
			status: 'failed',
			sourceId: 'eastmoney-push2',
			endpoint: null,
			itemCount: 0,
			expectedItemCount: null,
			missingCount: 0,
			latencyMs: null,
			scheduledAt,
			observedAt: '2026-08-24T02:30:02.000Z',
		})
		await recordMarketSourceObservation(runtimeEnv(), {
			capability: 'indices',
			status: 'success',
			sourceId: 'eastmoney-push2',
			endpoint: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get',
			itemCount: 3,
			expectedItemCount: null,
			missingCount: 0,
			latencyMs: 120,
			scheduledAt,
			observedAt: '2026-08-24T02:30:05.000Z',
		})
		const rows = await testEnv.DB.prepare('SELECT status, endpoint, latency_ms FROM market_source_observation').all<{
			status: string
			endpoint: string | null
			latency_ms: number | null
		}>()
		expect(rows.results).toEqual([{ status: 'success', endpoint: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get', latency_ms: 120 }])
		await expect(recordMarketSourceObservation(runtimeEnv(), {
			capability: 'indices',
			status: 'success',
			sourceId: 'eastmoney-push2',
			endpoint: null,
			itemCount: 3,
			expectedItemCount: null,
			missingCount: 0,
			latencyMs: 100,
			scheduledAt: '2026-08-24T02:31:00.000Z',
		})).rejects.toThrow(/valid market cron slot/i)
	})

	it('does not call a five-day P1 SLA complete when only one cron slot per trading day was sampled', async () => {
		const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']
		await seedRows(days.map(tradeDate => ({
			tradeDate,
			capability: 'indices' as const,
			status: 'success' as const,
			itemCount: 3,
			expectedItemCount: null,
			missingCount: 0,
			latencyMs: 100,
			endpoint: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get',
			scheduledAt: scheduledSlots(tradeDate)[0]!,
		})))
		const report = await new MarketObservabilityService(runtimeEnv(), () => new Date('2026-08-28T08:30:00.000Z')).report(5)
		const indices = report.metrics.find(item => item.capability === 'indices')!
		expect(indices.attemptCount).toBe(5)
		expect(indices.expectedAttemptCount).toBe(5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY)
		expect(indices.observedTradingDays).toBe(5)
		expect(indices.complete).toBe(false)
		expect(indices.verdict).toBe('incomplete')
		expect(report.window.complete).toBe(false)
	})

	it('aggregates all 57 daily cron slots across five completed trading days without inventing P2A long-term gates', async () => {
		const days = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28']
		const rows: Parameters<typeof seedRows>[0] = []
		let globalSlot = 0
		for (const [dayIndex, tradeDate] of days.entries()) {
			for (const scheduledAt of scheduledSlots(tradeDate)) {
				rows.push({
					tradeDate,
					capability: 'indices',
					status: 'success',
					itemCount: 3,
					expectedItemCount: null,
					missingCount: 0,
					latencyMs: (dayIndex + 1) * 100,
					endpoint: dayIndex < 2
						? 'https://push2.eastmoney.com/api/qt/ulist.np/get'
						: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get',
					scheduledAt,
				})
				rows.push({
					tradeDate,
					capability: 'breadth',
					status: 'success',
					itemCount: 1,
					expectedItemCount: null,
					missingCount: 0,
					latencyMs: 150,
					endpoint: 'https://push2ex.eastmoney.com/getTopicZDFenBu',
					scheduledAt,
				})
				rows.push({
					tradeDate,
					capability: 'sector-industry',
					status: globalSlot < 6 ? 'failed' : 'success',
					itemCount: globalSlot < 6 ? 0 : 100,
					expectedItemCount: null,
					missingCount: 0,
					latencyMs: globalSlot < 6 ? null : 200,
					endpoint: globalSlot < 6 ? null : 'https://push2delay.eastmoney.com/api/qt/clist/get',
					scheduledAt,
				})
				rows.push({
					tradeDate,
					capability: 'sector-concept',
					status: 'success',
					itemCount: 100,
					expectedItemCount: null,
					missingCount: 0,
					latencyMs: 220,
					endpoint: 'https://push2delay.eastmoney.com/api/qt/clist/get',
					scheduledAt,
				})
				globalSlot += 1
			}
			rows.push({
				tradeDate,
				capability: 'watchlist-sync',
				status: dayIndex === 4 ? 'partial' : 'success',
				itemCount: dayIndex === 4 ? 29 : 30,
				expectedItemCount: 30,
				missingCount: dayIndex === 4 ? 1 : 0,
				latencyMs: 180,
				endpoint: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get',
				scheduledAt: scheduledSlots(tradeDate).at(-1)!,
			})
		}
		await seedRows(rows)

		const report = await new MarketObservabilityService(runtimeEnv(), () => new Date('2026-08-28T08:30:00.000Z')).report(5)
		expect(report.window.expectedTradingDates).toEqual(days)
		expect(report.window.complete).toBe(true)

		const indices = report.metrics.find(item => item.capability === 'indices')!
		expect(indices).toMatchObject({
			attemptCount: 5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY,
			expectedAttemptCount: 5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY,
			batchSuccessRate: 1,
			targetBatchSuccessRate: 0.99,
			verdict: 'pass',
			p50LatencyMs: 300,
			p95LatencyMs: 500,
		})
		expect(indices.endpoints).toEqual([
			{ endpoint: 'https://push2delay.eastmoney.com/api/qt/ulist.np/get', count: 3 * MARKET_SYNC_SLOTS_PER_TRADING_DAY },
			{ endpoint: 'https://push2.eastmoney.com/api/qt/ulist.np/get', count: 2 * MARKET_SYNC_SLOTS_PER_TRADING_DAY },
		])

		const industry = report.metrics.find(item => item.capability === 'sector-industry')!
		expect(industry.attemptCount).toBe(5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY)
		expect(industry.batchSuccessRate).toBeCloseTo((5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY - 6) / (5 * MARKET_SYNC_SLOTS_PER_TRADING_DAY))
		expect(industry.targetBatchSuccessRate).toBe(0.98)
		expect(industry.verdict).toBe('fail')

		const watchlist = report.metrics.find(item => item.capability === 'watchlist-sync')!
		expect(watchlist.expectedAttemptCount).toBeNull()
		expect(watchlist.batchSuccessRate).toBe(1)
		expect(watchlist.validReturnRate).toBeCloseTo(149 / 150)
		expect(watchlist.targetBatchSuccessRate).toBeNull()
		expect(watchlist.targetValidReturnRate).toBeNull()
		expect(watchlist.verdict).toBe('observe')
	})
})
