import { expect, test } from '@playwright/test'
import { mockAuthenticatedAdmin } from './fixtures/admin-api'

test.describe('cycle 6 resilient humanized admin', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), '完整写作工作流在桌面项目执行。')
	})

	test('article writing diagnoses incomplete links and offers a distraction-free mode', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		await page.getByLabel('标题').fill('验证写作韧性')
		await page.getByLabel('Markdown 正文').fill('阅读 [Boss-Helper](https://) 后继续写作。')

		const diagnostic = page.getByRole('button', { name: /链接地址不完整/u })
		await expect(diagnostic).toBeVisible()
		await diagnostic.click()
		await expect(page.getByLabel('Markdown 正文')).toBeFocused()

		await page.getByRole('button', { name: '专注写作' }).click()
		await expect(page.locator('.admin-editor-shell')).toHaveClass(/is-focus-mode/u)
		await expect(page.locator('.admin-editor-list')).toBeHidden()
		await expect(page.locator('.admin-editor-meta')).toBeHidden()
		await page.getByRole('button', { name: '退出专注' }).click()
		await expect(page.locator('.admin-editor-list')).toBeVisible()
	})

	test('technical API failures become a friendly toast instead of raw provider text', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { overviewFailure: true })
		await page.goto('/admin')

		const toast = page.locator('.admin-toast').filter({ hasText: '操作没有完成' })
		await expect(toast).toContainText('依赖服务暂时不可用，请稍后重试。')
		await expect(page.getByText('GitHub is temporarily unavailable')).toHaveCount(0)
		await toast.getByRole('button', { name: '关闭通知' }).click()
		await expect(toast).toBeHidden()
	})

	test('a recovered page explains what happened without losing the current task', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		await page.evaluate(() => sessionStorage.setItem('fly_admin_chunk_recovered', location.pathname))
		await page.reload()

		const toast = page.locator('.admin-toast').filter({ hasText: '页面已恢复' })
		await expect(toast).toContainText('刚才的内容仍保存在这台设备，可以继续操作。')
		await expect(page.getByRole('heading', { name: '新建文章' })).toBeAttached()
	})
})

test('cycle 6 focus mode remains reachable on mobile without horizontal overflow', async ({ page, isMobile }) => {
	test.skip(!isMobile, '移动端专注模式只在移动项目执行。')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin/articles/new')
	await page.getByRole('button', { name: '专注写作' }).click()
	await expect(page.locator('.admin-editor-shell')).toHaveClass(/is-focus-mode/u)
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
})
