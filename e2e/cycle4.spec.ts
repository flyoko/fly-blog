import { expect, test } from '@playwright/test'
import { mockAdminApi, mockAuthenticatedAdmin } from './fixtures/admin-api'

const publicRoutes = ['/', '/2026/welcome', '/me', '/moments', '/ai.news', '/link', '/archive']
const adminRoutes = [
	'/admin',
	'/admin/articles',
	'/admin/articles/new',
	'/admin/media',
	'/admin/about',
	'/admin/moments',
	'/admin/ai-news',
	'/admin/music',
	'/admin/modules',
	'/admin/reviews',
	'/admin/settings',
]

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
}

test('enabled weather and music initialize their public runtimes once', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(window, '__mediaLoadCount', { configurable: true, writable: true, value: 0 })
		Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 120 })
		HTMLMediaElement.prototype.load = function load() {
			Object.assign(window, { __mediaLoadCount: Number((window as unknown as { __mediaLoadCount?: number }).__mediaLoadCount || 0) + 1 })
			queueMicrotask(() => {
				this.dispatchEvent(new Event('loadedmetadata'))
				this.dispatchEvent(new Event('canplay'))
			})
		}
	})
	let weatherRequests = 0
	let musicRequests = 0
	await page.route('**/api/weather', async (route) => {
		weatherRequests++
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				ok: true,
				data: {
					available: true,
					city: '杭州',
					timezone: 'Asia/Shanghai',
					temperature: 29.4,
					weatherCode: 1,
					condition: '少云',
					icon: 'ri:sun-cloudy-line',
					isDay: true,
					high: 34,
					low: 25,
					windSpeed: 8.2,
					precipitationProbability: 20,
					tip: '适合安排一次轻松的户外活动。',
					observedAt: '2026-08-04T04:00',
					fetchedAt: '2026-08-03T20:00:00.000Z',
					stale: false,
					sourceName: 'Open-Meteo',
					sourceUrl: 'https://open-meteo.com/',
				},
			}),
		})
	})
	await page.route('**/api/music/playlist', async (route) => {
		musicRequests++
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({
				ok: true,
				data: {
					enabled: true,
					title: '随心听',
					description: 'E2E playlist',
					tracks: [{ id: 'cycle4-track', title: 'Cycle 4 Song', artist: 'fly', audioUrl: 'https://media.example.com/cycle4.wav', coverUrl: null, duration: 120, enabled: true, order: 0 }],
				},
			}),
		})
	})
	await page.goto('/', { waitUntil: 'networkidle' })
	await expect(page.locator('.weather-card')).toBeVisible()
	await expect(page.getByRole('region', { name: '随心听播放器' })).toBeVisible()
	await expect(page.getByText('Cycle 4 Song')).toBeVisible()
	expect(weatherRequests).toBe(1)
	expect(musicRequests).toBe(1)
	const mediaLoads = await page.evaluate(() => Number((window as unknown as { __mediaLoadCount?: number }).__mediaLoadCount || 0))
	expect(mediaLoads).toBe(1)
})

test('sidebar search is a keyboard-operable button with visible focus', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Desktop sidebar search coverage runs in the desktop project.')
	await page.goto('/')
	const search = page.getByRole('button', { name: /搜索/u })
	await search.focus()
	await expect(search).toBeFocused()
	const focus = await search.evaluate((element) => {
		const style = getComputedStyle(element)
		return Number.parseFloat(style.outlineWidth) || 0
	})
	expect(focus).toBeGreaterThanOrEqual(2)
	await search.press('Enter')
	await expect(page.getByRole('searchbox')).toBeVisible()
	await page.keyboard.press('Escape')
	const dropdown = page.locator('.order-toggle .dropdown-trigger')
	await expect(dropdown).toHaveCount(1)
	expect(await dropdown.evaluate(element => element.tagName)).toBe('BUTTON')
	await expect(page.locator('[aria-expanded]:not(button)')).toHaveCount(0)
})

