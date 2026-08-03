const apiPrefixes = ['/api/auth/', '/api/admin/', '/media/']
const apiExact = new Set(['/api/health'])

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
	async fetch(request, env, _ctx) {
		try {
			const incomingUrl = new URL(request.url)
			if (shouldUseApi(incomingUrl.pathname)) {
				return await env.API.fetch(await forwardedRequest(request, incomingUrl))
			}

			const pagesUrl = new URL(env.PAGES_ORIGIN)
			pagesUrl.pathname = incomingUrl.pathname
			pagesUrl.search = incomingUrl.search
			return await fetch(await forwardedRequest(request, pagesUrl))
		}
		catch {
			return upstreamUnavailable()
		}
	},
} satisfies ExportedHandler<Env>

export default worker
