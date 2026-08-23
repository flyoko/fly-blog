import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { MarketObservabilityReport, MarketSignalDeskResponse, WatchlistItem, WatchlistRadarResponse } from '../../../shared/market'
import type { AppEnvironment, Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAdminMarketRoutes } from '../src/features/market/admin-routes'
import { WatchlistServiceError } from '../src/features/market/watchlist-service'
import { failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const origin = 'https://blog.example.test'

function limiter(success = true): RateLimit {
	return { limit: vi.fn(async () => ({ success })) } as unknown as RateLimit
}

function runtimeEnv(overrides: Partial<Env> = {}): Env {
	return {
		...testEnv,
		PUBLIC_ORIGIN: origin,
		WRITE_RATE_LIMITER: limiter(),
		MARKET_READ_RATE_LIMITER: limiter(),
		...overrides,
	} as unknown as Env
}

async function seedSession(token = 'session-token', csrf = 'csrf-token') {
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
	`).bind(
		await sha256Base64Url(token),
		await sha256Base64Url(csrf),
		'2026-08-23T00:00:00.000Z',
		'2026-08-23T00:00:00.000Z',
		'2099-08-23T12:00:00.000Z',
	).run()
}

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
	return {
		symbol: 'SZSE:300308',
		exchange: 'SZSE',
		code: '300308',
		name: '中际旭创',
		sortOrder: 0,
		note: null,
		attentionPrice: 150,
		tags: ['CPO'],
		enabled: true,
		createdAt: '2026-08-23T00:00:00.000Z',
		updatedAt: '2026-08-23T00:00:00.000Z',
		...overrides,
	}
}

function serviceStub() {
	const radar: WatchlistRadarResponse = {
		quality: 'live',
		fetchedAt: '2026-08-24T02:30:05.000Z',
		items: [{
			watchlist: item(),
			quote: {
				symbol: 'SZSE:300308',
				code: '300308',
				name: '中际旭创',
				price: 158.72,
				change: 5.04,
				changePct: 3.28,
				open: 154,
				high: 160.85,
				low: 153.2,
				previousClose: 153.68,
				volume: 234567,
				turnover: 5432000000,
				turnoverRate: 2.72,
				marketAt: '2026-08-24T02:30:00.000Z',
			},
			quality: 'live',
			staleAgeMs: null,
			source: { sourceId: 'test', sourceName: '测试', endpoint: 'https://stocks.example.test' },
		}],
	}
	return {
		list: vi.fn(async () => [item()]),
		add: vi.fn(async () => item()),
		update: vi.fn(async () => item({ attentionPrice: 160 })),
		remove: vi.fn(async () => true),
		quotes: vi.fn(async () => radar),
	}
}

function observabilityStub() {
	const response: MarketObservabilityReport = {
		calendarVersion: 'sse-szse-bse-2026',
		generatedAt: '2026-08-28T08:30:00.000Z',
		window: {
			requestedTradingDays: 5,
			expectedTradingDates: ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'],
			observedTradingDates: ['2026-08-24'],
			complete: false,
		},
		metrics: [],
	}
	return { report: vi.fn(async () => response) }
}

function signalStub() {
	const response: MarketSignalDeskResponse = {
		engineVersion: 'balanced-v1',
		marketAt: null,
		baseline: { enabledCount: 1, readyCount: 0, warmingCount: 1 },
		items: [],
	}
	return { list: vi.fn(async () => response) }
}

function testApp(stub = serviceStub(), signals = signalStub(), observability = observabilityStub()) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/market', createAdminMarketRoutes(() => stub, () => signals, () => observability))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return { app, stub, signals, observability }
}

function authHeaders(csrf = false) {
	return {
		cookie: 'fly_admin_session=session-token',
		...(csrf ? { origin, 'x-csrf-token': 'csrf-token' } : {}),
	}
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.prepare('DELETE FROM admin_sessions').run()
})

describe('private market watchlist routes', () => {
	it('returns 401 UNAUTHENTICATED and private no-store when no session exists', async () => {
		const { app } = testApp()
		const response = await app.request(`${origin}/api/admin/market/watchlist`, {}, runtimeEnv())
		expect(response.status).toBe(401)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(await response.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
	})

	it('lists only through the authenticated owner id and marks response private', async () => {
		await seedSession()
		const { app, stub } = testApp()
		const response = await app.request(`${origin}/api/admin/market/watchlist`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(stub.list).toHaveBeenCalledWith('42')
	})

	it('requires CSRF for write requests before calling the service', async () => {
		await seedSession()
		const { app, stub } = testApp()
		const response = await app.request(`${origin}/api/admin/market/watchlist`, {
			method: 'POST',
			headers: { ...authHeaders(), 'content-type': 'application/json' },
			body: JSON.stringify({ symbol: 'SZSE:300308' }),
		}, runtimeEnv())
		expect(response.status).toBe(403)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(stub.add).not.toHaveBeenCalled()
	})

	it('creates, updates, and deletes through owner-scoped service calls with write limiting', async () => {
		await seedSession()
		const writeLimiter = limiter()
		const runtime = runtimeEnv({ WRITE_RATE_LIMITER: writeLimiter })
		const { app, stub } = testApp()

		const created = await app.request(`${origin}/api/admin/market/watchlist`, {
			method: 'POST',
			headers: { ...authHeaders(true), 'content-type': 'application/json' },
			body: JSON.stringify({ symbol: 'SZSE:300308', attentionPrice: 150, tags: ['CPO'] }),
		}, runtime)
		expect(created.status).toBe(201)
		expect(stub.add).toHaveBeenCalledWith('42', expect.objectContaining({ symbol: 'SZSE:300308', attentionPrice: 150 }))

		const updated = await app.request(`${origin}/api/admin/market/watchlist/SZSE%3A300308`, {
			method: 'PATCH',
			headers: { ...authHeaders(true), 'content-type': 'application/json' },
			body: JSON.stringify({ attentionPrice: 160, enabled: false }),
		}, runtime)
		expect(updated.status).toBe(200)
		expect(stub.update).toHaveBeenCalledWith('42', 'SZSE:300308', expect.objectContaining({ attentionPrice: 160, enabled: false }))

		const removed = await app.request(`${origin}/api/admin/market/watchlist/SZSE%3A300308`, {
			method: 'DELETE',
			headers: authHeaders(true),
		}, runtime)
		expect(removed.status).toBe(200)
		expect(await removed.json()).toMatchObject({ ok: true, data: { deleted: true } })
		expect(stub.remove).toHaveBeenCalledWith('42', 'SZSE:300308')
		expect(writeLimiter.limit).toHaveBeenCalledTimes(3)
	})

	it('rate-limits quote reads per session and does not call the provider-facing service when denied', async () => {
		await seedSession()
		const readLimiter = limiter(false)
		const { app, stub } = testApp()
		const response = await app.request(`${origin}/api/admin/market/watchlist/quotes`, {
			headers: authHeaders(),
		}, runtimeEnv({ MARKET_READ_RATE_LIMITER: readLimiter }))
		expect(response.status).toBe(429)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(stub.quotes).not.toHaveBeenCalled()
		expect(readLimiter.limit).toHaveBeenCalledWith({ key: expect.stringContaining(':market-watchlist-quotes') })
	})

	it('returns the private quote aggregate when authenticated', async () => {
		await seedSession()
		const { app, stub } = testApp()
		const response = await app.request(`${origin}/api/admin/market/watchlist/quotes`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(stub.quotes).toHaveBeenCalledWith('42')
		expect(await response.json()).toMatchObject({ ok: true, data: { quality: 'live', items: [{ quality: 'live' }] } })
	})

	it('maps validation, conflict, limit, not-found and upstream service errors to stable HTTP errors', async () => {
		await seedSession()
		const cases = [
			[new WatchlistServiceError('VALIDATION_FAILED', 'bad input'), 400, 'VALIDATION_FAILED'],
			[new WatchlistServiceError('INVALID_STOCK', 'bad stock'), 400, 'VALIDATION_FAILED'],
			[new WatchlistServiceError('CONFLICT', 'duplicate'), 409, 'CONFLICT'],
			[new WatchlistServiceError('LIMIT_REACHED', 'full'), 409, 'CONFLICT'],
			[new WatchlistServiceError('NOT_FOUND', 'gone'), 404, 'NOT_FOUND'],
			[new WatchlistServiceError('PROVIDER_UNAVAILABLE', 'upstream'), 502, 'UPSTREAM_FAILED'],
		] as const
		for (const [error, status, code] of cases) {
			const stub = serviceStub()
			stub.add.mockRejectedValueOnce(error)
			const { app } = testApp(stub)
			const response = await app.request(`${origin}/api/admin/market/watchlist`, {
				method: 'POST',
				headers: { ...authHeaders(true), 'content-type': 'application/json' },
				body: JSON.stringify({ symbol: 'SZSE:300308' }),
			}, runtimeEnv())
			expect(response.status).toBe(status)
			expect(await response.json()).toMatchObject({ ok: false, error: { code } })
		}
	})
})

describe('private market observability routes', () => {
	it('keeps the SLA report private and bounded to an authenticated session', async () => {
		const unauthenticated = testApp()
		const denied = await unauthenticated.app.request(`${origin}/api/admin/market/observability?days=5`, {}, runtimeEnv())
		expect(denied.status).toBe(401)
		expect(denied.headers.get('cache-control')).toBe('private, no-store')

		await seedSession()
		const { app, observability } = testApp()
		const response = await app.request(`${origin}/api/admin/market/observability?days=5`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(observability.report).toHaveBeenCalledWith(5)
		expect(await response.json()).toMatchObject({ ok: true, data: { calendarVersion: 'sse-szse-bse-2026' } })
	})

	it('rejects an out-of-range observation window before reading D1', async () => {
		await seedSession()
		const { app, observability } = testApp()
		const response = await app.request(`${origin}/api/admin/market/observability?days=90`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(400)
		expect(observability.report).not.toHaveBeenCalled()
	})
})

describe('private market signal routes', () => {
	it('returns 401 UNAUTHENTICATED with private no-store before signal access', async () => {
		const { app, signals } = testApp()
		const response = await app.request(`${origin}/api/admin/market/signals`, {}, runtimeEnv())
		expect(response.status).toBe(401)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(await response.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } })
		expect(signals.list).not.toHaveBeenCalled()
	})

	it('uses authenticated owner and default today/50 query with read limiting', async () => {
		await seedSession()
		const readLimiter = limiter()
		const { app, signals } = testApp()
		const response = await app.request(`${origin}/api/admin/market/signals`, { headers: authHeaders() }, runtimeEnv({ MARKET_READ_RATE_LIMITER: readLimiter }))
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		expect(signals.list).toHaveBeenCalledWith('42', { scope: 'today', limit: 50, symbol: undefined })
		expect(readLimiter.limit).toHaveBeenCalledWith({ key: expect.stringContaining(':market-signals') })
		expect(await response.json()).toMatchObject({ ok: true, data: { engineVersion: 'balanced-v1', baseline: { warmingCount: 1 } } })
	})

	it('parses recent scope, bounded limit, and a normalized stock symbol', async () => {
		await seedSession()
		const { app, signals } = testApp()
		const response = await app.request(`${origin}/api/admin/market/signals?scope=recent&limit=25&symbol=SZSE%3A300308`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(200)
		expect(signals.list).toHaveBeenCalledWith('42', { scope: 'recent', limit: 25, symbol: 'SZSE:300308' })
	})

	it.each([
		'/api/admin/market/signals?scope=forever',
		'/api/admin/market/signals?limit=0',
		'/api/admin/market/signals?limit=101',
		'/api/admin/market/signals?symbol=BAD',
	])('rejects invalid signal query %s without calling the service', async (path) => {
		await seedSession()
		const { app, signals } = testApp()
		const response = await app.request(`${origin}${path}`, { headers: authHeaders() }, runtimeEnv())
		expect(response.status).toBe(400)
		expect(await response.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
		expect(signals.list).not.toHaveBeenCalled()
	})

	it('does not call the signal service when the read limiter denies the session', async () => {
		await seedSession()
		const readLimiter = limiter(false)
		const { app, signals } = testApp()
		const response = await app.request(`${origin}/api/admin/market/signals`, { headers: authHeaders() }, runtimeEnv({ MARKET_READ_RATE_LIMITER: readLimiter }))
		expect(response.status).toBe(429)
		expect(signals.list).not.toHaveBeenCalled()
	})
})
