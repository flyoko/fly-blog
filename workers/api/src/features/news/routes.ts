import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { manualNewsRequestSchema } from '../../../../../shared/admin/news'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import { publicCacheData } from '../../lib/public-cache'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { NewsService } from './service'

function positive(value: string | undefined, fallback: number, max: number) {
	const parsed = value ? Number(value) : fallback
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

export const publicNewsRoutes = new Hono<AppEnvironment>()
publicNewsRoutes.get('/', async (c) => {
	const versionRow = await c.env.DB.prepare(`
		SELECT
			COALESCE((SELECT MAX(fetched_at) FROM news_items), '') AS item_version,
			COALESCE((SELECT COUNT(*) FROM news_items WHERE selected = 1), 0) AS item_count,
			COALESCE((SELECT MAX(fetched_at) FROM news_briefings), '') AS briefing_version,
			COALESCE((SELECT MAX(updated_at) FROM news_sync_state), '') AS state_version
	`).first<{ item_version: string, item_count: number, briefing_version: string, state_version: string }>()
	const version = `${versionRow?.item_version || ''}:${versionRow?.item_count || 0}:${versionRow?.briefing_version || ''}:${versionRow?.state_version || ''}`
	const cached = await publicCacheData(c, version, () => new NewsService(c.env).list(
		positive(c.req.query('page'), 1, 1_000_000),
		positive(c.req.query('pageSize'), 30, 50),
	), 120)
	c.header('Cache-Control', 'public, max-age=120, stale-while-revalidate=900')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

export const adminNewsRoutes = new Hono<AppEnvironment>()
adminNewsRoutes.use('*', requireSession)
adminNewsRoutes.get('/', async c => success(c, await new NewsService(c.env).list(1, 50)))
adminNewsRoutes.post('/sync', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:news-sync`, async () => success(c, await new NewsService(c.env).sync()))
})
adminNewsRoutes.post('/manual', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:news-manual`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = manualNewsRequestSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Manual news input is invalid', parsed.error.flatten())
		const execution = await withIdempotency({ db: c.env.DB, key: parsed.data.idempotencyKey, scope: `news.manual:${session.id}`, requestBody: parsed.data, execute: async () => ({ status: 201, body: await new NewsService(c.env).addManual(parsed.data) }) })
		await new AuditRepository(c.env.DB).writeAudit({ actorId: session.id, actorLogin: session.login, action: 'news.manual.create', targetType: 'news_item', targetId: execution.body.id, result: 'success', requestId: c.get('requestId') })
		return success(c, execution.body, 201)
	})
})
