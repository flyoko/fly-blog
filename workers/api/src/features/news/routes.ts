import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { deleteNewsRequestSchema, manualNewsRequestSchema } from '../../../../../shared/admin/news'
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
publicNewsRoutes.get('/read/:readerKey', async (c) => {
	const service = new NewsService(c.env)
	const readerKey = c.req.param('readerKey')
	const cached = await publicCacheData(c, await service.documentVersion(readerKey), async () => {
		const document = await service.read(readerKey)
		if (!document)
			throw new ApiError('NOT_FOUND', 404, 'News document not found')
		return document
	}, 300)
	c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

publicNewsRoutes.get('/', async (c) => {
	const service = new NewsService(c.env)
	const cached = await publicCacheData(c, await service.listVersion(), () => service.list(
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
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:news-sync`, async () => success(c, await new NewsService(c.env).sync({ force: true })))
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

adminNewsRoutes.delete('/items', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:news-delete`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = deleteNewsRequestSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'News item id is invalid', parsed.error.flatten())
		const deleted = await new NewsService(c.env).deleteItem(parsed.data.id)
		if (!deleted)
			throw new ApiError('NOT_FOUND', 404, 'News item not found')
		await new AuditRepository(c.env.DB).writeAudit({
			actorId: session.id,
			actorLogin: session.login,
			action: 'news.item.delete',
			targetType: 'news_item',
			targetId: deleted.id,
			result: 'success',
			requestId: c.get('requestId'),
			metadata: { kind: deleted.kind, title: deleted.title },
		})
		return c.body(null, 204)
	})
})
