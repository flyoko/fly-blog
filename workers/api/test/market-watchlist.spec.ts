import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { StockQuote, StockSymbol } from '../../../shared/market'
import type { Env } from '../src/env'
import type { StockQuoteProvider, StockQuoteProviderResult } from '../src/features/market/contracts'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WatchlistService } from '../src/features/market/watchlist-service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const marketAt = '2026-08-24T02:30:00.000Z'
const fetchedAt = '2026-08-24T02:30:05.000Z'
const source = { sourceId: 'test-stock-source', sourceName: '测试个股源', endpoint: 'https://stocks.example.test' }

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function quote(symbol: StockSymbol, name = '中际旭创', price = 158.72): StockQuote {
	const code = symbol.split(':')[1]!
	return {
		symbol,
		code,
		name,
		price,
		change: 5.04,
		changePct: 3.28,
		open: 154,
		high: 160.85,
		low: 153.2,
		previousClose: 153.68,
		volume: 234567,
		turnover: 5432000000,
		turnoverRate: 2.72,
		marketAt,
	}
}

function provider(options: { missing?: StockSymbol[], fail?: boolean, marketAt?: string } = {}): StockQuoteProvider {
	return {
		sourceId: () => source.sourceId,
		fetchQuotes: vi.fn(async (symbols: StockSymbol[]): Promise<StockQuoteProviderResult> => {
			if (options.fail)
				throw new Error('stock upstream unavailable')
			const missing = options.missing || []
			const quotes = new Map<StockSymbol, StockQuote>()
			for (const symbol of symbols) {
				if (!missing.includes(symbol)) {
					const current = quote(symbol, symbol === 'SZSE:300502' ? '新易盛' : symbol === 'SSE:601899' ? '紫金矿业' : '中际旭创')
					quotes.set(symbol, options.marketAt ? { ...current, marketAt: options.marketAt } : current)
				}
			}
			return { quotes, missing: symbols.filter(symbol => !quotes.has(symbol)), source, fetchedAt, latencyMs: 21 }
		}),
	}
}

async function insertWatchlist(ownerId: string, symbol: StockSymbol, enabled = true, sortOrder = 0) {
	const [exchange, code] = symbol.split(':')
	await testEnv.DB.prepare(`
		INSERT INTO market_watchlist (
			owner_id, symbol, exchange, stock_code, stock_name, sort_order,
			note, attention_price, tags_json, enabled, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, '[]', ?, ?, ?)
	`).bind(ownerId, symbol, exchange, code, `股票${code}`, sortOrder, enabled ? 1 : 0, fetchedAt, fetchedAt).run()
}

async function insertSnapshot(ownerId: string, symbol: StockSymbol, price = 150, at = '2026-08-24T02:20:00.000Z') {
	await testEnv.DB.prepare(`
		INSERT INTO market_watchlist_quote_5m (
			owner_id, symbol, bucket_at, market_at, fetched_at, price, change_value, change_pct,
			open_price, high_price, low_price, previous_close, volume, turnover, turnover_rate, source_id, created_at
		) VALUES (?, ?, ?, ?, ?, ?, 1, 0.67, 149, 151, 148, 149, 1000, 2000, 1.2, 'seed-source', ?)
	`).bind(ownerId, symbol, at, at, fetchedAt, price, fetchedAt).run()
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM market_watchlist_quote_5m'),
		testEnv.DB.prepare('DELETE FROM market_source_observation'),
		testEnv.DB.prepare('DELETE FROM market_watchlist'),
		testEnv.DB.prepare('DELETE FROM market_source_health WHERE capability = \'watchlist-sync\''),
	])
})

