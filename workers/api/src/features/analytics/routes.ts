import type { Context } from 'hono'
import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { z } from 'zod'
import {
	analyticsClientPageviewSchema,
	analyticsExportQuerySchema,
	analyticsQuerySchema,
	analyticsVisitorQuerySchema,
} from '../../../../../shared/admin/analytics'
import { ApiError, success } from '../../lib/api-error'
import { authRateLimitKey, requireSession } from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { analyticsCsv, AnalyticsService } from './service'

const encoder = new TextEncoder()
const PUBLIC_BODY_LIMIT = 16 * 1_024
const INTERNAL_BODY_LIMIT = 32 * 1_024

const nullableShortText = (maximum: number) => z.string().trim().max(maximum).nullable().optional()

const internalAnalyticsPayloadSchema = analyticsClientPageviewSchema.extend({
	source: z.enum(['edge', 'spa']),
	receivedAt: z.string().datetime(),
	responseStatus: z.number().int().min(100).max(599).nullable().optional(),
	ipAddress: nullableShortText(64),
	countryCode: nullableShortText(2),
	regionCode: nullableShortText(32),
	regionName: nullableShortText(120),
	city: nullableShortText(120),
	postalCode: nullableShortText(32),
	timezone: nullableShortText(80),
	latitude: z.number().min(-90).max(90).nullable().optional(),
	longitude: z.number().min(-180).max(180).nullable().optional(),
	asn: z.number().int().min(0).max(4_294_967_295).nullable().optional(),
	asOrganization: nullableShortText(240),
	userAgent: nullableShortText(768),
	verifiedBot: z.boolean().optional(),
	botScore: z.number().int().min(1).max(99).nullable().optional(),
	botName: nullableShortText(120),
	botCategory: nullableShortText(80),
	classificationSource: nullableShortText(80),
}).strict()

type InternalAnalyticsPayload = z.infer<typeof internalAnalyticsPayloadSchema>

type CfRecord = Record<string, unknown>

function record(value: unknown): CfRecord | null {
	return value && typeof value === 'object' ? value as CfRecord : null
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberValue(value: unknown): number | null {
	const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
	return Number.isFinite(parsed) ? parsed : null
}

function requestCf(c: Context<AppEnvironment>): CfRecord | null {
	return record((c.req.raw as Request & { cf?: unknown }).cf)
}

function trustedPublicContext(c: Context<AppEnvironment>): Omit<InternalAnalyticsPayload, keyof z.infer<typeof analyticsClientPageviewSchema>> {
	const cf = requestCf(c)
	const botManagement = record(cf?.botManagement)
	return {
		source: 'spa',
		receivedAt: new Date().toISOString(),
		responseStatus: null,
		ipAddress: c.req.header('cf-connecting-ip') ?? null,
		countryCode: text(cf?.country),
		regionCode: text(cf?.regionCode),
		regionName: text(cf?.region),
		city: text(cf?.city),
		postalCode: text(cf?.postalCode),
		timezone: text(cf?.timezone),
		latitude: numberValue(cf?.latitude),
		longitude: numberValue(cf?.longitude),
		asn: numberValue(cf?.asn),
		asOrganization: text(cf?.asOrganization),
		userAgent: c.req.header('user-agent') ?? null,
		verifiedBot: botManagement?.verifiedBot === true,
		botScore: numberValue(botManagement?.score),
		botName: null,
		botCategory: null,
		classificationSource: cf ? 'cloudflare' : 'request',
	}
}

async function readJson(c: Context<AppEnvironment>, maximumBytes: number): Promise<unknown> {
	const contentLength = Number(c.req.header('content-length'))
	if (Number.isFinite(contentLength) && contentLength > maximumBytes)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics request body is too large')
	const raw = await c.req.text()
	if (encoder.encode(raw).byteLength > maximumBytes)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics request body is too large')
	try {
		return JSON.parse(raw)
	}
	catch {
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics request body must be valid JSON')
	}
}

function noContent(c: Context<AppEnvironment>) {
	c.header('Cache-Control', 'no-store')
	return c.body(null, 204)
}

function queryValues(c: Context<AppEnvironment>): Record<string, string> {
	return Object.fromEntries(new URL(c.req.url).searchParams.entries())
}

function assertRange(input: { from: string, to: string }, maximumDays: number): void {
	const from = Date.parse(input.from)
	const to = Date.parse(input.to)
	if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics date range is invalid')
	if (to - from > maximumDays * 86_400_000)
		throw new ApiError('VALIDATION_FAILED', 400, `Analytics date range cannot exceed ${maximumDays} days`)
}

function parseQuery<T>(
	c: Context<AppEnvironment>,
	schema: z.ZodType<T>,
	maximumDays: number,
): T {
	const parsed = schema.safeParse(queryValues(c))
	if (!parsed.success)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics query is invalid', parsed.error.flatten())
	assertRange(parsed.data as { from: string, to: string }, maximumDays)
	return parsed.data
}

function sameOriginRequest(c: Context<AppEnvironment>): boolean {
	const origin = c.req.header('origin')
	if (origin)
		return origin === c.env.PUBLIC_ORIGIN
	return c.req.header('sec-fetch-site') === 'same-origin'
}

export const internalAnalyticsRoutes = new Hono<AppEnvironment>()

internalAnalyticsRoutes.post('/pageview', async (c) => {
	if (c.req.header('x-fly-analytics-source') !== 'edge')
		throw new ApiError('FORBIDDEN', 403, 'Analytics collector is not available')
	if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json'))
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics request must use JSON')
	const parsed = internalAnalyticsPayloadSchema.safeParse(await readJson(c, INTERNAL_BODY_LIMIT))
	if (!parsed.success)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics payload is invalid', parsed.error.flatten())
	const limiter = c.env.ANALYTICS_RATE_LIMITER ?? c.env.WRITE_RATE_LIMITER
	const allowed = await limiter.limit({ key: `${parsed.data.ipAddress ?? 'unknown'}:analytics-collect` })
	if (!allowed.success)
		return noContent(c)
	await new AnalyticsService(c.env).collect(parsed.data)
	return noContent(c)
})

export const publicAnalyticsRoutes = new Hono<AppEnvironment>()

publicAnalyticsRoutes.post('/pageview', async (c) => {
	if (!sameOriginRequest(c))
		return noContent(c)
	if (!c.req.header('content-type')?.toLowerCase().startsWith('application/json'))
		return noContent(c)
	const limiter = c.env.ANALYTICS_RATE_LIMITER ?? c.env.WRITE_RATE_LIMITER
	const allowed = await limiter.limit({ key: authRateLimitKey(c) })
	if (!allowed.success)
		return noContent(c)
	try {
		const raw = await readJson(c, PUBLIC_BODY_LIMIT)
		const parsed = analyticsClientPageviewSchema.safeParse(raw)
		if (!parsed.success)
			return noContent(c)
		await new AnalyticsService(c.env).collect({
			...parsed.data,
			...trustedPublicContext(c),
		})
	}
	catch {
		// Public collection never exposes validation, storage, or configuration differences.
	}
	return noContent(c)
})

export const adminAnalyticsRoutes = new Hono<AppEnvironment>()
adminAnalyticsRoutes.use('*', requireSession)
adminAnalyticsRoutes.use('*', async (c, next) => {
	await next()
	c.header('Cache-Control', 'private, no-store')
})

adminAnalyticsRoutes.get('/status', async c => success(c, await new AnalyticsService(c.env).status()))

adminAnalyticsRoutes.get('/summary', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).summary(query))
})

