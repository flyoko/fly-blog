import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import {
	assertControlledProductionOrigins,
	controlledProductionOrigins,
	extractNuxtAssetPaths,
	resolveExpectedPagesDeploymentOrigin,
	runProductionProbe,
} from '../../scripts/production-probe'

const root = fileURLToPath(new URL('../..', import.meta.url))
const sharedAssets = ['/_nuxt/entry-a1b2c3.js', '/_nuxt/entry-d4e5f6.css']
const expectedDeploymentOrigin = 'https://a1b2c3d4.fly-living.pages.dev'

function html(assets = sharedAssets) {
	return `<!doctype html><html><head><title>fly living</title>${assets.map((asset, index) => index % 2
		? `<link rel="stylesheet" href="${asset}">`
		: `<script src="${asset}"></script>`).join('')}</head><body>fly living</body></html>`
}

function successResponse(url: URL, options: {
	backupAssets?: string[]
	expectedAssets?: string[]
	expectedOrigin?: string
	healthStatus?: number
} = {}) {
	if (url.pathname === '/') {
		const assets = url.origin === controlledProductionOrigins.backup
			? options.backupAssets
			: url.origin === options.expectedOrigin
				? options.expectedAssets
				: undefined
		return new Response(html(assets), { status: 200 })
	}
	if (url.pathname === '/api/health') {
		if (options.healthStatus && options.healthStatus !== 200)
			return new Response('temporary failure', { status: options.healthStatus })
		return Response.json({ ok: true, data: { service: 'fly-living-api', status: 'ok' } })
	}
	if (url.pathname === '/api/auth/session')
		return Response.json({ ok: true, data: { authenticated: false } })
	if (url.pathname === '/admin/login')
		return new Response(html(), { status: 200 })
	return new Response('not found', { status: 404 })
}

function requestUrl(input: string | URL | Request) {
	if (input instanceof URL)
		return input
	if (typeof input === 'string')
		return new URL(input)
	return new URL(input.url)
}

