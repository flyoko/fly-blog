import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { WeatherConfig } from '../../../shared/admin/site-config'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { WeatherService } from '../src/features/weather/service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const config: WeatherConfig = {
	enabled: true,
	provider: 'open-meteo',
	city: '杭州 · 浙江 · 中国',
	latitude: 30.2741,
	longitude: 120.1551,
	timezone: 'Asia/Shanghai',
}
const forecast = {
	current: { time: '2026-08-03T20:00', temperature_2m: 29.4, weather_code: 1, is_day: 0, wind_speed_10m: 8.2 },
	daily: { temperature_2m_max: [34], temperature_2m_min: [25], precipitation_probability_max: [20] },
}

function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => testEnv.DB.prepare('DELETE FROM weather_snapshots').run())

describe('weather service', () => {
	it('fetches once and reuses the 30 minute D1 snapshot', async () => {
		let calls = 0
		const fetcher: typeof fetch = async () => {
			calls++
			return Response.json(forecast)
		}
		const now = () => new Date('2026-08-03T12:00:00.000Z')
		const service = new WeatherService(runtimeEnv(), fetcher, now, config)
		const first = await service.current()
		const second = await service.current()
		expect(first).toMatchObject({ available: true, city: config.city, condition: '少云', stale: false, temperature: 29.4 })
		expect(second).toEqual(first)
		expect(calls).toBe(1)
	})

	it('falls back to the last successful snapshot for 24 hours', async () => {
		await new WeatherService(runtimeEnv(), async () => Response.json(forecast), () => new Date('2026-08-03T12:00:00.000Z'), config).current()
		const stale = await new WeatherService(
			runtimeEnv(),
			async () => new Response('down', { status: 503 }),
			() => new Date('2026-08-03T13:00:00.000Z'),
			config,
		).current()
		expect(stale).toMatchObject({ available: true, stale: true, city: config.city })

		const expired = await new WeatherService(
			runtimeEnv(),
			async () => new Response('down', { status: 503 }),
			() => new Date('2026-08-04T13:01:00.000Z'),
			config,
		).current()
		expect(expired).toMatchObject({ available: false, reason: 'temporarily_unavailable' })
	})

	it('maps city search results and ignores incomplete entries', async () => {
		const service = new WeatherService(runtimeEnv(), async () => Response.json({
			results: [
				{ name: '杭州', country: '中国', admin1: '浙江', latitude: 30.27, longitude: 120.15, timezone: 'Asia/Shanghai' },
				{ name: 'broken' },
			],
		}), () => new Date(), config)
		await expect(service.search('杭州')).resolves.toEqual([{
			id: '30.27:120.15:Asia/Shanghai',
			name: '杭州',
			country: '中国',
			admin1: '浙江',
			latitude: 30.27,
			longitude: 120.15,
			timezone: 'Asia/Shanghai',
		}])
		await expect(service.search(' ')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
	})
})
