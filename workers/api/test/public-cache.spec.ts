import type { AppEnvironment } from '../src/env'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { publicCacheData } from '../src/lib/public-cache'

function app(load: () => Promise<{ value: number }>) {
	const router = new Hono<AppEnvironment>()
	router.get('/cached', async (c) => {
		const result = await publicCacheData(c, 'public-cache-test-v1', load, 30)
		c.header('X-Fly-Cache', result.status)
		return c.json(result.data)
	})
	return router
}

describe('publicCacheData credential handling', () => {
	it('keeps public responses cacheable when the request only carries analytics cookies', async () => {
		const load = vi.fn(async () => ({ value: 1 }))
		const router = app(load)
		const headers = {
			cookie: 'fly_analytics_visitor=visitor; fly_analytics_session=session',
		}

		const first = await router.request('https://blog.example.test/cached?case=analytics', { headers })
		const second = await router.request('https://blog.example.test/cached?case=analytics', { headers })

		expect(first.status).toBe(200)
		expect(first.headers.get('X-Fly-Cache')).toBe('MISS')
		expect(second.headers.get('X-Fly-Cache')).toBe('HIT')
		expect(load).toHaveBeenCalledOnce()
	})

	it.each([
		'fly_admin_session=session-token',
		'fly_moment_visitor=visitor-token',
		'fly_analytics_visitor=visitor; fly_admin_session=session-token',
	])('still bypasses the public cache for stateful cookie %s', async (cookie) => {
		const load = vi.fn(async () => ({ value: 1 }))
		const router = app(load)
		const url = `https://blog.example.test/cached?case=${encodeURIComponent(cookie)}`

		const first = await router.request(url, { headers: { cookie } })
		const second = await router.request(url, { headers: { cookie } })

		expect(first.headers.get('X-Fly-Cache')).toBe('BYPASS')
		expect(second.headers.get('X-Fly-Cache')).toBe('BYPASS')
		expect(load).toHaveBeenCalledTimes(2)
	})

	it('still bypasses the public cache for authorization headers', async () => {
		const load = vi.fn(async () => ({ value: 1 }))
		const router = app(load)

		const response = await router.request('https://blog.example.test/cached?case=authorization', {
			headers: { authorization: 'Bearer token' },
		})

		expect(response.headers.get('X-Fly-Cache')).toBe('BYPASS')
		expect(load).toHaveBeenCalledOnce()
	})
})
