import { expect, test } from '@playwright/test'

test.describe('站点标题', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(isMobile, '原始 HTML 标题只需在一个浏览器项目验证。')
	})

	test('静态 HTML 和水合后的标题都不会暴露模板占位符', async ({ page, request }) => {
		const response = await request.get('/moments')
		expect(response.ok()).toBe(true)
		const html = await response.text()
		expect(html).toContain('<title>fly living</title>')
		expect(html).not.toContain('%separator')

		await page.goto('/moments', { waitUntil: 'domcontentloaded' })
		await expect(page).toHaveTitle('瞬间 | fly living')
	})
})
