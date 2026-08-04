import process from 'node:process'
import { chromium } from '@playwright/test'

const productionOrigin = 'https://flyovo.cc.cd'
const defaultAttempts = 3
const defaultTimeoutMs = 30_000
const defaultDelayMs = 2_000

function positiveInteger(value: string | undefined, fallback: number, label: string) {
	if (!value)
		return fallback
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed <= 0)
		throw new TypeError(`${label} must be a positive integer.`)
	return parsed
}

function expectedLoginUrl(url: URL) {
	return url.origin === productionOrigin
		&& url.pathname === '/admin/login'
		&& url.searchParams.get('returnTo') === '/admin'
}

function publicError(error: unknown) {
	return error instanceof Error ? error.message : String(error)
}

const attempts = positiveInteger(process.env.PRODUCTION_BROWSER_PROBE_ATTEMPTS, defaultAttempts, 'PRODUCTION_BROWSER_PROBE_ATTEMPTS')
const timeoutMs = positiveInteger(process.env.PRODUCTION_BROWSER_PROBE_TIMEOUT_MS, defaultTimeoutMs, 'PRODUCTION_BROWSER_PROBE_TIMEOUT_MS')
const delayMs = positiveInteger(process.env.PRODUCTION_BROWSER_PROBE_DELAY_MS, defaultDelayMs, 'PRODUCTION_BROWSER_PROBE_DELAY_MS')
let lastError: unknown

for (let attempt = 1; attempt <= attempts; attempt += 1) {
	let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
	try {
		browser = await chromium.launch({ channel: 'chrome', headless: true, timeout: timeoutMs })
		const context = await browser.newContext()
		const page = await context.newPage()
		await page.goto(`${productionOrigin}/admin?__production_probe=${crypto.randomUUID()}`, {
			waitUntil: 'domcontentloaded',
			timeout: timeoutMs,
		})
		await page.waitForURL(expectedLoginUrl, { timeout: timeoutMs })
		const body = await page.locator('body').textContent({ timeout: timeoutMs }) ?? ''
		if (!/fly living/iu.test(body))
			throw new Error('Admin login page is missing the fly living site marker.')
		console.info('[production-probe] PASS 后台未登录跳转：/admin → /admin/login?returnTo=/admin')
		lastError = undefined
		break
	}
	catch (error) {
		lastError = error
		if (attempt < attempts)
			await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
	}
	finally {
		await browser?.close()
	}
}

if (lastError)
	throw new Error(`Admin browser redirect failed after ${attempts} attempts: ${publicError(lastError)}`, { cause: lastError })
