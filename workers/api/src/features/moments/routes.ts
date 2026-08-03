import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import {
	momentCreateRequestSchema,
	momentTransitionRequestSchema,
	momentUpdateRequestSchema,
} from '../../../../../shared/admin/moments'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { MomentRepository } from '../../repositories/moment-repository'
import { momentActor, MomentService } from './service'

function positive(value: string | undefined, fallback: number, max: number) {
	if (!value)
		return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > max)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

function actor(c: Parameters<import('hono').Handler<AppEnvironment>>[0]) {
	return momentActor(c.get('session')!, c.get('requestId'))
}

export const adminMomentRoutes = new Hono<AppEnvironment>()
adminMomentRoutes.use('*', requireSession)

adminMomentRoutes.get('/', async (c) => {
	const status = c.req.query('status') as 'draft' | 'published' | 'withdrawn' | undefined
	if (status && !['draft', 'published', 'withdrawn'].includes(status))
		throw new ApiError('VALIDATION_FAILED', 400, 'Moment status is invalid')
	const page = positive(c.req.query('page'), 1, 1_000_000)
	const pageSize = positive(c.req.query('pageSize'), 20, 50)
	const result = await new MomentRepository(c.env.DB).list({
		page,
		pageSize,
		status,
		query: c.req.query('query'),
		tag: c.req.query('tag'),
		year: c.req.query('year') ? positive(c.req.query('year'), 2026, 9999) : undefined,
	})
	return success(c, { ...result, page, pageSize })
})

adminMomentRoutes.get('/:id', async (c) => {
	const moment = await new MomentRepository(c.env.DB).find(c.req.param('id'), false)
	if (!moment)
		throw new ApiError('NOT_FOUND', 404, 'Moment not found')
	return success(c, moment)
})

adminMomentRoutes.post('/', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:moment:create`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = momentCreateRequestSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment input is invalid', parsed.error.flatten())
		const execution = await withIdempotency({
			db: c.env.DB,
			key: parsed.data.idempotencyKey,
			scope: `moment.create:${session.id}`,
			requestBody: parsed.data,
			execute: async () => ({ status: 201, body: await new MomentService(c.env).create({ moment: parsed.data.moment, actor: actor(c) }) }),
		})
		return success(c, execution.body, 201)
	})
})

adminMomentRoutes.put('/:id', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:moment:update`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = momentUpdateRequestSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Moment input is invalid', parsed.error.flatten())
		const execution = await withIdempotency({
			db: c.env.DB,
			key: parsed.data.idempotencyKey,
			scope: `moment.update:${session.id}:${c.req.param('id')}`,
			requestBody: parsed.data,
			execute: async () => ({ status: 200, body: await new MomentService(c.env).update(c.req.param('id'), parsed.data.expectedVersion, { moment: parsed.data.moment, actor: actor(c) }) }),
		})
		return success(c, execution.body)
	})
})

for (const [path, status] of [['publish', 'published'], ['withdraw', 'withdrawn'], ['restore', 'draft']] as const) {
	adminMomentRoutes.post(`/:id/${path}`, requireCsrf, async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:moment:${path}`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			})
			const parsed = momentTransitionRequestSchema.safeParse(raw)
			if (!parsed.success)
				throw new ApiError('VALIDATION_FAILED', 400, 'Moment transition input is invalid', parsed.error.flatten())
			const execution = await withIdempotency({
				db: c.env.DB,
				key: parsed.data.idempotencyKey,
				scope: `moment.${path}:${session.id}:${c.req.param('id')}`,
				requestBody: parsed.data,
				execute: async () => ({ status: 200, body: await new MomentService(c.env).transition(c.req.param('id'), parsed.data.expectedVersion, status, actor(c)) }),
			})
			return success(c, execution.body)
		})
	})
}