describe('production entry probe', () => {
	it('accepts only the two controlled production origins', () => {
		expect(() => assertControlledProductionOrigins()).not.toThrow()
		expect(() => assertControlledProductionOrigins({
			primary: controlledProductionOrigins.primary,
			backup: 'https://fly-blog.pages.dev',
		})).toThrow(/Unexpected backup production origin/u)
	})

	it('accepts only immutable deployment origins from the fly-living Pages project', () => {
		expect(resolveExpectedPagesDeploymentOrigin(undefined)).toBeUndefined()
		expect(resolveExpectedPagesDeploymentOrigin(`${expectedDeploymentOrigin}/archive?probe=1`)).toBe(expectedDeploymentOrigin)
		expect(() => resolveExpectedPagesDeploymentOrigin(controlledProductionOrigins.backup)).toThrow(/Unexpected Pages deployment origin/u)
		expect(() => resolveExpectedPagesDeploymentOrigin('https://main.fly-living.pages.dev')).toThrow(/Unexpected Pages deployment origin/u)
		expect(() => resolveExpectedPagesDeploymentOrigin('https://example.com')).toThrow(/Unexpected Pages deployment origin/u)
		expect(() => resolveExpectedPagesDeploymentOrigin('not a url')).toThrow(/must be a valid URL/u)
	})

	it('extracts stable Nuxt asset paths without query strings or duplicates', () => {
		expect(extractNuxtAssetPaths(`
			<script src="https://flyovo.cc.cd/_nuxt/app.js?v=1"></script>
			<link href="/_nuxt/app.css#style" rel="stylesheet">
			<script src="/_nuxt/app.js?v=2"></script>
		`)).toEqual(['/_nuxt/app.css', '/_nuxt/app.js'])
	})

	it('passes when the two domains share a build and protected endpoints are healthy', async () => {
		const fetchImpl = vi.fn(async (input: string | URL | Request) => successResponse(requestUrl(input))) as unknown as typeof fetch
		const checks = await runProductionProbe({
			fetchImpl,
			sleep: async () => {},
			attempts: 1,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-success',
		})

		expect(checks).toHaveLength(5)
		expect(checks.map(check => check.name)).toEqual([
			'正式域首页',
			'备用域首页',
			'API 健康',
			'后台未登录保护',
			'后台登录页',
		])
		expect(fetchImpl).toHaveBeenCalledTimes(5)
	})

	it('compares both production domains with the immutable deployment from this run', async () => {
		const fetchImpl = vi.fn(async (input: string | URL | Request) => successResponse(requestUrl(input), {
			expectedOrigin: expectedDeploymentOrigin,
			expectedAssets: sharedAssets,
		})) as unknown as typeof fetch
		const checks = await runProductionProbe({
			fetchImpl,
			sleep: async () => {},
			attempts: 1,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-immutable-success',
			expectedDeploymentOrigin,
		})

		expect(checks).toHaveLength(6)
		expect(checks[0]).toMatchObject({ name: '本次 Pages 部署' })
		expect(fetchImpl).toHaveBeenCalledTimes(6)
	})

	it('fails when both public domains match each other but not this run deployment', async () => {
		const fetchImpl = vi.fn(async (input: string | URL | Request) => successResponse(requestUrl(input), {
			expectedOrigin: expectedDeploymentOrigin,
			expectedAssets: ['/_nuxt/current-deployment.js'],
		})) as unknown as typeof fetch

		await expect(runProductionProbe({
			fetchImpl,
			sleep: async () => {},
			attempts: 1,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-immutable-mismatch',
			expectedDeploymentOrigin,
		})).rejects.toThrow(/do not match the immutable deployment/u)
	})

	it('fails when the primary and backup domains reference different builds', async () => {
		const fetchImpl = vi.fn(async (input: string | URL | Request) => successResponse(requestUrl(input), {
			backupAssets: ['/_nuxt/different.js'],
		})) as unknown as typeof fetch

		await expect(runProductionProbe({
			fetchImpl,
			sleep: async () => {},
			attempts: 1,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-mismatch',
		})).rejects.toThrow(/reference different Nuxt assets/u)
	})

	it('retries a temporary domain build mismatch until both entries converge', async () => {
		let backupCalls = 0
		const sleep = vi.fn(async () => {})
		const fetchImpl = vi.fn(async (input: string | URL | Request) => {
			const url = requestUrl(input)
			if (url.origin === controlledProductionOrigins.backup && url.pathname === '/') {
				backupCalls += 1
				return successResponse(url, {
					backupAssets: backupCalls === 1 ? ['/_nuxt/previous-build.js'] : sharedAssets,
				})
			}
			return successResponse(url)
		}) as unknown as typeof fetch

		await expect(runProductionProbe({
			fetchImpl,
			sleep,
			attempts: 2,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-domain-convergence',
		})).resolves.toHaveLength(5)
		expect(backupCalls).toBe(2)
		expect(sleep).toHaveBeenCalledTimes(1)
	})

	it('retries a transient API failure and succeeds within the bound', async () => {
		let healthCalls = 0
		const sleep = vi.fn(async () => {})
		const fetchImpl = vi.fn(async (input: string | URL | Request) => {
			const url = requestUrl(input)
			if (url.pathname === '/api/health') {
				healthCalls += 1
				return successResponse(url, { healthStatus: healthCalls === 1 ? 503 : 200 })
			}
			return successResponse(url)
		}) as unknown as typeof fetch

		await expect(runProductionProbe({
			fetchImpl,
			sleep,
			attempts: 2,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-retry',
		})).resolves.toHaveLength(5)
		expect(healthCalls).toBe(2)
		expect(sleep).toHaveBeenCalledTimes(1)
	})

	it('stops after the configured number of failed attempts', async () => {
		let primaryCalls = 0
		const fetchImpl = vi.fn(async (input: string | URL | Request) => {
			const url = requestUrl(input)
			if (url.origin === controlledProductionOrigins.primary && url.pathname === '/') {
				primaryCalls += 1
				return new Response('unavailable', { status: 503 })
			}
			return successResponse(url)
		}) as unknown as typeof fetch

		await expect(runProductionProbe({
			fetchImpl,
			sleep: async () => {},
			attempts: 3,
			timeoutMs: 1_000,
			baseDelayMs: 1,
			nonce: 'test-bound',
		})).rejects.toThrow(/failed after 3 attempts/u)
		expect(primaryCalls).toBe(3)
	})

	it('keeps the production workflow wired to the fixed public probe', async () => {
		const [workflow, packageJson] = await Promise.all([
			readFile(`${root}/.github/workflows/pages-production.yml`, 'utf8'),
			readFile(`${root}/package.json`, 'utf8'),
		])
		expect(workflow).toContain('pnpm check:production')
		expect(workflow).toContain('timeout-minutes: 5')
		expect(workflow).toContain('/pages/projects/fly-living')
		expect(workflow).toContain('production_branch')
		expect(workflow).toContain('EXPECTED_PAGES_DEPLOYMENT_URL')
		expect(workflow).toContain('steps.deploy.outputs.deployment-url')
		expect(packageJson).toContain('"check:production": "unrun scripts/check-production.ts && unrun scripts/check-production-browser.ts"')
		expect(`${workflow}\n${packageJson}`).not.toContain('fly-blog.pages.dev')
	})
})
