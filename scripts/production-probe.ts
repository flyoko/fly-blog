export const controlledProductionOrigins = {
	primary: 'https://flyovo.cc.cd',
	backup: 'https://fly-living.pages.dev',
} as const

export interface ProductionProbeOptions {
	fetchImpl?: typeof fetch
	sleep?: (milliseconds: number) => Promise<void>
	attempts?: number
	timeoutMs?: number
	baseDelayMs?: number
	nonce?: string
}

export interface ProductionProbeCheck {
	name: string
	detail: string
}

interface ProbeRuntime {
	fetchImpl: typeof fetch
	sleep: (milliseconds: number) => Promise<void>
	attempts: number
	timeoutMs: number
	baseDelayMs: number
	nonce: string
}

const defaultAttempts = 6
const defaultTimeoutMs = 12_000
const defaultBaseDelayMs = 2_000
const maxDelayMs = 10_000

export class ProductionProbeError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'ProductionProbeError'
	}
}

export function assertControlledProductionOrigins(origins: Readonly<{ primary: string, backup: string }> = controlledProductionOrigins) {
	const primary = new URL(origins.primary)
	const backup = new URL(origins.backup)
	if (primary.origin !== controlledProductionOrigins.primary)
		throw new ProductionProbeError(`Unexpected primary production origin: ${primary.origin}`)
	if (backup.origin !== controlledProductionOrigins.backup)
		throw new ProductionProbeError(`Unexpected backup production origin: ${backup.origin}`)
}

export function extractNuxtAssetPaths(html: string): string[] {
	const assets = new Set<string>()
	const attributePattern = /(?:src|href)=["']([^"']*\/_nuxt\/[^"']+)["']/gu
	for (const match of html.matchAll(attributePattern)) {
		const raw = match[1]
		if (!raw)
			continue
		const path = new URL(raw, controlledProductionOrigins.primary).pathname
		if (path.startsWith('/_nuxt/'))
			assets.add(path)
	}
	return [...assets].sort()
}

function positiveInteger(value: number | undefined, fallback: number, label: string) {
	const resolved = value ?? fallback
	if (!Number.isSafeInteger(resolved) || resolved <= 0)
		throw new ProductionProbeError(`${label} must be a positive integer.`)
	return resolved
}

function runtime(options: ProductionProbeOptions): ProbeRuntime {
	return {
		fetchImpl: options.fetchImpl ?? fetch,
		sleep: options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))),
		attempts: positiveInteger(options.attempts, defaultAttempts, 'attempts'),
		timeoutMs: positiveInteger(options.timeoutMs, defaultTimeoutMs, 'timeoutMs'),
		baseDelayMs: positiveInteger(options.baseDelayMs, defaultBaseDelayMs, 'baseDelayMs'),
		nonce: options.nonce ?? crypto.randomUUID(),
	}
}

function delayForAttempt(attempt: number, baseDelayMs: number) {
	return Math.min(maxDelayMs, baseDelayMs * (2 ** Math.max(0, attempt - 1)))
}

function publicError(error: unknown) {
	if (error instanceof Error)
		return error.message
	return String(error)
}

async function fetchText(url: URL, runtime: ProbeRuntime) {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), runtime.timeoutMs)
	try {
		const response = await runtime.fetchImpl(url, {
			headers: {
				'accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
				'cache-control': 'no-cache',
				'user-agent': 'fly-living-production-probe/1.0',
			},
			redirect: 'follow',
			signal: controller.signal,
		})
		const body = await response.text()
		if (response.status !== 200)
			throw new ProductionProbeError(`${url.origin}${url.pathname} returned HTTP ${response.status}.`)
		return { response, body }
	}
	catch (error) {
		if (error instanceof ProductionProbeError)
			throw error
		if (controller.signal.aborted)
			throw new ProductionProbeError(`${url.origin}${url.pathname} timed out after ${runtime.timeoutMs} ms.`, { cause: error })
		throw new ProductionProbeError(`${url.origin}${url.pathname} request failed: ${publicError(error)}`, { cause: error })
	}
	finally {
		clearTimeout(timeout)
	}
}

async function retryCheck<T>(name: string, runtime: ProbeRuntime, check: () => Promise<T>): Promise<T> {
	let lastError: unknown
	for (let attempt = 1; attempt <= runtime.attempts; attempt += 1) {
		try {
			return await check()
		}
		catch (error) {
			lastError = error
			if (attempt === runtime.attempts)
				break
			await runtime.sleep(delayForAttempt(attempt, runtime.baseDelayMs))
		}
	}
	throw new ProductionProbeError(`${name} failed after ${runtime.attempts} attempts: ${publicError(lastError)}`, { cause: lastError })
}

