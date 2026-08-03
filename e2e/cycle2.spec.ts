import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { mockAdminApi, mockAuthenticatedAdmin } from './fixtures/admin-api'

test.describe('cycle 2 desktop workflows', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Cycle 2 workflow coverage runs in the desktop project.')
	})

	test('admin creates a moment without losing the editor state', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/moments')
		await page.getByRole('button', { name: '新建瞬间' }).click()
		await page.getByLabel('内容').fill('Cycle 2 browser moment')
		await page.getByLabel('标签（逗号分隔）').fill('生活, 测试')
		await page.getByRole('button', { name: '保存', exact: true }).click()
		await expect.poll(() => capture.momentWrites.length).toBe(1)
		expect(capture.momentWrites[0]).toMatchObject({ moment: { content: 'Cycle 2 browser moment', status: 'draft' } })
		await expect(page.getByText('瞬间已保存。')).toBeVisible()
	})

	test('admin publishes about markdown and creates controlled structure PRs', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/about')
		await page.getByLabel('正文 Markdown').fill('Updated **about** body.\n\n')
		await page.getByRole('button', { name: '插入图片' }).click()
		await page.locator('input[type="file"]').setInputFiles({
			name: 'profile.png',
			mimeType: 'image/png',
			buffer: Buffer.from('profile-image'),
		})
		await expect.poll(() => capture.mediaUploads).toBe(1)
		await page.getByRole('button', { name: /sample\.webp/u }).click()
		await expect(page.getByLabel('正文 Markdown')).toHaveValue(/!\[sample\.webp\]\(https:\/\/media\.example\/sample\.webp\)/u)
		await expect(page.locator('.admin-preview-content img')).toHaveAttribute('src', 'https://media.example/sample.webp')
		await page.getByRole('button', { name: '保存正文' }).click()
		await expect.poll(() => capture.aboutWrites.length).toBe(1)
		expect(capture.aboutWrites[0]).toMatchObject({
			profile: { body: expect.stringContaining('![sample.webp](https://media.example/sample.webp)') },
		})
		await expect(page.getByText(/自述正文已直接提交/u)).toBeVisible()
		await page.getByRole('button', { name: '创建时间线 PR' }).click()
		await expect.poll(() => capture.configWrites.some(item => item.kind === 'aboutTimeline')).toBe(true)
	})

	test('admin refreshes news sources and creates a manual card', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/ai-news')
		await page.getByRole('button', { name: '立即同步' }).click()
		await expect.poll(() => capture.newsWrites.length).toBe(1)
		await page.getByLabel('标题').fill('Manual news card')
		await page.getByLabel('原文链接').fill('https://example.com/manual')
		await page.getByRole('button', { name: '添加卡片' }).click()
		await expect.poll(() => capture.newsWrites.length).toBe(2)
		await expect(page.getByText('手动精选卡片已添加。')).toBeVisible()
	})

	test('public moments render, like, and open a stable detail route', async ({ page }) => {
		await mockAdminApi(page)
		await page.goto('/moments')
		await expect(page.getByText('A deterministic Cycle 2 moment.')).toBeVisible()
		const like = page.locator('.moment-card footer button')
		await expect(like).toContainText('2')
		await like.click()
		await expect(like).toContainText('3')
		await page.getByRole('link', { name: '查看瞬间详情' }).click()
		await expect(page).toHaveURL(/\/moments\/11111111-1111-4111-8111-111111111111/u)
		await expect(page.getByText('A deterministic Cycle 2 moment.')).toBeVisible()
	})

	test('AI news renders the briefing, source attribution, and original link', async ({ page }) => {
		await mockAdminApi(page)
		await page.goto('/moments')
		await page.evaluate(() => {
			window.history.pushState({}, '', '/ai.news')
			window.dispatchEvent(new PopStateEvent('popstate'))
		})
		await expect(page.getByRole('heading', { name: 'AI 阅闻' })).toBeVisible()
		await expect(page.getByText('AI 日报 · 2026-08-03')).toBeVisible()
		await expect(page.getByRole('link', { name: 'AI HOT test item' })).toHaveAttribute('href', 'https://example.com/hot')
		await expect(page.getByRole('link', { name: '原文' })).toHaveAttribute('href', 'https://example.com/original')
	})
})