describe('market watchlist schema and capacity', () => {
	it('creates private watchlist tables', async () => {
		for (const table of ['market_watchlist', 'market_watchlist_quote_5m']) {
			const row = await testEnv.DB.prepare('SELECT name FROM sqlite_master WHERE type = \'table\' AND name = ?')
				.bind(table)
				.first<{ name: string }>()
			expect(row?.name).toBe(table)
		}
	})

	it('enforces the global 30-row limit in D1 including disabled rows', async () => {
		for (let index = 0; index < 30; index++) {
			const code = `30${String(index).padStart(4, '0')}` as `${number}`
			await insertWatchlist('owner-a', `SZSE:${code}` as StockSymbol, index % 2 === 0)
		}
		await expect(insertWatchlist('owner-b', 'SSE:601899')).rejects.toThrow(/market_watchlist_limit/i)
	})
})

describe('watchlist service CRUD', () => {
	it('adds a verified stock name and owner-scoped private configuration', async () => {
		const fake = provider()
		const service = new WatchlistService(runtimeEnv(), fake, () => new Date(fetchedAt))
		const added = await service.add('owner-a', { symbol: 'SZSE:300308', attentionPrice: 150, note: ' CPO ', tags: [' CPO ', '算力', 'CPO'] })

		expect(added).toMatchObject({ symbol: 'SZSE:300308', name: '中际旭创', attentionPrice: 150, note: 'CPO', tags: ['CPO', '算力'], enabled: true })
		expect(await service.list('owner-b')).toEqual([])
		expect(fake.fetchQuotes).toHaveBeenCalledWith(['SZSE:300308'])
	})

	it('rejects invalid settings and a provider-missing stock', async () => {
		const service = new WatchlistService(runtimeEnv(), provider({ missing: ['SZSE:300308'] }), () => new Date(fetchedAt))
		await expect(service.add('owner-a', { symbol: 'SZSE:300308' })).rejects.toMatchObject({ code: 'INVALID_STOCK' })
		await expect(new WatchlistService(runtimeEnv(), provider()).add('owner-a', { symbol: 'SZSE:300308', attentionPrice: 0 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})

	it('normalizes a persisted reorder to contiguous owner sort indexes', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308', true, 0)
		await insertWatchlist('owner-a', 'SZSE:300502', true, 1)
		await insertWatchlist('owner-a', 'SSE:601899', true, 2)
		const service = new WatchlistService(runtimeEnv(), provider())
		await service.update('owner-a', 'SSE:601899', { sortOrder: 0 })
		const list = await service.list('owner-a')
		expect(list.map(item => item.symbol)).toEqual(['SSE:601899', 'SZSE:300308', 'SZSE:300502'])
		expect(list.map(item => item.sortOrder)).toEqual([0, 1, 2])
	})

	it('updates only the owner record and removes it', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertWatchlist('owner-b', 'SZSE:300308')
		const service = new WatchlistService(runtimeEnv(), provider())
		const updated = await service.update('owner-a', 'SZSE:300308', { attentionPrice: 160, enabled: false, tags: ['通信'] })
		expect(updated).toMatchObject({ attentionPrice: 160, enabled: false, tags: ['通信'] })
		expect((await service.list('owner-b'))[0]).toMatchObject({ enabled: true, attentionPrice: null })
		expect(await service.remove('owner-a', 'SZSE:300308')).toBe(true)
		expect(await service.remove('owner-a', 'SZSE:300308')).toBe(false)
	})
})

describe('watchlist quote quality', () => {
	it('returns an empty healthy state without upstream fetch when no enabled items exist', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308', false)
		const fake = provider()
		const data = await new WatchlistService(runtimeEnv(), fake).quotes('owner-a')
		expect(data).toEqual({ quality: 'live', fetchedAt: null, items: [] })
		expect(fake.fetchQuotes).not.toHaveBeenCalled()
	})

	it('keeps each stock independent and aggregates mixed quality as degraded', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertWatchlist('owner-a', 'SZSE:300502')
		await insertWatchlist('owner-a', 'SSE:601899')
		await insertSnapshot('owner-a', 'SZSE:300502', 80)
		const data = await new WatchlistService(runtimeEnv(), provider({ missing: ['SZSE:300502', 'SSE:601899'] }), () => new Date('2026-08-24T02:31:00.000Z')).quotes('owner-a')

		expect(data.quality).toBe('degraded')
		const bySymbol = new Map(data.items.map(item => [item.watchlist.symbol, item]))
		expect(bySymbol.get('SZSE:300308')).toMatchObject({ quality: 'live', quote: { price: 158.72 } })
		expect(bySymbol.get('SZSE:300502')).toMatchObject({ quality: 'stale', quote: { price: 80 } })
		expect(bySymbol.get('SSE:601899')).toMatchObject({ quality: 'unavailable', quote: null })
		expect(bySymbol.get('SZSE:300502')?.staleAgeMs).toBeGreaterThan(0)
	})

	it('does not label a same-day provider quote as live when it is stale during the trading window', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const oldSameDay = '2026-08-24T01:30:00.000Z'
		const data = await new WatchlistService(
			runtimeEnv(),
			provider({ marketAt: oldSameDay }),
			() => new Date('2026-08-24T06:00:00.000Z'),
		).quotes('owner-a')

		expect(data.quality).toBe('stale')
		expect(data.items[0]).toMatchObject({ quality: 'stale', quote: { marketAt: oldSameDay } })
	})

	it('rejects provider quotes with invalid or implausibly future market timestamps when no last-good snapshot exists', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const now = new Date('2026-08-24T02:31:00.000Z')

		for (const marketAt of ['not-a-date', '2026-08-24T03:30:00.000Z']) {
			const data = await new WatchlistService(runtimeEnv(), provider({ marketAt }), () => now).quotes('owner-a')
			expect(data.quality).toBe('unavailable')
			expect(data.items[0]).toMatchObject({ quality: 'unavailable', quote: null, staleAgeMs: null })
		}
	})

	it('does not label a previous trading-day provider quote as live', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const previousTradingDay = '2026-08-21T07:00:00.000Z'
		const data = await new WatchlistService(
			runtimeEnv(),
			provider({ marketAt: previousTradingDay }),
			() => new Date('2026-08-24T02:31:00.000Z'),
		).quotes('owner-a')

		expect(data.quality).toBe('stale')
		expect(data.items[0]).toMatchObject({ quality: 'stale', quote: { marketAt: previousTradingDay } })
		expect(data.items[0]?.staleAgeMs).toBeGreaterThan(0)
	})

	it('returns stale when all items fall back to last-good and unavailable when none have history', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertSnapshot('owner-a', 'SZSE:300308')
		const stale = await new WatchlistService(runtimeEnv(), provider({ fail: true }), () => new Date('2026-08-24T02:31:00.000Z')).quotes('owner-a')
		expect(stale.quality).toBe('stale')
		expect(stale.items[0]?.quality).toBe('stale')

		await testEnv.DB.prepare('DELETE FROM market_watchlist_quote_5m').run()
		const unavailable = await new WatchlistService(runtimeEnv(), provider({ fail: true })).quotes('owner-a')
		expect(unavailable.quality).toBe('unavailable')
		expect(unavailable.items[0]?.quote).toBeNull()
	})

	it('does not write 5-minute history during interactive quotes', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await new WatchlistService(runtimeEnv(), provider()).quotes('owner-a')
		const row = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m').first<{ count: number }>()
		expect(row?.count).toBe(0)
	})
})

