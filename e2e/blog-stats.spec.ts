import { expect, test } from '@playwright/test'

test.describe('blog statistics', () => {
	test('parses prerendered stats when the static host serves JSON as octet-stream', async ({ page, isMobile }) => {
		test.skip(Boolean(isMobile), 'The desktop project covers the shared statistics data flow.')

		await page.route('**/api/stats', async (route) => {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'application/octet-stream' },
				body: JSON.stringify({
					total: { posts: 4, words: 1234 },
					annual: { 2026: { posts: 4, words: 1234 } },
					categories: [],
					tags: [],
				}),
			})
		})

		await page.goto('/')

		const totalWords = page.getByText('总字数', { exact: true }).locator('..').locator('dd')
		await expect(totalWords).toHaveText('1234')
		await expect(totalWords).toHaveAttribute('title', '2026年：4篇，1234字')
	})
})