test('reduced motion removes route movement and decorative animation', async ({ page }) => {
	await mockAdminApi(page)
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/')
	const style = await page.locator('html').evaluate((element) => {
		const computed = getComputedStyle(element)
		return { scrollBehavior: computed.scrollBehavior }
	})
	expect(style.scrollBehavior).toBe('auto')
	const headerAnimation = await page.locator('.header-title .split-char').first().evaluate(element => getComputedStyle(element).animationDuration)
	expect(Number.parseFloat(headerAnimation)).toBeLessThanOrEqual(0.001)
	await page.goto('/moments')
	const momentAnimation = await page.locator('.moment-card').first().evaluate(element => getComputedStyle(element).animationName)
	expect(momentAnimation).toBe('none')
})

test('overlay locking and focus restoration work with the keyboard', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Desktop overlay focus coverage runs in the desktop project.')
	await page.goto('/')
	const search = page.getByRole('button', { name: '搜索站内内容' })
	await search.focus()
	await search.press('Enter')
	await expect(page.getByRole('dialog', { name: '站内搜索' })).toBeVisible()
	await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
	await page.keyboard.press('Escape')
	await expect(page.getByRole('dialog', { name: '站内搜索' })).not.toBeVisible()
	await expect(search).toBeFocused()
	await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
})

test('admin skip link moves focus to the main workspace', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Admin skip-link coverage runs in the desktop project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin')
	const skip = page.getByRole('link', { name: '跳转到主要内容' })
	await skip.focus()
	await skip.press('Enter')
	await expect(page.locator('#admin-main-content')).toBeFocused()
})

test('core pages expose named controls, alt text, and a single main landmark', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Semantic audit runs once in the desktop project.')
	const audit = async () => page.evaluate(() => {
		const visible = (element: Element) => {
			const style = getComputedStyle(element)
			const rect = element.getBoundingClientRect()
			return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
		}
		const unnamedButtons = Array.from(document.querySelectorAll('button')).filter((button) => {
			if (!visible(button))
				return false
			const labelledBy = button.getAttribute('aria-labelledby')
			const labelledText = labelledBy ? document.getElementById(labelledBy)?.textContent?.trim() : ''
			return !button.getAttribute('aria-label')?.trim()
				&& !button.getAttribute('title')?.trim()
				&& !labelledText
				&& !button.textContent?.trim()
		})
		const imagesWithoutAlt = Array.from(document.querySelectorAll('img')).filter(image => !image.hasAttribute('alt'))
		return {
			unnamedButtons: unnamedButtons.length,
			imagesWithoutAlt: imagesWithoutAlt.length,
			mainLandmarks: document.querySelectorAll('main').length,
		}
	})

	for (const route of publicRoutes) {
		await page.goto(route)
		await expect.poll(audit).toEqual({ unnamedButtons: 0, imagesWithoutAlt: 0, mainLandmarks: 1 })
	}

	await mockAuthenticatedAdmin(page)
	for (const route of adminRoutes) {
		await page.goto(route)
		await expect.poll(audit).toEqual({ unnamedButtons: 0, imagesWithoutAlt: 0, mainLandmarks: 1 })
	}
})

test('public hydration completes without Vue mismatch errors', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Hydration console audit runs once in the desktop project.')
	const hydrationErrors: string[] = []
	page.on('console', (message) => {
		if (message.type() === 'error' && /hydration/iu.test(message.text()))
			hydrationErrors.push(message.text())
	})
	for (const route of ['/', '/2026/welcome', '/me', '/link', '/archive']) {
		await page.goto(route, { waitUntil: 'networkidle' })
		await page.waitForTimeout(100)
	}
	expect(hydrationErrors).toEqual([])
})

test('Twikoo controls expose accessible names after third-party initialization', async ({ page, isMobile }) => {
	test.skip(Boolean(isMobile), 'Third-party comment semantics run once in the desktop project.')
	await page.goto('/2026/welcome', { waitUntil: 'networkidle' })
	await expect(page.locator('#twikoo textarea')).toHaveAttribute('aria-label', '评论内容')
	await expect(page.locator('#twikoo .__markdown')).toHaveAttribute('aria-label', /Markdown is supported/u)
})

test.describe('mobile overflow matrix', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, 'Mobile overflow matrix runs in the mobile project.')
	})

	test('public routes fit the viewport', async ({ page }) => {
		for (const route of publicRoutes) {
			await page.goto(route)
			await expectNoHorizontalOverflow(page)
		}
	})

	test('admin routes fit the viewport', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		for (const route of adminRoutes) {
			await page.goto(route)
			await expectNoHorizontalOverflow(page)
		}
	})
})