describe('watchlist scheduled observability', () => {
	it('records unique-symbol validity without exposing owner or symbol details', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertWatchlist('owner-b', 'SZSE:300502')
		const service = new WatchlistService(
			runtimeEnv(),
			provider({ missing: ['SZSE:300502'] }),
			() => new Date('2026-08-24T02:31:00.000Z'),
		)
		const data = await service.syncScheduled('2026-08-24T02:30:00.000Z')
		expect(data.status).toBe('partial')
		const row = await testEnv.DB.prepare(`
			SELECT capability, status, item_count, expected_item_count, missing_count, endpoint
			FROM market_source_observation
			WHERE capability = 'watchlist-sync'
			ORDER BY id DESC LIMIT 1
		`).first<{
			capability: string
			status: string
			item_count: number
			expected_item_count: number | null
			missing_count: number
			endpoint: string | null
		}>()
		expect(row).toEqual({
			capability: 'watchlist-sync',
			status: 'partial',
			item_count: 1,
			expected_item_count: 2,
			missing_count: 1,
			endpoint: source.endpoint,
		})
	})

	it('does not put interactive quotes or direct sync probes into the SLA ledger', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const service = new WatchlistService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z'))
		await service.quotes('owner-a')
		await service.syncScheduled()
		const row = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_source_observation').first<{ count: number }>()
		expect(Number(row?.count || 0)).toBe(0)
	})
})

