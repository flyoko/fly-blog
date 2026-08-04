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
		await page.getByText('补充信息', { exact: true }).click()
		await page.getByLabel('标签').fill('生活, 测试')
		await page.getByRole('button', { name: '保存为草稿' }).click()
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
			profile: {
				body: expect.stringContaining('![sample.webp](https://media.example/sample.webp)'),
				date: '2026-08-03',
				sitemap: false,
				customMeta: { preserved: true },
			},
		})
		expect(capture.aboutWrites[0].profile).not.toHaveProperty('sha')
		await expect(page.getByText(/自述正文已直接提交/u)).toBeVisible()
		await page.getByRole('button', { name: '添加经历' }).click()
		await page.getByRole('button', { name: '保存时间线并预览' }).click()
		await expect.poll(() => capture.configWrites.some(item => item.kind === 'aboutTimeline')).toBe(true)
	})

	test('admin refreshes news sources and creates a manual card', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/ai-news')
		await page.getByRole('button', { name: '立即同步' }).click()
		await expect.poll(() => capture.newsWrites.length).toBe(1)
		await page.getByRole('tab', { name: /手动精选/u }).click()
		await page.getByLabel('标题').fill('Manual news card')
		await page.getByLabel('原文链接').fill('https://example.com/manual')
		await page.getByRole('button', { name: '添加到内容列表' }).click()
		await expect.poll(() => capture.newsWrites.length).toBe(2)
		await expect(page.getByText('手动精选已添加到内容列表。')).toBeVisible()
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
})

test.describe('cycle 2 AI news internal reading', () => {
	test('searches compact news and opens whitelisted content inside the blog', async ({ page }) => {
		await mockAdminApi(page)
		await page.goto('/moments')
		await page.evaluate(() => {
			window.history.pushState({}, '', '/ai.news')
			window.dispatchEvent(new PopStateEvent('popstate'))
		})

		await expect(page.getByRole('heading', { name: 'AI 阅闻' })).toBeVisible()
		await expect(page.getByText('内容持续更新')).toBeVisible()
		await expect(page.getByText('每 5 分钟检查')).toHaveCount(0)
		await expect(page.getByRole('heading', { name: '今日日报' })).toBeVisible()
		await expect(page.locator('.news-digest-item').filter({ hasText: 'AI HOT 站内阅读测试' })).toHaveAttribute('href', `/ai.news/read/${'c'.repeat(32)}`)
		await expect(page.getByText('查看 AI HOT 原始日报')).toHaveCount(0)

		const internalTitle = page.locator('.news-feed').getByRole('link', { name: 'AI HOT 站内阅读测试', exact: true })
		await expect(internalTitle).toHaveAttribute('href', `/ai.news/read/${'c'.repeat(32)}`)
		await expect(page.getByRole('link', { name: '外部精选测试', exact: true })).toHaveAttribute('href', 'https://example.com/manual-news')
		await expect(page.getByRole('link', { name: '外部精选测试', exact: true })).toHaveAttribute('target', '_blank')

		const search = page.getByPlaceholder('搜索标题或摘要')
		await search.fill('站长资讯站内')
		await expect(page.getByRole('link', { name: '站长资讯站内阅读测试', exact: true })).toBeVisible()
		await expect(internalTitle).toBeHidden()
		await page.getByRole('button', { name: '清空搜索' }).click()

		await internalTitle.click()
		await expect(page).toHaveURL(new RegExp(`/ai\\.news/read/${'c'.repeat(32)}$`, 'u'))
		await expect(page.getByRole('heading', { name: 'AI HOT 站内阅读测试' })).toBeVisible()
		await expect(page.getByText('AI HOT 正文第一段。')).toBeVisible()
		await expect(page.getByText('AI HOT 正文第二段。')).toBeVisible()
		await expect(page.getByText('以下内容整理自公开来源，版权与观点归原作者所有。')).toBeVisible()
		await expect(page.getByRole('link', { name: '查看原始来源' })).toHaveAttribute('href', 'https://example.com/original')
		await expect(page.getByText('查看聚合来源')).toHaveCount(0)
		await page.getByRole('link', { name: '返回 AI 阅闻' }).click()
		await expect(page).toHaveURL(/\/ai\.news\/?$/u)
	})
})
