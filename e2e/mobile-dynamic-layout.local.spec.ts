import { expect, test } from '@playwright/test'

const routeCases = [
	{ route: '/comments', selector: '.comments-mobile-shell' },
	{ route: '/me', selector: '.about-mobile-grid' },
	{ route: '/moments', selector: '.moments-filter-strip' },
	{ route: '/ai.news', selector: '.news-workbench' },
] as const

const widths = [320, 390, 430] as const

test.describe('移动端 Dynamic 与功能页布局', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '仅验证移动端布局。')
	})

	test('默认 Dynamic 在手机上保留低功耗背景动画', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' })
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await page.locator('.blog-atmosphere').waitFor()

		const state = await page.evaluate(() => {
			const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
			return {
				dynamic: document.documentElement.classList.contains('dynamic'),
				lens: style('.atmosphere-lens-a').animationName,
				stars: style('.atmosphere-stars-far').animationName,
				thread: style('.flow-thread').animationName,
				signal: style('.flow-signal').animationName,
				pointer: style('.atmosphere-pointer').display,
			}
		})

		expect(state.dynamic).toBe(true)
		expect(state.lens).not.toBe('none')
		expect(state.stars).not.toBe('none')
		expect(state.thread).not.toBe('none')
		expect(state.signal).not.toBe('none')
		expect(state.pointer).toBe('none')
	})

	test('减少动态效果偏好会关闭移动背景动画', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await page.setViewportSize({ width: 390, height: 844 })
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await page.locator('.blog-atmosphere').waitFor()

		const state = await page.evaluate(() => {
			const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
			return {
				lens: style('.atmosphere-lens-a').animationName,
				thread: style('.flow-thread').animationName,
			}
		})

		expect(state.lens).toBe('none')
		expect(state.thread).toBe('none')
	})

	for (const width of widths) {
		for (const routeCase of routeCases) {
			test(`${width}px ${routeCase.route} 不产生页面级横向溢出`, async ({ page }) => {
				await page.setViewportSize({ width, height: 844 })
				await page.goto(routeCase.route, { waitUntil: 'domcontentloaded' })
				await page.locator(routeCase.selector).waitFor()

				const overflow = await page.evaluate(() => ({
					clientWidth: document.documentElement.clientWidth,
					scrollWidth: document.documentElement.scrollWidth,
				}))
				expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
			})
		}
	}
})