adminAnalyticsRoutes.get('/timeseries', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).timeseries(query))
})

adminAnalyticsRoutes.get('/realtime', async c => success(c, await new AnalyticsService(c.env).realtime()))

adminAnalyticsRoutes.get('/pages', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).pages(query))
})

adminAnalyticsRoutes.get('/geo', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).geo(query))
})

adminAnalyticsRoutes.get('/devices', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).devices(query))
})

adminAnalyticsRoutes.get('/visitors', async (c) => {
	const query = parseQuery(c, analyticsVisitorQuerySchema, 180)
	return success(c, await new AnalyticsService(c.env).visitors(query))
})

adminAnalyticsRoutes.get('/bots', async (c) => {
	const query = parseQuery(c, analyticsQuerySchema, 366)
	return success(c, await new AnalyticsService(c.env).bots(query))
})

adminAnalyticsRoutes.get('/events/:id/ip', async (c) => {
	const id = Number(c.req.param('id'))
	if (!Number.isSafeInteger(id) || id < 1)
		throw new ApiError('VALIDATION_FAILED', 400, 'Analytics event id is invalid')
	const ip = await new AnalyticsService(c.env).findEventIp(id)
	if (!ip)
		throw new ApiError('NOT_FOUND', 404, 'Analytics event IP is unavailable')
	const session = c.get('session')!
	await new AuditRepository(c.env.DB).writeAudit({
		actorId: session.id,
		actorLogin: session.login,
		action: 'analytics.ip.view',
		targetType: 'analytics_event',
		targetId: String(id),
		result: 'success',
		requestId: c.get('requestId'),
		metadata: { withinRetention: true },
	})
	return success(c, { ip })
})

adminAnalyticsRoutes.get('/export', async (c) => {
	const query = parseQuery(c, analyticsExportQuerySchema, 90)
	const body = analyticsCsv(await new AnalyticsService(c.env).export(query))
	c.header('Content-Type', 'text/csv; charset=utf-8')
	c.header('Content-Disposition', `attachment; filename="fly-living-analytics-${query.from.slice(0, 10)}.csv"`)
	return c.body(body, 200)
})
