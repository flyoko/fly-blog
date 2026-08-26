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

const inFlightLoads = new Map<string, Promise<unknown>>()

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
	cacheParamNames?: readonly string[],
): Promise<PublicCacheResult<T>> {
	if (c.req.header('authorization') || hasStatefulCookie(c.req.header('cookie')))
		return { data: await load(), status: 'BYPASS' }

	const requestUrl = new URL(c.req.url)
	const cacheUrl = new URL(requestUrl)
	if (cacheParamNames) {
		cacheUrl.search = ''
		for (const name of cacheParamNames) {
			const value = requestUrl.searchParams.get(name)
			if (value !== null)
				cacheUrl.searchParams.set(name, value)
		}
	}
	cacheUrl.searchParams.set('__fly_cache_version', version || 'empty')
	const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' })
	const cached = await caches.default.match(cacheKey)
	if (cached) {
		return {
			data: await cached.json<T>(),
			status: 'HIT',
		}
	}

	const key = cacheKey.url
	let pending = inFlightLoads.get(key) as Promise<T> | undefined
	if (!pending) {
		pending = (async () => {
			const data = await load()
			await caches.default.put(cacheKey, new Response(JSON.stringify(data), {
				headers: {
					'cache-control': `public, max-age=${ttlSeconds}`,
					'content-type': 'application/json; charset=utf-8',
				},
			}))
			return data
		})()
		inFlightLoads.set(key, pending)
		const cleanup = () => {
			if (inFlightLoads.get(key) === pending)
				inFlightLoads.delete(key)
		}
		void pending.then(cleanup, cleanup)
	}
	const data = await pending
	return { data, status: 'MISS' }
}
