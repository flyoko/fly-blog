import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { shouldUseApi, shouldUseSpaShell } from '../src/index'

function service(fetcher: (request: Request) => Promise<Response> | Response): Fetcher {
	return { fetch: fetcher } as Fetcher
}

function env(api: Fetcher): Env {
	return { API: api, PAGES_ORIGIN: 'https://fly-living.pages.dev', ANALYTICS_ENABLED: 'true' }
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
		'/api/moments',
		'/api/moments/11111111-1111-4111-8111-111111111111',
		'/api/music/playlist',
		'/api/news',
		'/api/weather',
		'/media/public/articles/2026/08/image.png',
	])('routes %s to the API service', (path) => {
		expect(shouldUseApi(path)).toBe(true)
	})

	it.each(['/api/stats', '/api/health/details', '/', '/archive'])('keeps %s on Pages', (path) => {
		expect(shouldUseApi(path)).toBe(false)
	})

	it.each([
		'/admin',
		'/admin/',
		'/admin/articles',
		'/moments/',
		'/moments/11111111-1111-4111-8111-111111111111',
		'/ai.news/read/document-key',
	])('uses the SPA shell for %s', (path) => {
		expect(shouldUseSpaShell(path)).toBe(true)
	})

	it.each(['/', '/archive', '/moments', '/ai.news'])('keeps the concrete page for %s', (path) => {
		expect(shouldUseSpaShell(path)).toBe(false)
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

	it('returns a real 404 for unpublished or missing moment details', async () => {
		const pages = vi.spyOn(globalThis, 'fetch')
		const response = await worker.fetch(
			new Request('https://flyovo.cc.cd/moments/11111111-1111-4111-8111-111111111111'),
			env(service(request => request.url.includes('/api/moments/')
				? Response.json({ ok: false }, { status: 404 })
				: new Response('unexpected'))),
			{} as ExecutionContext,
		)
		expect(response.status).toBe(404)
		expect(await response.text()).toContain('瞬间不存在')
		expect(pages).not.toHaveBeenCalled()
	})

	it('loads the Pages shell only after a published moment probe succeeds', async () => {
		let apiUrl = ''
		let pagesUrl = ''
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (request) => {
			pagesUrl = (request instanceof Request ? request : new Request(request)).url
			return new Response('moment shell')
		})
		const response = await worker.fetch(
			new Request('https://flyovo.cc.cd/moments/11111111-1111-4111-8111-111111111111'),
			env(service((request) => {
				apiUrl = request.url
				return Response.json({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111' } })
			})),
			{} as ExecutionContext,
		)
		expect(await response.text()).toBe('moment shell')
		expect(apiUrl).toBe('https://flyovo.cc.cd/api/moments/11111111-1111-4111-8111-111111111111')
		expect(pagesUrl).toBe('https://fly-living.pages.dev/200')
	})

	it('serves dynamic admin and reader routes from the SPA shell without returning a redirect', async () => {
		const requests: string[] = []
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (request) => {
			requests.push((request instanceof Request ? request : new Request(request)).url)
			return new Response('spa shell', { status: 200 })
		})
		const runtimeEnv = env(service(() => new Response('api')))
		const admin = await worker.fetch(new Request('https://flyovo.cc.cd/admin/articles?draft=true'), runtimeEnv, {} as ExecutionContext)
		const reader = await worker.fetch(new Request('https://flyovo.cc.cd/ai.news/read/document-key'), runtimeEnv, {} as ExecutionContext)

		expect(admin.status).toBe(200)
		expect(admin.headers.get('cache-control')).toBe('no-cache, no-store, must-revalidate')
		expect(admin.headers.get('pragma')).toBe('no-cache')
		expect(reader.status).toBe(200)
		expect(reader.headers.get('cache-control')).toBeNull()
		expect(requests).toEqual([
			'https://fly-living.pages.dev/200',
			'https://fly-living.pages.dev/200',
		])
	})

	it('preserves the dotted AI news route for Pages canonical handling', async () => {
		let forwarded: Request | undefined
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (request) => {
			forwarded = (request instanceof Request ? request : new Request(request)).clone()
			return new Response('ai news')
		})
		const response = await worker.fetch(new Request('https://flyovo.cc.cd/ai.news?from=nav'), env(service(() => new Response('api'))), {} as ExecutionContext)
		expect(await response.text()).toBe('ai news')
		expect(forwarded?.url).toBe('https://fly-living.pages.dev/ai.news?from=nav')
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
