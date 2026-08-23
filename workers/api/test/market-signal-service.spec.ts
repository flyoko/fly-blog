import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { MarketSignalDeskResponse, StockSymbol, WatchlistItem } from '../../../shared/market'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MarketSignalService } from '../src/features/market/signal-service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))

beforeEach(async () => {
	await testEnv.DB.prepare('DELETE FROM market_watchlist_quote_5m').run()
	await testEnv.DB.prepare('DELETE FROM market_watchlist').run()
})

describe('market signal schema contracts', () => {
	it('creates the private signal table', async () => {
		const row = await testEnv.DB.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'market_watchlist_signal\'').first<{ name: string }>()
		expect(row?.name).toBe('market_watchlist_signal')
	})

	it('enforces idempotent signal uniqueness and cascades with watchlist deletion only', async () => {
		await testEnv.DB.prepare(`
			INSERT INTO market_watchlist (
				owner_id, symbol, exchange, stock_code, stock_name, sort_order,
				note, attention_price, tags_json, enabled, created_at, updated_at
			) VALUES ('owner-a', 'SZSE:300308', 'SZSE', '300308', '中际旭创', 0, NULL, 150, '[]', 1, '2026-08-24T02:30:00.000Z', '2026-08-24T02:30:00.000Z')
		`).run()
		await testEnv.DB.prepare(`
			INSERT INTO market_watchlist_quote_5m (
				owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
				open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
			) VALUES ('owner-a', 'SZSE:300308', '2026-08-24T02:30:00.000Z', '2026-08-24T02:30:00.000Z', '2026-08-24T02:30:05.000Z', 150, 1, 0.67, 149, 151, 148, 149, 1000, 20000000, 1.2, 'seed-source', '2026-08-24T02:30:05.000Z')
		`).run()
		const insertSignal = () => testEnv.DB.prepare(`
			INSERT INTO market_watchlist_signal (
				id, owner_id, symbol, bucket_at, market_at, detected_at, signal_type, direction, severity,
				score, title, evidence_json, engine_version, source_id, created_at
			) VALUES (?, 'owner-a', 'SZSE:300308', '2026-08-24T02:35:00.000Z', '2026-08-24T02:35:00.000Z', '2026-08-24T02:35:05.000Z',
				'momentum_up', 'up', 'watch', 65, '放量上冲', '{}', 'balanced-v1', 'seed-source', '2026-08-24T02:35:05.000Z')
		`).bind(crypto.randomUUID()).run()

		await insertSignal()
		await expect(insertSignal()).rejects.toThrow()
		await testEnv.DB.prepare('DELETE FROM market_watchlist WHERE owner_id = \'owner-a\' AND symbol = \'SZSE:300308\'').run()

		const signals = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_signal WHERE owner_id = \'owner-a\'').first<{ count: number }>()
		const snapshots = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m WHERE owner_id = \'owner-a\'').first<{ count: number }>()
		expect(Number(signals?.count || 0)).toBe(0)
		expect(Number(snapshots?.count || 0)).toBe(1)
	})

	it('supports the typed signal desk response shape', () => {
		const desk: MarketSignalDeskResponse = {
			engineVersion: 'balanced-v1',
			marketAt: '2026-08-24T02:35:00.000Z',
			baseline: { enabledCount: 1, readyCount: 1, warmingCount: 0 },
			items: [{
				id: 'sig_1',
				symbol: 'SZSE:300308',
				code: '300308',
				name: '中际旭创',
				signalType: 'momentum_up',
				direction: 'up',
				severity: 'watch',
				score: 65,
				title: '放量上冲',
				marketAt: '2026-08-24T02:35:00.000Z',
				detectedAt: '2026-08-24T02:35:05.000Z',
				engineVersion: 'balanced-v1',
				evidence: {
					factors: ['TURNOVER_SURGE', 'PRICE_ACCELERATION', 'DIRECTION_ALIGNMENT'],
					priceMove5mPct: 1.2,
					priceMove10mPct: null,
					flowBasis: 'turnover',
					flowDelta: 18_200_000,
					flowRatio: 2.4,
					rangeHigh: null,
					rangeLow: null,
					attentionPrice: null,
				},
			}],
		}
		expect(desk.items[0]?.severity).toBe('watch')
	})
})

