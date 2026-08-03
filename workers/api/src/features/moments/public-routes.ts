import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import modulesRaw from '../../../../../config/site/modules.json'
import { isModuleEnabled } from '../../../../../shared/admin/modules'
import { modulesConfigSchema } from '../../../../../shared/admin/site-config'
import { ApiError, success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { enforceRateLimit } from '../../middleware/session'
import { MomentRepository } from '../../repositories/moment-repository'
import { momentVisitor } from './visitor'

const configuredModules = modulesConfigSchema.parse(modulesRaw)
const configuredModuleEnabled = isModuleEnabled(configuredModules, 'moments')

function positive(value: string | undefined, fallback: number, max: number) {
	if (!value)
		return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

function assertSameOrigin(c: Parameters<import('hono').Handler<AppEnvironment>>[0]) {
	if (c.req.header('origin') !== c.env.PUBLIC_ORIGIN)
		throw new ApiError('CSRF_INVALID', 403, 'Request origin is not allowed')
}

async function momentCacheVersion(db: D1Database): Promise<string> {
	const row = await db.prepare(`
		SELECT
			COALESCE((SELECT version FROM moment_public_cache_state WHERE singleton = 1), 0) AS public_version,
			COALESCE((SELECT MAX(updated_at) FROM moments), '') AS moment_version,
			COALESCE((SELECT COUNT(*) FROM moment_likes), 0) AS like_count,
			COALESCE((SELECT MAX(created_at) FROM moment_likes), '') AS like_version
	`).first<{ public_version: number, moment_version: string, like_count: number, like_version: string }>()
	return `${row?.public_version || 0}:${row?.moment_version || ''}:${row?.like_count || 0}:${row?.like_version || ''}`
}

export const publicMomentRoutes = new Hono<AppEnvironment>()
publicMomentRoutes.use('*', async (_c, next) => {
	if (!configuredModuleEnabled)
		throw new ApiError('NOT_FOUND', 404, 'Moments module is disabled')
	await next()
})

publicMomentRoutes.get('/', async (c) => {
	const page = positive(c.req.query('page'), 1, 1_000_000)
	const pageSize = positive(c.req.query('pageSize'), 12, 30)
	const visitorHash = await momentVisitor(c, false)
	const version = await momentCacheVersion(c.env.DB)
	const cached = await publicCacheData(c, version, async () => {
		const result = await new MomentRepository(c.env.DB).list({
			page,
			pageSize,
			publicOnly: true,
			tag: c.req.query('tag'),
			year: c.req.query('year') ? positive(c.req.query('year'), 2026, 9999) : undefined,
		}, visitorHash ?? undefined)
		return { ...result, page, pageSize }
	})
	c.header('Cache-Control', visitorHash ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=120')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

publicMomentRoutes.get('/:id', async (c) => {
	const visitorHash = await momentVisitor(c, false)
	const version = await momentCacheVersion(c.env.DB)
	const cached = await publicCacheData(c, version, async () => {
		const moment = await new MomentRepository(c.env.DB).find(c.req.param('id'), true, visitorHash ?? undefined)
		if (!moment)
			throw new ApiError('NOT_FOUND', 404, 'Moment not found')
		return moment
	})
	c.header('Cache-Control', visitorHash ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=120')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

publicMomentRoutes.post('/:id/likes', async (c) => {
	assertSameOrigin(c)
	const visitorHash = await momentVisitor(c, true)
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `moment-like:${visitorHash}`, async () => {
		return success(c, await new MomentRepository(c.env.DB).like(c.req.param('id'), visitorHash!, new Date().toISOString()))
	})
})

publicMomentRoutes.delete('/:id/likes', async (c) => {
	assertSameOrigin(c)
	const visitorHash = await momentVisitor(c, false)
	if (!visitorHash) {
		deleteCookie(c, 'fly_moment_visitor', { path: '/' })
		const moment = await new MomentRepository(c.env.DB).find(c.req.param('id'), true)
		if (!moment)
			throw new ApiError('NOT_FOUND', 404, 'Moment not found')
		return success(c, { liked: false, likeCount: moment.likeCount })
	}
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `moment-unlike:${visitorHash}`, async () => {
		return success(c, await new MomentRepository(c.env.DB).unlike(c.req.param('id'), visitorHash))
	})
})
