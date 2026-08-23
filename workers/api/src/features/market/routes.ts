import type { CiticFuturesSeries, SectorKind } from '../../../../../shared/market'
import type { AppEnvironment, Env } from '../../env'
import type { FuturesPositionService } from './futures-position-service'
import type { MarketService } from './service'
import { Hono } from 'hono'
import { citicFuturesSeries, sectorKinds } from '../../../../../shared/market'
import { ApiError, success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { FuturesPositionService as DefaultFuturesPositionService } from './futures-position-service'
import { MarketService as DefaultMarketService } from './service'

type PublicMarketService = Pick<MarketService, 'overview' | 'sectorFlows' | 'listVersion'>
type MarketServiceFactory = (env: Env) => PublicMarketService
type PublicFuturesPositionService = Pick<FuturesPositionService, 'history'>
type FuturesPositionServiceFactory = (env: Env) => PublicFuturesPositionService

function sectorKind(value: string | undefined): SectorKind {
	if (!value || !sectorKinds.includes(value as SectorKind))
		throw new ApiError('VALIDATION_FAILED', 400, 'Market sector kind is invalid')
	return value as SectorKind
}

function limit(value: string | undefined): number {
	const parsed = value === undefined ? 20 : Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 600)
		throw new ApiError('VALIDATION_FAILED', 400, 'Market sector limit is invalid')
	return parsed
}

function futuresSeries(value: string | undefined): CiticFuturesSeries {
	const normalized = value || 'ALL'
	if (!citicFuturesSeries.includes(normalized as CiticFuturesSeries))
		throw new ApiError('VALIDATION_FAILED', 400, 'Citic futures product is invalid')
	return normalized as CiticFuturesSeries
}

function historyDays(value: string | undefined): number {
	const parsed = value === undefined ? 30 : Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 30)
		throw new ApiError('VALIDATION_FAILED', 400, 'Citic futures history days is invalid')
	return parsed
}

export function createPublicMarketRoutes(
	factory: MarketServiceFactory = env => new DefaultMarketService(env),
	futuresFactory: FuturesPositionServiceFactory = env => new DefaultFuturesPositionService(env),
) {
	const routes = new Hono<AppEnvironment>()

	routes.get('/overview', async (c) => {
		const service = factory(c.env)
		const cached = await publicCacheData(c, await service.listVersion(), () => service.overview(), 20)
		c.header('Cache-Control', 'public, max-age=20, stale-while-revalidate=60')
		c.header('X-Fly-Cache', cached.status)
		return success(c, cached.data)
	})

	routes.get('/sector-flows', async (c) => {
		const kind = sectorKind(c.req.query('kind'))
		const sectorLimit = limit(c.req.query('limit'))
		const service = factory(c.env)
		const cached = await publicCacheData(c, await service.listVersion(), () => service.sectorFlows(kind, sectorLimit), 30)
		c.header('Cache-Control', 'public, max-age=30, stale-while-revalidate=60')
		c.header('X-Fly-Cache', cached.status)
		return success(c, cached.data)
	})

	routes.get('/citic-futures-positions', async (c) => {
		const product = futuresSeries(c.req.query('product'))
		const days = historyDays(c.req.query('days'))
		const data = await futuresFactory(c.env).history(product, days)
		c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
		return success(c, data)
	})

	return routes
}

export const publicMarketRoutes = createPublicMarketRoutes()
