import type { AppEnvironment } from '../src/env'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { publicCacheData } from '../src/lib/public-cache'

function app(load: () => Promise<{ value: number }>, cacheParamNames?: readonly string[]) {
	const router = new Hono<AppEnvironment>()
	router.get('/cached', async (c) => {
		const result = await publicCacheData(c, 'public-cache-test-v1', load, 30, cacheParamNames)
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

	it('ignores unrecognized query parameters when a route declares its cache-key parameters', async () => {
		const load = vi.fn(async () => ({ value: 1 }))
		const router = app(load, ['case'])

		const first = await router.request('https://blog.example.test/cached?case=canonical&probe=one')
		const second = await router.request('https://blog.example.test/cached?case=canonical&probe=two')

		expect(first.headers.get('X-Fly-Cache')).toBe('MISS')
		expect(second.headers.get('X-Fly-Cache')).toBe('HIT')
		expect(load).toHaveBeenCalledOnce()
	})

	it('does not let duplicate values of one recognized parameter create a different cache key', async () => {
		const load = vi.fn(async () => ({ value: 1 }))
		const router = app(load, ['case'])

		const first = await router.request('https://blog.example.test/cached?case=duplicate-canonical')
		const second = await router.request('https://blog.example.test/cached?case=duplicate-canonical&case=ignored-duplicate')

		expect(first.headers.get('X-Fly-Cache')).toBe('MISS')
		expect(second.headers.get('X-Fly-Cache')).toBe('HIT')
		expect(load).toHaveBeenCalledOnce()
	})

	it('coalesces concurrent misses for the same cache key inside one worker isolate', async () => {
		const load = vi.fn(async () => {
			await new Promise(resolve => setTimeout(resolve, 20))
			return { value: 1 }
		})
		const router = app(load, ['case'])
		const url = 'https://blog.example.test/cached?case=coalesce'

		const [first, second] = await Promise.all([router.request(url), router.request(url)])

		expect(first.status).toBe(200)
		expect(second.status).toBe(200)
		expect(load).toHaveBeenCalledOnce()
	})
})
