import { expect, test } from '@playwright/test'

async function articleDates(page: import('@playwright/test').Page) {
	return page.locator('.article-card time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime') || ''))
}

test.describe('homepage article controls', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Homepage control behavior is covered once in the desktop project.')
	})

	test('filters categories, clears back to all, and sorts by creation time', async ({ page }) => {
		test.setTimeout(60_000)
		await page.goto('/', { waitUntil: 'domcontentloaded' })
		const articles = page.locator('.article-card')
		await expect(articles).toHaveCount(2)

		await page.getByRole('button', { name: '全部分类', exact: true }).click()
		await page.locator('.dropdown-content:visible').getByRole('button', { name: '生活', exact: true }).click()
		await expect(page).toHaveURL(/category=%E7%94%9F%E6%B4%BB/u)
		await expect(articles).toHaveCount(1)
		await expect(articles.first()).toContainText('生活')

		await page.getByRole('button', { name: '生活', exact: true }).click()
		await page.locator('.dropdown-content:visible').getByRole('button', { name: '全部分类', exact: true }).click()
		await expect(page).not.toHaveURL(/category=/u)
		await expect(articles).toHaveCount(2)

		const descendingDates = await articleDates(page)
		expect(descendingDates).toEqual([...descendingDates].sort().reverse())
		await page.getByRole('button', { name: '切换为最早优先' }).click()
		await expect(page).toHaveURL(/asc=true/u)
		await expect.poll(() => articleDates(page)).toEqual([...descendingDates].sort())

		await page.getByRole('button', { name: /创建时间 · 最早优先/u }).click()
		await page.locator('.dropdown-content:visible').getByRole('button', { name: '更新日期', exact: true }).click()
		await expect(page).toHaveURL(/sort=updated/u)
		await expect(page.getByRole('button', { name: /更新日期 · 最早优先/u })).toBeVisible()
	})
})
