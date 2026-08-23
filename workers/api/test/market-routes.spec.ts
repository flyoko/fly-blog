import type { MarketEnvelope, MarketOverview, SectorFlowItem } from '../../../shared/market'
import type { AppEnvironment, Env } from '../src/env'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { createPublicMarketRoutes } from '../src/features/market/routes'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'

const unavailableOverview: MarketEnvelope<MarketOverview> = {
	data: null,
	source: [],
	fetchedAt: null,
	marketAt: null,
	stale: false,
	staleAgeMs: null,
	quality: 'unavailable',
}

const unavailableSector: MarketEnvelope<SectorFlowItem[]> = {
	data: null,
	source: [],
	fetchedAt: null,
	marketAt: null,
	stale: false,
	staleAgeMs: null,
	quality: 'unavailable',
}

function service() {
	return {
		overview: vi.fn(async () => unavailableOverview),
		sectorFlows: vi.fn(async () => unavailableSector),
		listVersion: vi.fn(async () => 'market-test-version'),
	}
}

function publicApp(mocked = service()) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/market', createPublicMarketRoutes(() => mocked))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return { app, mocked }
}

describe('market public api', () => {
	it('returns an unavailable overview as a successful API response', async () => {
		const { app, mocked } = publicApp()
		const response = await app.request('/api/market/overview', { headers: { cookie: 'qa=1' } }, {} as Env)
		const body = await response.json() as { ok: boolean, data: MarketEnvelope<MarketOverview> }

		expect(response.status).toBe(200)
		expect(body.ok).toBe(true)
		expect(body.data.quality).toBe('unavailable')
		expect(mocked.overview).toHaveBeenCalledOnce()
	})

	it('accepts industry/concept and a bounded integer limit', async () => {
		const { app, mocked } = publicApp()
		const response = await app.request('/api/market/sector-flows?kind=concept&limit=12', { headers: { cookie: 'qa=1' } }, {} as Env)

		expect(response.status).toBe(200)
		expect(mocked.sectorFlows).toHaveBeenCalledWith('concept', 12)
	})

	it.each([
		'/api/market/sector-flows',
		'/api/market/sector-flows?kind=unknown',
		'/api/market/sector-flows?kind=industry&limit=0',
		'/api/market/sector-flows?kind=industry&limit=51',
		'/api/market/sector-flows?kind=industry&limit=1.5',
	])('rejects invalid sector query %s', async (url) => {
		const { app } = publicApp()
		const response = await app.request(url, { headers: { cookie: 'qa=1' } }, {} as Env)
		expect(response.status).toBe(400)
	})
})
