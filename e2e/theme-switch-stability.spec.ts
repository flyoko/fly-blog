import { expect, test } from '@playwright/test'

test.describe('theme compositor stability', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'The reported theme compositor flicker is a desktop Mac regression.')
	})

	test('freezes ambient layers while dark and dynamic themes recolor, then resumes them', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const atmosphere = page.locator('.blog-atmosphere')
		const light = page.getByRole('button', { name: '浅色模式' })
		const dark = page.getByRole('button', { name: '深色模式' })
		const dynamic = page.getByRole('button', { name: '动态模式' })

		await expect(atmosphere).toBeVisible()
		await light.click()
		await page.waitForTimeout(700)

		for (const [target, themeClass] of [[dark, 'dark'], [dynamic, 'dynamic'], [dark, 'dark']] as const) {
			await target.click()
			await expect(atmosphere).toHaveClass(/is-theme-switching/)
			await expect(page.locator('html')).toHaveClass(new RegExp(themeClass))

			const frozen = await atmosphere.evaluate((root) => {
				const ambient = root.getAnimations({ subtree: true })
					.filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('atmosphere-'))
				return {
					states: ambient.map(animation => animation.playState),
					times: ambient.map(animation => Number(animation.currentTime ?? 0)),
				}
			})
			expect(frozen.states.length).toBeGreaterThan(0)
			expect(frozen.states.every(state => state === 'paused')).toBe(true)

			await page.waitForTimeout(260)
			const frozenAfter = await atmosphere.evaluate(root => root.getAnimations({ subtree: true })
				.filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('atmosphere-'))
				.map(animation => Number(animation.currentTime ?? 0)))
			expect(frozenAfter).toEqual(frozen.times)

			await expect(atmosphere).not.toHaveClass(/is-theme-switching/, { timeout: 2_000 })
			const resumed = await atmosphere.evaluate(root => root.getAnimations({ subtree: true })
				.filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('atmosphere-'))
				.map(animation => ({ state: animation.playState, time: Number(animation.currentTime ?? 0) })))
			expect(resumed.every(animation => animation.state === 'running')).toBe(true)
			const resumedTimes = resumed.map(animation => animation.time)
			await expect.poll(async () => atmosphere.evaluate((root, previousTimes) => root.getAnimations({ subtree: true })
				.filter(animation => animation instanceof CSSAnimation && animation.animationName.startsWith('atmosphere-'))
				.some((animation, index) => Number(animation.currentTime ?? 0) > (previousTimes[index] ?? 0)), resumedTimes), {
				intervals: [120, 180, 240],
				timeout: 2_000,
			}).toBe(true)
		}
	})

	test('keeps animated SVG ribbons filter-free on Retina-class desktop rendering', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		await page.getByRole('button', { name: '动态模式' }).click()
		await page.waitForTimeout(700)

		for (const selector of ['.flow-halo', '.flow-thread', '.flow-signal']) {
			const values = await page.locator(selector).evaluateAll(elements => elements.map(element => getComputedStyle(element).filter))
			expect(values.length).toBeGreaterThan(0)
			expect(values.every(value => value === 'none')).toBe(true)
		}
	})
})
