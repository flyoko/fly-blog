import type { FinanceCategory } from '../../../../../shared/admin/finance'
import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { financeCategories } from '../../../../../shared/admin/finance'
import { ApiError, success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { FinanceFlashService } from './service'

function category(value: string | undefined): FinanceCategory | undefined {
	if (!value || value === 'all')
		return undefined
	if (!financeCategories.includes(value as FinanceCategory))
		throw new ApiError('VALIDATION_FAILED', 400, 'Finance category is invalid')
	return value as FinanceCategory
}

function limit(value: string | undefined) {
	const parsed = value ? Number(value) : 50
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100)
		throw new ApiError('VALIDATION_FAILED', 400, 'Finance limit is invalid')
	return parsed
}

function importantOnly(value: string | undefined) {
	if (!value)
		return false
	if (value === '1' || value === 'true')
		return true
	if (value === '0' || value === 'false')
		return false
	throw new ApiError('VALIDATION_FAILED', 400, 'Finance important filter is invalid')
}

export const publicFinanceRoutes = new Hono<AppEnvironment>()
publicFinanceRoutes.get('/flash', async (c) => {
	const service = new FinanceFlashService(c.env)
	await service.ensureSeeded()
	const options = {
		category: category(c.req.query('category')),
		importantOnly: importantOnly(c.req.query('important')),
		limit: limit(c.req.query('limit')),
	}
	const cached = await publicCacheData(c, await service.listVersion(), () => service.list(options), 20)
	c.header('Cache-Control', 'public, max-age=20, stale-while-revalidate=60')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

export const adminFinanceRoutes = new Hono<AppEnvironment>()
adminFinanceRoutes.use('*', requireSession)
adminFinanceRoutes.post('/sync', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:finance-sync`, async () => success(c, await new FinanceFlashService(c.env).sync()))
})