function probeUrl(origin: string, path: string, nonce: string) {
	const url = new URL(path, origin)
	url.searchParams.set('__production_probe', nonce)
	return url
}

async function readHomeAssets(origin: string, runtime: ProbeRuntime) {
	const url = probeUrl(origin, '/', runtime.nonce)
	const { body } = await fetchText(url, runtime)
	if (!/fly living/iu.test(body))
		throw new ProductionProbeError(`${url.origin}/ is missing the fly living site marker.`)
	const assets = extractNuxtAssetPaths(body)
	if (!assets.length)
		throw new ProductionProbeError(`${url.origin}/ does not reference any Nuxt build assets.`)
	return assets
}

async function checkMatchingHomes(runtime: ProbeRuntime) {
	return retryCheck('Production domain build consistency', runtime, async () => {
		const [primaryAssets, backupAssets] = await Promise.all([
			readHomeAssets(controlledProductionOrigins.primary, runtime),
			readHomeAssets(controlledProductionOrigins.backup, runtime),
		])
		if (primaryAssets.join('\n') !== backupAssets.join('\n')) {
			throw new ProductionProbeError(
				`Primary and backup domains reference different Nuxt assets. primary=${primaryAssets.length}, backup=${backupAssets.length}.`,
			)
		}
		return { primaryAssets, backupAssets }
	})
}

async function checkHealth(runtime: ProbeRuntime) {
	return retryCheck('API health', runtime, async () => {
		const url = probeUrl(controlledProductionOrigins.primary, '/api/health', runtime.nonce)
		const { body } = await fetchText(url, runtime)
		let payload: unknown
		try {
			payload = JSON.parse(body)
		}
		catch (error) {
			throw new ProductionProbeError('API health returned invalid JSON.', { cause: error })
		}
		const record = payload as { ok?: boolean, data?: { service?: string, status?: string } }
		if (record.ok !== true || record.data?.status !== 'ok')
			throw new ProductionProbeError('API health did not report status=ok.')
		return record.data.service ?? 'fly-living-api'
	})
}

async function checkAnonymousSession(runtime: ProbeRuntime) {
	return retryCheck('Anonymous admin session', runtime, async () => {
		const url = probeUrl(controlledProductionOrigins.primary, '/api/auth/session', runtime.nonce)
		const { body } = await fetchText(url, runtime)
		let payload: unknown
		try {
			payload = JSON.parse(body)
		}
		catch (error) {
			throw new ProductionProbeError('Anonymous admin session returned invalid JSON.', { cause: error })
		}
		const record = payload as { ok?: boolean, data?: { authenticated?: boolean } }
		if (record.ok !== true || record.data?.authenticated !== false)
			throw new ProductionProbeError('Anonymous admin session was not explicitly unauthenticated.')
	})
}

async function checkLoginPage(runtime: ProbeRuntime) {
	return retryCheck('Admin login page', runtime, async () => {
		const url = probeUrl(controlledProductionOrigins.primary, '/admin/login?returnTo=%2Fadmin', runtime.nonce)
		const { body } = await fetchText(url, runtime)
		if (!/fly living/iu.test(body))
			throw new ProductionProbeError('Admin login page is missing the fly living site marker.')
	})
}

export async function runProductionProbe(options: ProductionProbeOptions = {}): Promise<ProductionProbeCheck[]> {
	assertControlledProductionOrigins()
	const resolved = runtime(options)
	const { primaryAssets } = await checkMatchingHomes(resolved)
	const [service] = await Promise.all([
		checkHealth(resolved),
		checkAnonymousSession(resolved),
		checkLoginPage(resolved),
	])
	return [
		{ name: '正式域首页', detail: `${controlledProductionOrigins.primary}/ · ${primaryAssets.length} 个构建资源` },
		{ name: '备用域首页', detail: `${controlledProductionOrigins.backup}/ · 构建资源一致` },
		{ name: 'API 健康', detail: `${controlledProductionOrigins.primary}/api/health · ${service}` },
		{ name: '后台未登录保护', detail: '/api/auth/session · authenticated=false' },
		{ name: '后台登录页', detail: '/admin/login?returnTo=/admin · 可访问' },
	]
}
