import type { Context } from 'hono'
import type { AppEnvironment } from '../env'

export interface PublicCacheResult<T> {
	data: T
	status: 'HIT' | 'MISS' | 'BYPASS'
}

export async function publicCacheData<T>(
	c: Context<AppEnvironment>,
	version: string,
	load: () => Promise<T>,
	ttlSeconds = 30,
): Promise<PublicCacheResult<T>> {
	if (c.req.header('cookie') || c.req.header('authorization'))
		return { data: await load(), status: 'BYPASS' }

	const cacheUrl = new URL(c.req.url)
	cacheUrl.searchParams.set('__fly_cache_version', version || 'empty')
	const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
	const cached = await caches.default.match(cacheKey)
	if (cached) {
		return {
			data: await cached.json<T>(),
			status: 'HIT',
		}
	}

	const data = await load()
	await caches.default.put(cacheKey, new Response(JSON.stringify(data), {
		headers: {
			'cache-control': `public, max-age=${ttlSeconds}`,
			'content-type': 'application/json; charset=utf-8',
		},
	}))
	return { data, status: 'MISS' }
}