describe('watchlist scheduled snapshots', () => {
	it('performs zero upstream fetch outside market window', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const fake = provider()
		const result = await new WatchlistService(runtimeEnv(), fake, () => new Date('2026-08-23T02:30:00.000Z')).syncScheduled()
		expect(result).toMatchObject({ status: 'skipped', reason: 'outside-market-window' })
		expect(fake.fetchQuotes).not.toHaveBeenCalled()
	})

	it('writes only successful stocks into a stable 5-minute bucket', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertWatchlist('owner-a', 'SZSE:300502')
		const fake = provider({ missing: ['SZSE:300502'] })
		const service = new WatchlistService(runtimeEnv(), fake, () => new Date('2026-08-24T02:31:00.000Z'))
		const first = await service.syncScheduled()
		const second = await service.syncScheduled()
		expect(first).toMatchObject({ status: 'partial', itemCount: 1, missingCount: 1 })
		expect(second).toMatchObject({ status: 'partial', itemCount: 1, missingCount: 1 })
		const rows = await testEnv.DB.prepare('SELECT symbol, bucket_at, price FROM market_watchlist_quote_5m ORDER BY symbol').all<{ symbol: string, bucket_at: string, price: number }>()
		expect(rows.results).toEqual([{ symbol: 'SZSE:300308', bucket_at: '2026-08-24T02:30:00.000Z', price: 158.72 }])
	})

	it('does not persist or evaluate a same-day provider quote older than the live freshness budget', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const evaluateAffected = vi.fn()
		const service = new WatchlistService(
			runtimeEnv(),
			provider({ marketAt: '2026-08-24T01:30:00.000Z' }),
			() => new Date('2026-08-24T06:00:00.000Z'),
			{ evaluateAffected },
		)

		await expect(service.syncScheduled()).resolves.toMatchObject({ status: 'partial', itemCount: 0, missingCount: 1 })
		expect(evaluateAffected).not.toHaveBeenCalled()
	})

	it('does not persist or evaluate a provider quote from a previous Shanghai trading date', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const evaluateAffected = vi.fn()
		const service = new WatchlistService(
			runtimeEnv(),
			provider({ marketAt: '2026-08-21T07:00:00.000Z' }),
			() => new Date('2026-08-24T02:31:00.000Z'),
			{ evaluateAffected },
		)

		await expect(service.syncScheduled()).resolves.toMatchObject({ status: 'partial', itemCount: 0, missingCount: 1 })
		expect(evaluateAffected).not.toHaveBeenCalled()
		const snapshots = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m').first<{ count: number }>()
		expect(Number(snapshots?.count || 0)).toBe(0)
	})

	it('fails closed before provider fetch when global watchlist data exceeds 30 rows', async () => {
		await testEnv.DB.prepare('DROP TRIGGER IF EXISTS trg_market_watchlist_limit').run()
		try {
			for (let index = 0; index < 31; index++) {
				const code = `30${String(index).padStart(4, '0')}`
				await insertWatchlist('owner-a', `SZSE:${code}` as StockSymbol)
			}
			const fake = provider()
			const result = await new WatchlistService(runtimeEnv(), fake, () => new Date('2026-08-24T02:31:00.000Z')).syncScheduled()
			expect(result).toMatchObject({ status: 'failed', reason: 'capacity-limit', itemCount: 0 })
			expect(fake.fetchQuotes).not.toHaveBeenCalled()
		}
		finally {
			await testEnv.DB.prepare(`
				CREATE TRIGGER trg_market_watchlist_limit
				BEFORE INSERT ON market_watchlist
				WHEN (SELECT COUNT(*) FROM market_watchlist) >= 30
				BEGIN
					SELECT RAISE(ABORT, 'market_watchlist_limit');
				END
			`).run()
		}
	})
})