function shanghaiIso(date: string, time: string) {
	return new Date(`${date}T${time}:00+08:00`).toISOString()
}

async function seedWatchlist(ownerId: string, symbol: StockSymbol, attentionPrice: number | null = null, enabled = true) {
	const [exchange, code] = symbol.split(':')
	await testEnv.DB.prepare(`
		INSERT INTO market_watchlist (
			owner_id, symbol, exchange, stock_code, stock_name, sort_order,
			note, attention_price, tags_json, enabled, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, '[]', ?, ?, ?)
	`).bind(ownerId, symbol, exchange, code, `股票${code}`, attentionPrice, enabled ? 1 : 0, shanghaiIso('2026-08-18', '09:30'), shanghaiIso('2026-08-18', '09:30')).run()
}

function watchlistItem(ownerSymbol: StockSymbol, attentionPrice: number | null = null, enabled = true): WatchlistItem {
	const [exchange, code] = ownerSymbol.split(':') as ['SSE' | 'SZSE' | 'BSE', string]
	return {
		symbol: ownerSymbol,
		exchange,
		code,
		name: `股票${code}`,
		sortOrder: 0,
		note: null,
		attentionPrice,
		tags: [],
		enabled,
		createdAt: shanghaiIso('2026-08-18', '09:30'),
		updatedAt: shanghaiIso('2026-08-18', '09:30'),
	}
}

async function seedSignalSnapshot(ownerId: string, symbol: StockSymbol, date: string, time: string, price: number, turnover: number | null) {
	const at = shanghaiIso(date, time)
	await testEnv.DB.prepare(`
		INSERT INTO market_watchlist_quote_5m (
			owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
			open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, NULL, 99, NULL, ?, NULL, 'seed-source', ?)
	`).bind(ownerId, symbol, at, at, at, price, turnover, at).run()
}

async function seedSameSlot(ownerId: string, symbol: StockSymbol, delta: number, dates = ['2026-08-19', '2026-08-20', '2026-08-21']) {
	for (const date of dates) {
		await seedSignalSnapshot(ownerId, symbol, date, '10:30', 99, 100_000_000)
		await seedSignalSnapshot(ownerId, symbol, date, '10:35', 99.1, 100_000_000 + delta)
	}
}

async function seedPersistedSignal(options: {
	id: string
	ownerId: string
	symbol: StockSymbol
	marketAt: string
	type?: string
	direction?: 'up' | 'down' | 'neutral'
	severity?: 'watch' | 'strong'
	score?: number
	engineVersion?: string
}) {
	await testEnv.DB.prepare(`
		INSERT INTO market_watchlist_signal (
			id, owner_id, symbol, bucket_at, market_at, detected_at, signal_type, direction, severity,
			score, title, evidence_json, engine_version, source_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', '{}', ?, 'seed-source', ?)
	`).bind(
		options.id,
		options.ownerId,
		options.symbol,
		options.marketAt,
		options.marketAt,
		options.marketAt,
		options.type ?? 'momentum_up',
		options.direction ?? 'up',
		options.severity ?? 'watch',
		options.score ?? 60,
		options.engineVersion ?? 'balanced-v1',
		options.marketAt,
	).run()
}

