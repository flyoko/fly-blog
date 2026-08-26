import type { Context } from 'hono'
import type { AppEnvironment } from '../env'

export interface PublicCacheResult<T> {
	data: T
	status: 'HIT' | 'MISS' | 'BYPASS'
}

const cacheNeutralCookieNames = new Set([
	'fly_analytics_visitor',
	'fly_analytics_session',
])

function hasStatefulCookie(cookieHeader: string | undefined): boolean {
	if (!cookieHeader)
		return false
	return cookieHeader.split(';').some((part) => {
		const separator = part.indexOf('=')
		const name = (separator >= 0 ? part.slice(0, separator) : part).trim()
		return Boolean(name && !cacheNeutralCookieNames.has(name))
	})
}

export async function publicCacheData<T>(
	c: Context<AppEnvironment>,
	version: string,
	load: () => Promise<T>,
	ttlSeconds = 30,
): Promise<PublicCacheResult<T>> {
	if (c.req.header('authorization') || hasStatefulCookie(c.req.header('cookie')))
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
