import type { PublicWeather } from '../../../../../shared/admin/weather'
import type { AppEnvironment, Env } from '../../env'
import { Hono } from 'hono'
import modulesRaw from '../../../../../config/site/modules.json'
import weatherRaw from '../../../../../config/site/weather.json'
import { modulesConfigSchema, weatherConfigSchema } from '../../../../../shared/admin/site-config'
import { success } from '../../lib/api-error'
import { publicCacheData } from '../../lib/public-cache'
import { enforceRateLimit, requireSession } from '../../middleware/session'
import { WeatherService } from './service'

const config = weatherConfigSchema.parse(weatherRaw)
const modules = modulesConfigSchema.parse(modulesRaw)
const configuredModuleEnabled = modules.some(module => module.id === 'weather' && module.enabled)
const configuredVersion = JSON.stringify({ config, moduleEnabled: configuredModuleEnabled })

interface WeatherReader {
	current: () => Promise<PublicWeather>
}

export interface PublicWeatherRoutesOptions {
	moduleEnabled?: boolean
	configVersion?: string
	serviceFactory?: (env: Env) => WeatherReader
}

function disabledWeather(): PublicWeather {
	return {
		available: false,
		reason: 'disabled',
		city: config.city.trim() || null,
		fetchedAt: null,
		message: '天气模块暂未启用。',
		sourceName: 'Open-Meteo',
		sourceUrl: 'https://open-meteo.com/',
	}
}

export function createPublicWeatherRoutes(options: PublicWeatherRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const moduleEnabled = options.moduleEnabled ?? configuredModuleEnabled
	const configVersion = options.configVersion ?? configuredVersion
	const serviceFactory = options.serviceFactory ?? (env => new WeatherService(env))
	routes.get('/', async (c) => {
		const cached = await publicCacheData(
			c,
			configVersion,
			() => moduleEnabled ? serviceFactory(c.env).current() : Promise.resolve(disabledWeather()),
			1800,
		)
		c.header('Cache-Control', 'public, max-age=1800')
		c.header('X-Fly-Cache', cached.status)
		return success(c, cached.data)
	})
	return routes
}

export const publicWeatherRoutes = createPublicWeatherRoutes()

export const adminWeatherRoutes = new Hono<AppEnvironment>()
adminWeatherRoutes.use('*', requireSession)
adminWeatherRoutes.get('/search', async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.AUTH_RATE_LIMITER, `${session.sessionId}:weather-search`, async () => {
		return success(c, { items: await new WeatherService(c.env).search(c.req.query('query') || '') })
	})
})
