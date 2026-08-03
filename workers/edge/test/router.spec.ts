import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { shouldUseApi } from '../src/index'

function service(fetcher: (request: Request) => Promise<Response> | Response): Fetcher {
	return { fetch: fetcher } as Fetcher
}

function env(api: Fetcher): Env {
	return { API: api, PAGES_ORIGIN: 'https://fly-living.pages.dev' }
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('route selection', () => {
	it.each([
		'/api/auth/login',
		'/api/auth/callback',
		'/api/admin/articles',
		'/api/admin/media/1',
		'/api/health',
	])('routes %s to the API service', (path) => {
		expect(shouldUseApi(path)).toBe(true)
	})

	it.each(['/api/stats', '/api/health/details', '/', '/archive'])('keeps %s on Pages', (path) => {
		expect(shouldUseApi(path)).toBe(false)
	})
})

describe('edge forwarding', () => {
	it('preserves API method, body, query, and safe headers', async () => {
		let forwarded: Request | undefined
		const response = await worker.fetch(new Request('https://flyovo.cc.cd/api/admin/articles?draft=true', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-request-id': 'request-1',
				'connection': 'keep-alive',
			},
			body: JSON.stringify({ title: 'Hello' }),
		}), env(service(async (request) => {
			forwarded = request.clone()
			return Response.json({ source: 'api' })
		})), {} as ExecutionContext)

		expect(response.status).toBe(200)
		expect(forwarded?.url).toBe('https://flyovo.cc.cd/api/admin/articles?draft=true')
		expect(forwarded?.method).toBe('POST')
		expect(forwarded?.headers.get('x-request-id')).toBe('request-1')
		expect(forwarded?.headers.get('connection')).toBeNull()
		expect(await forwarded?.json()).toEqual({ title: 'Hello' })
	})

	it('proxies public pages and static /api/stats to Pages', async () => {
		const requests: Request[] = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (request) => {
			requests.push((request instanceof Request ? request : new Request(request)).clone())
			return new Response('pages')
		})
		const runtimeEnv = env(service(() => new Response('unexpected api')))
		const home = await worker.fetch(new Request('https://flyovo.cc.cd/archive?page=2'), runtimeEnv, {} as ExecutionContext)
		const stats = await worker.fetch(new Request('https://flyovo.cc.cd/api/stats'), runtimeEnv, {} as ExecutionContext)

		expect(await home.text()).toBe('pages')
		expect(await stats.text()).toBe('pages')
		expect(requests.map(request => request.url)).toEqual([
			'https://fly-living.pages.dev/archive?page=2',
			'https://fly-living.pages.dev/api/stats',
		])
	})

	it('preserves a public request body and removes hop-by-hop headers', async () => {
		let forwarded: Request | undefined
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (request) => {
			forwarded = (request instanceof Request ? request : new Request(request)).clone()
			return new Response('ok')
		})
		await worker.fetch(new Request('https://flyovo.cc.cd/custom', {
			method: 'PUT',
			headers: {
				'content-type': 'text/plain',
				'upgrade': 'websocket',
			},
			body: 'payload',
		}), env(service(() => new Response('api'))), {} as ExecutionContext)

		expect(forwarded?.method).toBe('PUT')
		expect(await forwarded?.text()).toBe('payload')
		expect(forwarded?.headers.get('upgrade')).toBeNull()
	})

	it('returns a stable 502 response when an upstream throws', async () => {
		const response = await worker.fetch(
			new Request('https://flyovo.cc.cd/api/health'),
			env(service(() => { throw new Error('upstream down') })),
			{} as ExecutionContext,
		)
		expect(response.status).toBe(502)
		expect(await response.json()).toEqual({
			ok: false,
			error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The upstream service is unavailable' },
		})
	})
})
