import type { Context } from 'hono'
import type { AppEnvironment, Env } from '../../env'
import type { MarketObservabilityService } from './observability'
import type { MarketSignalService } from './signal-service'
import type { WatchlistService } from './watchlist-service'
import { Hono } from 'hono'
import { z } from 'zod'
import { ApiError, success } from '../../lib/api-error'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { parseStockSymbol } from './eastmoney-stock'
import { MarketObservabilityService as DefaultMarketObservabilityService } from './observability'
import { MarketSignalService as DefaultMarketSignalService } from './signal-service'
import { WatchlistService as DefaultWatchlistService, WatchlistServiceError } from './watchlist-service'

const symbolSchema = z.string().trim().min(1).max(20)
const tagsSchema = z.array(z.string().trim().min(1).max(24)).max(8)
const attentionPriceSchema = z.number().positive().finite().nullable()
const noteSchema = z.string().trim().max(240).nullable()

const addSchema = z.object({
	symbol: symbolSchema,
	note: noteSchema.optional(),
	attentionPrice: attentionPriceSchema.optional(),
	tags: tagsSchema.optional(),
}).strict()

const updateSchema = z.object({
	note: noteSchema.optional(),
	attentionPrice: attentionPriceSchema.optional(),
	tags: tagsSchema.optional(),
	enabled: z.boolean().optional(),
	sortOrder: z.number().int().min(0).max(10_000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Watchlist update is empty')

const observabilityQuerySchema = z.object({
	days: z.coerce.number().int().min(1).max(20).default(5),
})

const signalQuerySchema = z.object({
	scope: z.enum(['today', 'recent']).default('today'),
	limit: z.coerce.number().int().min(1).max(100).default(50),
	symbol: z.string().trim().min(1).max(20).optional(),
})

type AdminMarketService = Pick<WatchlistService, 'list' | 'add' | 'update' | 'remove' | 'quotes'>
type AdminMarketServiceFactory = (env: Env) => AdminMarketService
type AdminMarketObservabilityService = Pick<MarketObservabilityService, 'report'>
type AdminMarketObservabilityServiceFactory = (env: Env) => AdminMarketObservabilityService
type AdminMarketSignalService = Pick<MarketSignalService, 'list'>
type AdminMarketSignalServiceFactory = (env: Env) => AdminMarketSignalService

function serviceError(error: unknown): never {
	if (!(error instanceof WatchlistServiceError))
		throw error
	switch (error.code) {
		case 'VALIDATION_FAILED':
		case 'INVALID_STOCK':
			throw new ApiError('VALIDATION_FAILED', 400, error.message)
		case 'CONFLICT':
		case 'LIMIT_REACHED':
			throw new ApiError('CONFLICT', 409, error.message)
		case 'NOT_FOUND':
			throw new ApiError('NOT_FOUND', 404, error.message)
		case 'PROVIDER_UNAVAILABLE':
			throw new ApiError('UPSTREAM_FAILED', 502, 'Stock quote provider is temporarily unavailable')
	}
}

async function requestJson(c: Context<AppEnvironment>): Promise<unknown> {
	return c.req.json().catch(() => {
		throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
	})
}

export function createAdminMarketRoutes(
	factory: AdminMarketServiceFactory = env => new DefaultWatchlistService(env),
	signalFactory: AdminMarketSignalServiceFactory = env => new DefaultMarketSignalService(env),
	observabilityFactory: AdminMarketObservabilityServiceFactory = env => new DefaultMarketObservabilityService(env),
) {
	const routes = new Hono<AppEnvironment>()

	routes.use('*', async (c, next) => {
		try {
			await next()
		}
		finally {
			c.header('Cache-Control', 'private, no-store')
		}
	})
	routes.use('*', requireSession)

	routes.get('/observability', async (c) => {
		const session = c.get('session')!
		const parsed = observabilityQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Market observability query is invalid', parsed.error.flatten())
		return enforceRateLimit(c.env.MARKET_READ_RATE_LIMITER, `${session.sessionId}:market-observability`, async () => {
			return success(c, await observabilityFactory(c.env).report(parsed.data.days))
		})
	})

	routes.get('/watchlist', async (c) => {
		const session = c.get('session')!
		return success(c, await factory(c.env).list(session.id))
	})

	routes.get('/signals', async (c) => {
		const session = c.get('session')!
		const parsed = signalQuerySchema.safeParse(c.req.query())
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Signal query is invalid', parsed.error.flatten())
		let symbol: ReturnType<typeof parseStockSymbol>['symbol'] | undefined
		if (parsed.data.symbol) {
			try {
				symbol = parseStockSymbol(parsed.data.symbol).symbol
			}
			catch {
				throw new ApiError('VALIDATION_FAILED', 400, 'Signal symbol is invalid')
			}
		}
		return enforceRateLimit(c.env.MARKET_READ_RATE_LIMITER, `${session.sessionId}:market-signals`, async () => {
			return success(c, await signalFactory(c.env).list(session.id, {
				scope: parsed.data.scope,
				limit: parsed.data.limit,
				symbol,
			}))
		})
	})

	routes.get('/watchlist/quotes', async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.MARKET_READ_RATE_LIMITER, `${session.sessionId}:market-watchlist-quotes`, async () => {
			return success(c, await factory(c.env).quotes(session.id))
		})
	})

	routes.post('/watchlist', requireCsrf, async (c) => {
		const session = c.get('session')!
		const parsed = addSchema.safeParse(await requestJson(c))
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Watchlist request is invalid', parsed.error.flatten())
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:market-watchlist-add`, async () => {
			try {
				return success(c, await factory(c.env).add(session.id, parsed.data), 201)
			}
			catch (error) {
				return serviceError(error)
			}
		})
	})

	routes.patch('/watchlist/:symbol', requireCsrf, async (c) => {
		const session = c.get('session')!
		const symbol = symbolSchema.safeParse(c.req.param('symbol'))
		if (!symbol.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Watchlist symbol is invalid')
		const parsed = updateSchema.safeParse(await requestJson(c))
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Watchlist update is invalid', parsed.error.flatten())
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:market-watchlist-update`, async () => {
			try {
				return success(c, await factory(c.env).update(session.id, symbol.data, parsed.data))
			}
			catch (error) {
				return serviceError(error)
			}
		})
	})

	routes.delete('/watchlist/:symbol', requireCsrf, async (c) => {
		const session = c.get('session')!
		const symbol = symbolSchema.safeParse(c.req.param('symbol'))
		if (!symbol.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Watchlist symbol is invalid')
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:market-watchlist-delete`, async () => {
			try {
				if (!await factory(c.env).remove(session.id, symbol.data))
					throw new ApiError('NOT_FOUND', 404, 'Watchlist stock was not found')
				return success(c, { deleted: true })
			}
			catch (error) {
				if (error instanceof ApiError)
					throw error
				return serviceError(error)
			}
		})
	})

	return routes
}

export const adminMarketRoutes = createAdminMarketRoutes()
