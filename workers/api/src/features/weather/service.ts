import type { WeatherConfig } from '../../../../../shared/admin/site-config'
import type { PublicWeather, WeatherCity } from '../../../../../shared/admin/weather'
import type { Env } from '../../env'
import weatherRaw from '../../../../../config/site/weather.json'
import { weatherConfigSchema } from '../../../../../shared/admin/site-config'
import { publicWeatherSchema, weatherCitySchema } from '../../../../../shared/admin/weather'
import { ApiError } from '../../lib/api-error'

const weatherConfig: WeatherConfig = weatherConfigSchema.parse(weatherRaw)
const sourceName = 'Open-Meteo' as const
const sourceUrl = 'https://open-meteo.com/'
const freshMilliseconds = 30 * 60 * 1000
const staleMilliseconds = 24 * 60 * 60 * 1000

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface WeatherSnapshotRow {
	config_key: string
	city: string
	latitude: number
	longitude: number
	timezone: string
	payload_json: string
	upstream_updated_at: string | null
	fetched_at: string
	expires_at: string
	last_error: string | null
	last_error_at: string | null
}

interface ForecastPayload {
	current?: {
		time?: string
		temperature_2m?: number
		weather_code?: number
		is_day?: number
		wind_speed_10m?: number
	}
	daily?: {
		temperature_2m_max?: number[]
		temperature_2m_min?: number[]
		precipitation_probability_max?: Array<number | null>
	}
}

function configKey(config: WeatherConfig): string {
	return `${config.city.trim()}|${config.latitude}|${config.longitude}|${config.timezone}`
}

function condition(code: number): { label: string, icon: string } {
	if (code === 0)
		return { label: '晴朗', icon: 'tabler:sun' }
	if (code <= 2)
		return { label: '少云', icon: 'ri:sun-cloudy-line' }
	if (code === 3)
		return { label: '多云', icon: 'tabler:cloud' }
	if (code === 45 || code === 48)
		return { label: '有雾', icon: 'tabler:mist' }
	if (code >= 51 && code <= 57)
		return { label: '毛毛雨', icon: 'tabler:cloud-rain' }
	if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
		return { label: '有雨', icon: 'tabler:umbrella' }
	if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86))
		return { label: '有雪', icon: 'tabler:snowflake' }
	if (code >= 95)
		return { label: '雷暴', icon: 'tabler:cloud-storm' }
	return { label: '天气多变', icon: 'tabler:cloud-question' }
}

function lifestyleTip(input: { temperature: number, precipitation: number | null, windSpeed: number | null }): string {
	if ((input.precipitation ?? 0) >= 50)
		return '出门记得带伞，路面湿滑时放慢脚步。'
	if ((input.windSpeed ?? 0) >= 35)
		return '风力较强，注意固定随身物品。'
	if (input.temperature >= 32)
		return '天气偏热，注意补水并避开长时间暴晒。'
	if (input.temperature <= 5)
		return '气温较低，外出注意保暖。'
	return '体感较舒适，适合安排一次轻松的户外活动。'
}

function parseSnapshot(row: WeatherSnapshotRow, stale: boolean): PublicWeather | null {
	try {
		const parsed = publicWeatherSchema.parse(JSON.parse(row.payload_json))
		return parsed.available ? { ...parsed, stale } : parsed
	}
	catch {
		return null
	}
}

function unavailable(config: WeatherConfig, reason: 'disabled' | 'not_configured' | 'temporarily_unavailable', message: string, row?: WeatherSnapshotRow | null): PublicWeather {
	return {
		available: false,
		reason,
		city: config.city.trim() || null,
		fetchedAt: row?.fetched_at ?? null,
		message,
		sourceName,
		sourceUrl,
	}
}

export class WeatherService {
	constructor(
		private readonly env: Env,
		private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
		private readonly now: () => Date = () => new Date(),
		private readonly config: WeatherConfig = weatherConfig,
	) {}

	async current(): Promise<PublicWeather> {
		if (!this.config.enabled)
			return unavailable(this.config, 'disabled', '天气模块暂未启用。')
		if (this.config.latitude === null || this.config.longitude === null || !this.config.city.trim())
			return unavailable(this.config, 'not_configured', '天气城市尚未配置完整。')

		const key = configKey(this.config)
		const row = await this.snapshot(key)
		const now = this.now()
		if (row && new Date(row.expires_at).getTime() > now.getTime()) {
			const cached = parseSnapshot(row, false)
			if (cached)
				return cached
		}

		try {
			const fresh = await this.fetchForecast(this.config, now)
			await this.saveSnapshot(key, this.config, fresh)
			return fresh
		}
		catch (error) {
			const message = error instanceof Error ? error.message : 'Open-Meteo request failed'
			await this.recordError(key, message, now.toISOString()).catch(() => undefined)
			if (row && now.getTime() - new Date(row.fetched_at).getTime() <= staleMilliseconds) {
				const stale = parseSnapshot(row, true)
				if (stale)
					return stale
			}
			return unavailable(this.config, 'temporarily_unavailable', '天气暂不可用，请稍后再试。', row)
		}
	}

