import type { CiticFuturesSeries, FinancialReportPeriod, FinancialTrendFilter, MarketFinancialScreenerFilters, SectorKind } from '../../../../../shared/market'
import type { AppEnvironment, Env } from '../../env'
import type { FinancialScreenerService } from './financial-screener-service'
import type { FuturesPositionService } from './futures-position-service'
import type { MarketService } from './service'
import { Hono } from 'hono'
import { citicFuturesSeries, financialReportPeriods, financialTrendFilters, sectorKinds } from '../../../../../shared/market'
import { ApiError, success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { FinancialScreenerService as DefaultFinancialScreenerService } from './financial-screener-service'
import { FuturesPositionService as DefaultFuturesPositionService } from './futures-position-service'
import { MarketService as DefaultMarketService } from './service'

type PublicMarketService = Pick<MarketService, 'overview' | 'sectorFlows' | 'listVersion'>
type MarketServiceFactory = (env: Env) => PublicMarketService
type PublicFuturesPositionService = Pick<FuturesPositionService, 'history'>
type FuturesPositionServiceFactory = (env: Env) => PublicFuturesPositionService
type PublicFinancialScreenerService = Pick<FinancialScreenerService, 'screen' | 'listVersion'>
type FinancialScreenerServiceFactory = (env: Env) => PublicFinancialScreenerService

const financialReportSuffix: Record<FinancialReportPeriod, string> = {
	q1: '03-31',
	semiannual: '06-30',
	q3: '09-30',
	annual: '12-31',
}

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

function financialPeriod(value: string | undefined): FinancialReportPeriod {
	const normalized = value || 'semiannual'
	if (!financialReportPeriods.includes(normalized as FinancialReportPeriod))
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial report period is invalid')
	return normalized as FinancialReportPeriod
}

function financialReportDate(value: string | undefined, period: FinancialReportPeriod): string | null {
	if (value === undefined)
		return null
	if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.slice(5) !== financialReportSuffix[period])
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial report date is invalid')
	const parsed = new Date(`${value}T00:00:00.000Z`)
	if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial report date is invalid')
	return value
}

function financialThreshold(value: string | undefined): number {
	const parsed = value === undefined ? 50 : Number(value)
	if (!Number.isFinite(parsed) || parsed < -1000 || parsed > 100000)
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial profit growth threshold is invalid')
	return parsed
}

function financialTrend(value: string | undefined, field: string): FinancialTrendFilter {
	const normalized = value || 'up'
	if (!financialTrendFilters.includes(normalized as FinancialTrendFilter))
		throw new ApiError('VALIDATION_FAILED', 400, `${field} trend is invalid`)
	return normalized as FinancialTrendFilter
}

function financialLimit(value: string | undefined): number {
	const parsed = value === undefined ? 100 : Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500)
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial screener limit is invalid')
	return parsed
}

function financialKeyword(value: string | undefined): string {
	const keyword = value?.trim() || ''
	if (keyword.length > 40)
		throw new ApiError('VALIDATION_FAILED', 400, 'Financial screener keyword is too long')
	return keyword
}

export function createPublicMarketRoutes(
	factory: MarketServiceFactory = env => new DefaultMarketService(env),
	futuresFactory: FuturesPositionServiceFactory = env => new DefaultFuturesPositionService(env),
	financialFactory: FinancialScreenerServiceFactory = env => new DefaultFinancialScreenerService(env),
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

	routes.get('/financial-screener', async (c) => {
		const period = financialPeriod(c.req.query('period'))
		const filters: MarketFinancialScreenerFilters = {
			period,
			reportDate: financialReportDate(c.req.query('reportDate'), period),
			minNetProfitYoY: financialThreshold(c.req.query('minNetProfitYoY')),
			grossMarginTrend: financialTrend(c.req.query('grossMarginTrend'), 'Gross margin'),
			inventoryTrend: financialTrend(c.req.query('inventoryTrend'), 'Inventory'),
			limit: financialLimit(c.req.query('limit')),
			keyword: financialKeyword(c.req.query('q')),
		}
		const service = financialFactory(c.env)
		const cached = await publicCacheData(c, await service.listVersion(), () => service.screen(filters), 300)
		c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800')
		c.header('X-Fly-Cache', cached.status)
		return success(c, cached.data)
	})

	return routes
}

export const publicMarketRoutes = createPublicMarketRoutes()
