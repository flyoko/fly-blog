import { analyticsBeaconPath, handleAnalyticsBeacon, instrumentPageResponse } from './analytics'

const apiPrefixes = ['/api/auth/', '/api/admin/', '/api/analytics/', '/api/moments/', '/api/music/', '/api/news/', '/media/']
const apiExact = new Set(['/api/health', '/api/moments', '/api/news', '/api/weather'])

const hopByHopHeaders = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
])

export function shouldUseApi(pathname: string): boolean {
	return apiExact.has(pathname) || apiPrefixes.some(prefix => pathname.startsWith(prefix))
}

export function shouldUseSpaShell(pathname: string): boolean {
	return pathname === '/admin'
		|| pathname.startsWith('/admin/')
		|| pathname.startsWith('/moments/')
		|| pathname.startsWith('/ai.news/read/')
}

function forwardedHeaders(request: Request): Headers {
	const headers = new Headers(request.headers)
	for (const name of hopByHopHeaders)
		headers.delete(name)
	headers.delete('host')
	return headers
}

async function forwardedRequest(request: Request, targetUrl: URL): Promise<Request> {
	const init: RequestInit = {
		method: request.method,
		headers: forwardedHeaders(request),
		redirect: 'manual',
	}
	if (request.method !== 'GET' && request.method !== 'HEAD')
		init.body = await request.arrayBuffer()
	return new Request(targetUrl, init)
}

function momentDetailId(pathname: string): string | null {
	const match = pathname.match(/^\/moments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/iu)
	return match?.[1] ?? null
}

function momentNotFound(): Response {
	return new Response('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>瞬间不存在</title></head><body><main><h1>404</h1><p>这条瞬间不存在或尚未公开。</p><a href="/moments">返回瞬间</a></main></body></html>', {
		status: 404,
		headers: {
			'cache-control': 'no-store',
			'content-type': 'text/html; charset=utf-8',
		},
	})
}

function upstreamUnavailable(): Response {
	return Response.json({
		ok: false,
		error: {
			code: 'UPSTREAM_UNAVAILABLE',
			message: 'The upstream service is unavailable',
		},
	}, {
		status: 502,
		headers: { 'cache-control': 'no-store' },
	})
}

const worker = {
	async fetch(request, env, ctx) {
		try {
			const incomingUrl = new URL(request.url)
			if (incomingUrl.pathname === analyticsBeaconPath)
				return handleAnalyticsBeacon(request, env, ctx)
			if (shouldUseApi(incomingUrl.pathname))
				return await env.API.fetch(await forwardedRequest(request, incomingUrl))

			const detailId = request.method === 'GET' || request.method === 'HEAD'
				? momentDetailId(incomingUrl.pathname)
				: null
			if (detailId) {
				const apiUrl = new URL(incomingUrl)
				apiUrl.pathname = `/api/moments/${detailId}`
				const probe = await env.API.fetch(await forwardedRequest(new Request(request, { method: 'GET' }), apiUrl))
				if (probe.status === 404) {
					return instrumentPageResponse(
						request,
						momentNotFound(),
						incomingUrl.pathname,
						env,
						ctx,
					)
				}
				if (!probe.ok)
					return probe
			}

			const pagesUrl = new URL(env.PAGES_ORIGIN)
			const useSpaShell = (request.method === 'GET' || request.method === 'HEAD')
				&& shouldUseSpaShell(incomingUrl.pathname)
			pagesUrl.pathname = useSpaShell ? '/200' : incomingUrl.pathname
			pagesUrl.search = useSpaShell ? '' : incomingUrl.search
			const response = await fetch(await forwardedRequest(request, pagesUrl))
			return instrumentPageResponse(request, response, incomingUrl.pathname, env, ctx)
		}
		catch {
			return upstreamUnavailable()
		}
	},
} satisfies ExportedHandler<Env>

export default worker