	async search(query: string): Promise<WeatherCity[]> {
		const normalized = query.trim()
		if (normalized.length < 2 || normalized.length > 100)
			throw new ApiError('VALIDATION_FAILED', 400, 'City query must contain 2 to 100 characters')
		const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
		url.searchParams.set('name', normalized)
		url.searchParams.set('count', '8')
		url.searchParams.set('language', 'zh')
		url.searchParams.set('format', 'json')
		const response = await this.fetcher(url, {
			headers: { 'accept': 'application/json', 'user-agent': 'fly-living-weather/1.0' },
			signal: AbortSignal.timeout(8_000),
		})
		if (!response.ok)
			throw new ApiError('UPSTREAM_FAILED', 502, `Open-Meteo geocoding returned ${response.status}`)
		const payload = await response.json() as { results?: Array<Record<string, unknown>> }
		const results = Array.isArray(payload.results) ? payload.results : []
		return results.flatMap((raw) => {
			const latitude = Number(raw.latitude)
			const longitude = Number(raw.longitude)
			const name = typeof raw.name === 'string' ? raw.name.trim() : ''
			const timezone = typeof raw.timezone === 'string' ? raw.timezone.trim() : ''
			if (!name || !timezone || !Number.isFinite(latitude) || !Number.isFinite(longitude))
				return []
			const country = typeof raw.country === 'string' ? raw.country.trim() || null : null
			const admin1 = typeof raw.admin1 === 'string' ? raw.admin1.trim() || null : null
			const candidate = weatherCitySchema.safeParse({
				id: `${latitude}:${longitude}:${timezone}`,
				name,
				country,
				admin1,
				latitude,
				longitude,
				timezone,
			})
			return candidate.success ? [candidate.data] : []
		})
	}

	private async fetchForecast(config: WeatherConfig, now: Date): Promise<PublicWeather> {
		const url = new URL('https://api.open-meteo.com/v1/forecast')
		url.searchParams.set('latitude', String(config.latitude))
		url.searchParams.set('longitude', String(config.longitude))
		url.searchParams.set('timezone', config.timezone)
		url.searchParams.set('current', 'temperature_2m,weather_code,is_day,wind_speed_10m')
		url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max')
		url.searchParams.set('forecast_days', '1')
		const response = await this.fetcher(url, {
			headers: { 'accept': 'application/json', 'user-agent': 'fly-living-weather/1.0' },
			signal: AbortSignal.timeout(8_000),
		})
		if (!response.ok)
			throw new ApiError('UPSTREAM_FAILED', 502, `Open-Meteo forecast returned ${response.status}`)
		const payload = await response.json() as ForecastPayload
		const temperature = Number(payload.current?.temperature_2m)
		const code = Number(payload.current?.weather_code)
		const high = Number(payload.daily?.temperature_2m_max?.[0])
		const low = Number(payload.daily?.temperature_2m_min?.[0])
		if (![temperature, code, high, low].every(Number.isFinite))
			throw new ApiError('UPSTREAM_FAILED', 502, 'Open-Meteo returned incomplete weather data')
		const precipitationRaw = payload.daily?.precipitation_probability_max?.[0]
		const precipitation = typeof precipitationRaw === 'number' && Number.isFinite(precipitationRaw) ? precipitationRaw : null
		const windRaw = payload.current?.wind_speed_10m
		const windSpeed = typeof windRaw === 'number' && Number.isFinite(windRaw) ? windRaw : null
		const mapped = condition(code)
		return publicWeatherSchema.parse({
			available: true,
			city: config.city.trim(),
			timezone: config.timezone,
			temperature,
			weatherCode: code,
			condition: mapped.label,
			icon: mapped.icon,
			isDay: payload.current?.is_day === 1,
			high,
			low,
			windSpeed,
			precipitationProbability: precipitation,
			tip: lifestyleTip({ temperature, precipitation, windSpeed }),
			observedAt: payload.current?.time || now.toISOString(),
			fetchedAt: now.toISOString(),
			stale: false,
			sourceName,
			sourceUrl,
		})
	}

	private snapshot(key: string) {
		return this.env.DB.prepare('SELECT * FROM weather_snapshots WHERE config_key = ?')
			.bind(key)
			.first<WeatherSnapshotRow>()
	}

	private async saveSnapshot(key: string, config: WeatherConfig, payload: PublicWeather) {
		if (!payload.available)
			return
		const fetchedAt = payload.fetchedAt
		const expiresAt = new Date(new Date(fetchedAt).getTime() + freshMilliseconds).toISOString()
		await this.env.DB.prepare(`
			INSERT INTO weather_snapshots (
				config_key, city, latitude, longitude, timezone, payload_json,
				upstream_updated_at, fetched_at, expires_at, last_error, last_error_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
			ON CONFLICT(config_key) DO UPDATE SET
				city = excluded.city, latitude = excluded.latitude, longitude = excluded.longitude,
				timezone = excluded.timezone, payload_json = excluded.payload_json,
				upstream_updated_at = excluded.upstream_updated_at, fetched_at = excluded.fetched_at,
				expires_at = excluded.expires_at, last_error = NULL, last_error_at = NULL
		`).bind(
			key,
			config.city.trim(),
			config.latitude,
			config.longitude,
			config.timezone,
			JSON.stringify(payload),
			payload.observedAt,
			fetchedAt,
			expiresAt,
		).run()
	}

	private async recordError(key: string, message: string, at: string) {
		await this.env.DB.prepare(`
			UPDATE weather_snapshots SET last_error = ?, last_error_at = ? WHERE config_key = ?
		`).bind(message.slice(0, 1000), at, key).run()
	}
}