describe('watchlist signal sequencing', () => {
	it('evaluates signals only after successful snapshot persistence', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const evaluateAffected = vi.fn(async (targets: Array<{ ownerId: string, watchlist: { symbol: StockSymbol } }>) => {
			const persisted = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m WHERE owner_id = \'owner-a\' AND symbol = \'SZSE:300308\'').first<{ count: number }>()
			expect(Number(persisted?.count || 0)).toBe(1)
			expect(targets.map(target => [target.ownerId, target.watchlist.symbol])).toEqual([['owner-a', 'SZSE:300308']])
			return { evaluatedCount: 1, readyCount: 0, warmingCount: 1, signalCount: 0, strongCount: 0 }
		})
		const service = new WatchlistService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z'), { evaluateAffected })
		await expect(service.syncScheduled()).resolves.toMatchObject({ status: 'success', itemCount: 1, missingCount: 0 })
		expect(evaluateAffected).toHaveBeenCalledOnce()
	})

	it('evaluates only successfully persisted symbols on partial provider results', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertWatchlist('owner-a', 'SZSE:300502')
		const evaluateAffected = vi.fn().mockResolvedValue({ evaluatedCount: 1, readyCount: 0, warmingCount: 1, signalCount: 0, strongCount: 0 })
		const service = new WatchlistService(runtimeEnv(), provider({ missing: ['SZSE:300502'] }), () => new Date('2026-08-24T02:31:00.000Z'), { evaluateAffected })
		await service.syncScheduled()
		expect(evaluateAffected).toHaveBeenCalledWith([
			expect.objectContaining({ ownerId: 'owner-a', watchlist: expect.objectContaining({ symbol: 'SZSE:300308' }) }),
		])
	})

	it('does not evaluate signals when the provider fails', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const evaluateAffected = vi.fn()
		const service = new WatchlistService(runtimeEnv(), provider({ fail: true }), () => new Date('2026-08-24T02:31:00.000Z'), { evaluateAffected })
		await expect(service.syncScheduled()).resolves.toMatchObject({ status: 'failed', reason: 'provider-failed' })
		expect(evaluateAffected).not.toHaveBeenCalled()
	})

	it('propagates signal infrastructure failures so the queue can retry idempotently', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		const evaluateAffected = vi.fn().mockRejectedValue(new Error('signal d1 unavailable'))
		const service = new WatchlistService(runtimeEnv(), provider(), () => new Date('2026-08-24T02:31:00.000Z'), { evaluateAffected })
		await expect(service.syncScheduled()).rejects.toThrow('signal d1 unavailable')
		const persisted = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m').first<{ count: number }>()
		expect(Number(persisted?.count || 0)).toBe(1)
	})

	it('deletes private signals by cascade while retaining P2A snapshots', async () => {
		await insertWatchlist('owner-a', 'SZSE:300308')
		await insertSnapshot('owner-a', 'SZSE:300308')
		await testEnv.DB.prepare(`
			INSERT INTO market_watchlist_signal (
				id, owner_id, symbol, bucket_at, market_at, detected_at, signal_type, direction, severity,
				score, title, evidence_json, engine_version, source_id, created_at
			) VALUES ('sig-delete', 'owner-a', 'SZSE:300308', ?, ?, ?, 'momentum_up', 'up', 'watch', 65, '放量上冲', '{}', 'balanced-v1', 'seed-source', ?)
		`).bind(marketAt, marketAt, fetchedAt, fetchedAt).run()
		const service = new WatchlistService(runtimeEnv(), provider())
		expect(await service.remove('owner-a', 'SZSE:300308')).toBe(true)
		const signals = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_signal').first<{ count: number }>()
		const snapshots = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM market_watchlist_quote_5m').first<{ count: number }>()
		expect(Number(signals?.count || 0)).toBe(0)
		expect(Number(snapshots?.count || 0)).toBe(1)
	})
})
