import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { success } from '../../lib/api-error'

export const healthRoutes = new Hono<AppEnvironment>()

healthRoutes.get('/', c => success(c, {
	service: 'fly-living-api',
	status: 'ok',
}))