describe('market signal service evaluation', () => {
	it('keeps owner history isolated while evaluating multiple targets', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedWatchlist('owner-b', 'SZSE:300502')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSameSlot('owner-b', 'SZSE:300502', 60_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 101.2, 112_000_000)
		await seedSignalSnapshot('owner-b', 'SZSE:300502', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-b', 'SZSE:300502', '2026-08-24', '10:35', 100.1, 112_000_000)

		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		const result = await service.evaluateAffected([
			{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308') },
			{ ownerId: 'owner-b', watchlist: watchlistItem('SZSE:300502') },
		])

		expect(result).toMatchObject({ evaluatedCount: 2, readyCount: 2, warmingCount: 0, signalCount: 1, strongCount: 0 })
		const rows = await testEnv.DB.prepare('SELECT owner_id, symbol, score FROM market_watchlist_signal ORDER BY owner_id').all<{ owner_id: string, symbol: string, score: number }>()
		expect(rows.results).toEqual([{ owner_id: 'owner-a', symbol: 'SZSE:300308', score: 65 }])
	})

	it('suppresses an ordinary same-direction signal inside 20 minutes but allows the opposite direction', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 101.2, 112_000_000)
		await seedPersistedSignal({ id: 'prior-up', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-08-24', '10:20'), score: 60 })
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		expect((await service.evaluateAffected([{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308') }])).signalCount).toBe(0)

		await testEnv.DB.prepare('DELETE FROM market_watchlist_signal').run()
		await seedPersistedSignal({ id: 'prior-down', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-08-24', '10:20'), direction: 'down', type: 'momentum_down', score: 60 })
		expect((await service.evaluateAffected([{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308') }])).signalCount).toBe(1)
	})

	it('does not let a previous engine version suppress balanced-v1 cooldown', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 101.2, 112_000_000)
		await seedPersistedSignal({
			id: 'legacy-up',
			ownerId: 'owner-a',
			symbol: 'SZSE:300308',
			marketAt: shanghaiIso('2026-08-24', '10:20'),
			score: 60,
			engineVersion: 'balanced-v0',
		})
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))

		expect((await service.evaluateAffected([{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308') }])).signalCount).toBe(1)
	})

	it('lets a materially stronger signal penetrate cooldown without mutating the prior watch row', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 102, 120_000_000)
		await seedPersistedSignal({ id: 'prior-up', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-08-24', '10:20'), score: 65 })
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		const result = await service.evaluateAffected([{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308') }])
		expect(result).toMatchObject({ signalCount: 1, strongCount: 1 })
		const rows = await testEnv.DB.prepare('SELECT id, severity, score FROM market_watchlist_signal ORDER BY market_at').all<{ id: string, severity: string, score: number }>()
		expect(rows.results).toHaveLength(2)
		expect(rows.results[0]).toEqual({ id: 'prior-up', severity: 'watch', score: 65 })
		expect(rows.results[1]?.severity).toBe('strong')
		expect(rows.results[1]?.score).toBeGreaterThanOrEqual(80)
	})

	it('applies a 30-minute cooldown only against same-direction attention signals', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308', 100.5)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, null)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 100.6, null)
		await seedPersistedSignal({ id: 'prior-attn', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-08-24', '10:10'), type: 'attention_cross_up', score: 55 })
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		expect((await service.evaluateAffected([{ ownerId: 'owner-a', watchlist: watchlistItem('SZSE:300308', 100.5) }])).signalCount).toBe(0)
	})
})

describe('market signal service list and lifecycle', () => {
	it('uses Asia/Shanghai day boundaries and owner isolation for today', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedWatchlist('owner-b', 'SZSE:300502')
		await seedPersistedSignal({ id: 'before-today', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: '2026-08-23T15:59:00.000Z' })
		await seedPersistedSignal({ id: 'today-a', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: '2026-08-23T16:00:00.000Z' })
		await seedPersistedSignal({ id: 'today-b', ownerId: 'owner-b', symbol: 'SZSE:300502', marketAt: '2026-08-24T01:00:00.000Z' })
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		const result = await service.list('owner-a', { scope: 'today', limit: 50 })
		expect(result.items.map(item => item.id)).toEqual(['today-a'])
		expect(result.items[0]?.symbol).toBe('SZSE:300308')
	})

	it('reports the latest real snapshot time even when no signal is persisted', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 100.1, 106_000_000)
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))

		const result = await service.list('owner-a')

		expect(result.items).toEqual([])
		expect(result.marketAt).toBe(shanghaiIso('2026-08-24', '10:35'))
	})

	it('returns complete today counts even when the visible list is limited', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		for (let index = 0; index < 55; index += 1) {
			const minute = 9 * 60 + 30 + index
			const hour = String(Math.floor(minute / 60)).padStart(2, '0')
			const minuteText = String(minute % 60).padStart(2, '0')
			await seedPersistedSignal({
				id: `today-${index}`,
				ownerId: 'owner-a',
				symbol: 'SZSE:300308',
				marketAt: shanghaiIso('2026-08-24', `${hour}:${minuteText}`),
				severity: index < 7 ? 'strong' : 'watch',
				score: index < 7 ? 80 : 60,
			})
		}
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '14:00')))

		const result = await service.list('owner-a', { scope: 'today', limit: 50 })

		expect(result.items).toHaveLength(50)
		expect(result.summary).toEqual({ totalCount: 55, strongCount: 7 })
	})

	it('keeps historical same-slot baselines ready across the 2026 Spring Festival closure', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000, ['2026-02-11', '2026-02-12', '2026-02-13'])
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-02-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-02-24', '10:35', 100.1, 106_000_000)
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-02-24', '10:35')))

		const result = await service.list('owner-a')

		expect(result.baseline).toEqual({ enabledCount: 1, readyCount: 1, warmingCount: 0 })
	})

	it('ignores future quote snapshots when resolving the current baseline and market time', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 100.1, 106_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '14:55', 120, 999_000_000)
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))

		const result = await service.list('owner-a')

		expect(result.marketAt).toBe(shanghaiIso('2026-08-24', '10:35'))
	})

	it('reports enabled baseline readiness separately from warming rows', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedWatchlist('owner-a', 'SZSE:300502')
		await seedSameSlot('owner-a', 'SZSE:300308', 6_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:30', 100, 100_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300308', '2026-08-24', '10:35', 100.1, 106_000_000)
		await seedSignalSnapshot('owner-a', 'SZSE:300502', '2026-08-24', '10:35', 100, null)
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		const result = await service.list('owner-a')
		expect(result.baseline).toEqual({ enabledCount: 2, readyCount: 1, warmingCount: 1 })
	})

	it('deletes only signals older than 30 days', async () => {
		await seedWatchlist('owner-a', 'SZSE:300308')
		await seedPersistedSignal({ id: 'old', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-07-20', '10:00') })
		await seedPersistedSignal({ id: 'recent', ownerId: 'owner-a', symbol: 'SZSE:300308', marketAt: shanghaiIso('2026-08-20', '10:00') })
		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '10:35')))
		const result = await service.cleanupRetention()
		expect(result.deleted).toBe(1)
		const rows = await testEnv.DB.prepare('SELECT id FROM market_watchlist_signal').all<{ id: string }>()
		expect(rows.results).toEqual([{ id: 'recent' }])
	})
})

describe('market signal service bounded load', () => {
	it('evaluates 30 stocks across the full bounded history window without query fan-out', async () => {
		const ownerId = 'owner-perf'
		const dates = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24']
		const minutes = [
			...Array.from({ length: 25 }, (_, index) => 9 * 60 + 30 + index * 5),
			...Array.from({ length: 25 }, (_, index) => 13 * 60 + index * 5),
		]
		const targets: Array<{ ownerId: string, watchlist: WatchlistItem }> = []
		const statements = []

		for (let stockIndex = 0; stockIndex < 30; stockIndex += 1) {
			const code = String(300000 + stockIndex).padStart(6, '0')
			const symbol = `SZSE:${code}` as StockSymbol
			await seedWatchlist(ownerId, symbol)
			targets.push({ ownerId, watchlist: watchlistItem(symbol) })
			for (const date of dates) {
				for (const [slotIndex, minute] of minutes.entries()) {
					const hour = String(Math.floor(minute / 60)).padStart(2, '0')
					const minuteText = String(minute % 60).padStart(2, '0')
					const at = shanghaiIso(date, `${hour}:${minuteText}`)
					statements.push(testEnv.DB.prepare(`
						INSERT INTO market_watchlist_quote_5m (
							owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
							open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
						) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, NULL, 99, NULL, ?, NULL, 'perf-source', ?)
					`).bind(ownerId, symbol, at, at, at, 100 + slotIndex * 0.001, (slotIndex + 1) * 5_000_000, at))
				}
			}
		}

		for (let offset = 0; offset < statements.length; offset += 200)
			await testEnv.DB.batch(statements.slice(offset, offset + 200))

		const service = new MarketSignalService({ ...testEnv } as never, () => new Date(shanghaiIso('2026-08-24', '15:00')))
		const startedAt = performance.now()
		const result = await service.evaluateAffected(targets)
		const elapsedMs = performance.now() - startedAt

		expect(statements).toHaveLength(9_000)
		expect(result).toMatchObject({ evaluatedCount: 30, readyCount: 30, warmingCount: 0, signalCount: 0 })
		expect(elapsedMs).toBeLessThan(2_000)
	}, 30_000)
})
