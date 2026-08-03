import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import {
	articleId,
	mockAdminApi,
	mockAuthenticatedAdmin,
} from './fixtures/admin-api'

async function tabTo(page: Page, target: Locator, maxTabs = 60) {
	// Nuxt 页面切换完成后，异步数据可能仍在用骨架屏替换最终控件。
	// 先等待目标进入最终可见状态，避免在焦点顺序尚未稳定时消耗 Tab。
	await expect(target).toBeVisible()
	for (let index = 0; index < maxTabs; index++) {
		await page.keyboard.press('Tab')
		try {
			await expect(target).toBeFocused({ timeout: 100 })
			return
		}
		catch {
			// Keep using keyboard navigation until the target receives focus.
		}
	}
	throw new Error(`Unable to focus target after ${maxTabs} Tab presses`)
}

test.describe('admin desktop workflows', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Desktop workflow coverage runs in the desktop project.')
	})

	test('admin core workflow publishes an article directly', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.getByRole('link', { name: '文章', exact: true }).click()
		await page.getByRole('link', { name: '新建文章' }).click()
		await page.getByLabel('标题').fill('Cycle 1 test article')
		await page.getByLabel('Markdown 正文').fill('# Test\n\nPublished through the admin.')
		await page.getByRole('button', { name: '直接发布' }).click()

		await expect.poll(() => capture.articleWrites.length).toBe(1)
		expect(capture.articleWrites[0]).toMatchObject({ mode: 'direct' })
		await expect(page).toHaveURL(/\/admin\/articles\//u)
	})

	test('configuration changes create a controlled pull request', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/settings')
		await page.getByRole('button', { name: '创建配置 PR' }).click()
		await expect(page.locator('.admin-pr-result').filter({ hasText: 'Pull Request #42 已创建' })).toBeVisible()
		await expect.poll(() => capture.configWrites.length).toBe(1)
		expect(capture.configWrites[0]).toMatchObject({ kind: 'categories' })
		expect(capture.configWrites[0]).not.toHaveProperty('repositoryPath')
	})

	test('media upload keeps successes when another file fails', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { mediaPartialFailure: true })
		await page.goto('/admin/media')
		await page.locator('input[type="file"]').setInputFiles([
			{ name: 'valid.webp', mimeType: 'image/webp', buffer: Buffer.from('RIFFmockWEBP') },
			{ name: 'invalid.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('not-media') },
		])
		await expect(page.getByText('已成功上传 1 个文件。')).toBeVisible()
		await expect(page.getByText('部分文件上传失败')).toBeVisible()
		await expect(page.getByText(/invalid\.exe/u)).toBeVisible()
	})

	test('article conflict preserves the local draft and exposes recovery choices', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { articleConflict: true })
		await page.goto(`/admin/articles/${articleId}`)
		await page.getByLabel('Markdown 正文').fill('# Local conflicting edit')
		await page.getByRole('button', { name: '直接发布' }).click()
		await expect(page.getByText('远端文章已经变化')).toBeVisible()
		await expect(page.getByRole('button', { name: '重新加载远端' })).toBeVisible()
		await expect(page.getByRole('button', { name: '比较原始 Markdown' })).toBeVisible()
		await expect(page.getByRole('button', { name: '改用 PR 发布' })).toBeVisible()
	})

	test('review detail exposes checks, preview, and guarded merge', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/reviews')
		await page.getByRole('button').filter({ hasText: 'config/taxonomy/categories.json' }).click()
		await expect(page.getByText('success', { exact: true }).first()).toBeVisible()
		await expect(page.locator('.admin-review-file code').filter({ hasText: 'config/taxonomy/categories.json' })).toBeVisible()
		await expect(page.locator('.admin-review-meta code').filter({ hasText: 'head-sha-1' }).first()).toBeVisible()
		await expect(page.locator('.admin-review-file pre')).toContainText('@@ -1 +1 @@')
		await expect(page.getByRole('link', { name: '打开预览' })).toHaveAttribute('href', 'https://preview.example')
		await page.getByRole('button', { name: '确认合并' }).click()
		await page.getByPlaceholder('MERGE').fill('MERGE')
		await page.getByRole('button', { name: '确认合并' }).last().click()
		await expect(page.getByPlaceholder('MERGE')).not.toBeVisible()
	})

	test('dark mode and reduced motion remain available', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await page.getByRole('button', { name: '切换明暗模式' }).click()
		await expect(page.locator('html')).toHaveClass(/dark/u)
		const transitionDuration = await page.locator('.admin-button').first().evaluate((element) => {
			return Number.parseFloat(getComputedStyle(element).transitionDuration) || 0
		})
		expect(transitionDuration).toBeLessThanOrEqual(0.001)
	})

	test('keyboard navigation reaches navigation, editor, upload, and visible focus states', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await page.getByRole('link', { name: '文章', exact: true }).press('Enter')
		await expect(page).toHaveURL('/admin/articles')
		await expect(page.getByRole('link', { name: /Cycle 1 article/u })).toBeVisible()

		await page.getByRole('link', { name: '新建文章' }).first().press('Enter')
		await expect(page).toHaveURL('/admin/articles/new')
		const titleInput = page.getByLabel('标题')
		await tabTo(page, titleInput)
		await page.keyboard.type('Keyboard article')
		await expect(titleInput).toHaveValue('Keyboard article')

		await page.goto('/admin/media')
		const uploadButton = page.getByRole('button', { name: '上传媒体' })
		await tabTo(page, uploadButton)
		const focus = await uploadButton.evaluate((element) => {
			const style = getComputedStyle(element)
			return {
				tagName: element.tagName,
				outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
			}
		})
		expect(focus.tagName).toBe('BUTTON')
		expect(focus.outlineWidth).toBeGreaterThanOrEqual(2)
	})

	test('logout clears the mocked session and returns to login', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.getByRole('button', { name: '退出登录' }).click()
		await expect(page).toHaveURL('/admin/login')
		await expect.poll(() => capture.logoutCount).toBe(1)
	})

	test('session expiry redirects a refreshed admin page to login', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { sessionExpiresAfterLoad: true })
		await page.goto('/admin')
		await expect(page.getByRole('heading', { name: /(早上好|下午好|晚上好|夜深了)，flyoko/u })).toBeVisible()
		await page.reload()
		await expect(page).toHaveURL(/\/admin\/login\?returnTo=/u)
	})

	test('dependency failure renders an actionable degraded state', async ({ page }) => {
		await mockAuthenticatedAdmin(page, { overviewFailure: true })
		await page.goto('/admin')
		await expect(page.getByText('GitHub is temporarily unavailable')).toBeVisible()
		await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible()
	})
})

test('unauthenticated users are redirected to GitHub login screen', async ({ page }) => {
	await mockAdminApi(page, { authenticated: false })
	await page.goto('/admin/articles')
	await expect(page).toHaveURL(/\/admin\/login\?returnTo=/u)
	await expect(page.getByRole('button', { name: '使用 GitHub 登录' })).toBeVisible()
})

test('mobile admin uses a compact navigation drawer', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile drawer coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin')
	await page.getByRole('button', { name: '打开导航' }).click()
	await expect(page.locator('.admin-sidebar')).toHaveClass(/is-open/u)
	await expect(page.getByRole('link', { name: '媒体库' })).toBeVisible()
})
