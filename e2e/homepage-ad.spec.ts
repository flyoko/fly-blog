import { expect, test } from '@playwright/test'

const adTitle = '质保 plus月抛封号'

test.describe('homepage advertisement carousel', () => {
	test('stays compact on desktop and does not enter article pages', async ({ page, isMobile }) => {
		test.skip(Boolean(isMobile), 'Desktop dimensions run in the desktop project.')
		test.setTimeout(60_000)
		await page.goto('/')

		const carousel = page.locator('.home-ad-carousel')
		const frame = page.locator('.home-ad-carousel-frame')
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(adTitle)
		await expect(frame).toHaveCSS('height', '164px')
		await expect(page.locator('.home-ad-carousel-main')).toHaveAttribute('rel', /sponsored/u)

		const layout = await page.evaluate(() => {
			const frame = document.querySelector<HTMLElement>('.home-ad-carousel-frame')
			const postList = document.querySelector<HTMLElement>('.post-list')
			return {
				noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
				beforePostList: Boolean(frame && postList && frame.getBoundingClientRect().bottom < postList.getBoundingClientRect().bottom),
			}
		})
		expect(layout.noOverflow).toBe(true)
		expect(layout.beforePostList).toBe(true)

		await page.getByRole('button', { name: '全部分类', exact: true }).click()
		await page.locator('.dropdown-content:visible').getByRole('button', { name: '生活', exact: true }).click()
		await expect(page).toHaveURL(/category=%E7%94%9F%E6%B4%BB/u)
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(adTitle)

		await page.goto('/?sort=updated')
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(adTitle)

		await page.goto('/2026/welcome')
		await expect(page.locator('.home-ad-carousel')).toHaveCount(0)
		await expect(page.getByRole('heading', { name: '你好，这里是 fly living' })).toBeVisible()
	})

	test('uses the mobile height and stays visible on filtered and sorted home views', async ({ page, isMobile }) => {
		test.skip(!isMobile, 'Mobile dimensions run in the mobile project.')
		test.setTimeout(60_000)
		await page.goto('/')
		await expect(page.locator('.home-ad-carousel-frame')).toHaveCSS('height', '132px')
		await expect(page.locator('.home-ad-carousel')).toContainText(adTitle)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

		for (const query of ['?category=生活', '?sort=updated']) {
			await page.goto(`/${query}`)
			await expect(page.locator('.home-ad-carousel')).toBeVisible()
			await expect(page.locator('.home-ad-carousel')).toContainText(adTitle)
		}
	})
})
