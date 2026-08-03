import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import weatherRaw from '../../../../../config/site/weather.json'
import { weatherConfigSchema } from '../../../../../shared/admin/site-config'
import { success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { enforceRateLimit, requireSession } from '../../middleware/session'
import { WeatherService } from './service'

const config = weatherConfigSchema.parse(weatherRaw)
const configVersion = JSON.stringify(config)

export const publicWeatherRoutes = new Hono<AppEnvironment>()
publicWeatherRoutes.get('/', async (c) => {
	const cached = await publicCacheData(c, configVersion, () => new WeatherService(c.env).current(), 1800)
	c.header('Cache-Control', 'public, max-age=1800, stale-while-revalidate=21600')
	c.header('X-Fly-Cache', cached.status)
	return success(c, cached.data)
})

export const adminWeatherRoutes = new Hono<AppEnvironment>()
adminWeatherRoutes.use('*', requireSession)
adminWeatherRoutes.get('/search', async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.AUTH_RATE_LIMITER, `${session.sessionId}:weather-search`, async () => {
		return success(c, { items: await new WeatherService(c.env).search(c.req.query('query') || '') })
	})
})
