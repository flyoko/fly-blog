import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockAuthenticatedAdmin } from './fixtures/admin-api'

async function readLatestArticleDraft(page: Page) {
	return page.evaluate(async () => {
		const request = indexedDB.open('fly-living-admin', 1)
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			request.onerror = () => reject(request.error)
			request.onsuccess = () => resolve(request.result)
		})
		try {
			return await new Promise<{ document?: { frontmatter?: { title?: string } } } | null>((resolve, reject) => {
				const transaction = database.transaction('article-drafts', 'readonly')
				const values = transaction.objectStore('article-drafts').getAll()
				values.onerror = () => reject(values.error)
				values.onsuccess = () => resolve(values.result.at(-1) ?? null)
			})
		}
		finally {
			database.close()
		}
	})
}

test.describe('cycle 5 humanized admin', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Cycle 5 task workflows run in the desktop project.')
	})

	test('quick start finds a task instead of making the author hunt through menus', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin')
		await expect(page.getByRole('button', { name: '快速开始' })).toBeVisible()
		await page.keyboard.press('ControlOrMeta+K')
		const palette = page.getByRole('dialog', { name: '快速开始' })
		await expect(palette).toBeVisible()
		await palette.getByPlaceholder('搜索要做的事').fill('媒体')
		await palette.getByRole('button', { name: /上传和整理媒体/u }).click()
		await expect(page).toHaveURL('/admin/media')
	})

	test('article editor explains state and saves with a shortcut', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		await page.getByLabel('标题').fill('一篇更像人在写的文章')
		await page.getByLabel('Markdown 正文').fill('# 开始\n\n这是用于验证写作状态和快捷保存的一段正文。')
		await expect(page.getByText(/\d+ 字 · 约 1 分钟/u)).toBeVisible()
		await expect(page.getByRole('button', { name: '保存草稿' })).toBeVisible()
		await page.keyboard.press('Control+S')
		await expect.poll(() => capture.articleWrites.length).toBe(1)
		expect(capture.articleWrites[0]).toMatchObject({ mode: 'direct', document: { frontmatter: { draft: true } } })
	})

	test('fast navigation waits for the latest local draft', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/articles/new')
		await page.getByLabel('标题').fill('快速离开也不能丢')
		await page.getByRole('link', { name: '概览', exact: true }).click()
		await expect(page).toHaveURL('/admin')
		await expect.poll(async () => (await readLatestArticleDraft(page))?.document?.frontmatter?.title).toBe('快速离开也不能丢')
	})

	test('navigation settings are edited as content cards instead of raw JSON', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/settings')
		await page.getByRole('button', { name: /^导航 /u }).click()
		await expect(page.getByText('导航菜单', { exact: true })).toBeVisible()
		await expect(page.getByText('结构化 JSON')).toHaveCount(0)
		await page.getByRole('button', { name: '添加导航项' }).click()
		const items = page.locator('.admin-config-item')
		await items.last().getByLabel('显示文字').fill('新入口')
		await items.last().getByLabel('链接地址').fill('/new-entry')
		await page.getByRole('button', { name: '创建导航 PR' }).click()
		await expect.poll(() => capture.configWrites.some(write => write.kind === 'navigation')).toBe(true)
		const write = capture.configWrites.find(item => item.kind === 'navigation')
		expect(write?.content[0].items.at(-1)).toMatchObject({ text: '新入口', url: '/new-entry' })
	})

	test('review detail speaks in publishing language rather than raw provider states', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/reviews')
		await page.getByRole('button').filter({ hasText: 'config/taxonomy/categories.json' }).click()
		await expect(page.getByText('检查通过', { exact: true })).toBeVisible()
		await expect(page.getByText('预览可用', { exact: true })).toBeVisible()
		await expect(page.getByText('success', { exact: true })).toHaveCount(0)
	})
})

test('cycle 5 quick start remains usable as a mobile bottom sheet', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile quick-start coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin')
	await page.getByRole('button', { name: '快速开始' }).click()
	const palette = page.getByRole('dialog', { name: '快速开始' })
	await expect(palette).toBeVisible()
	await expect(palette.getByPlaceholder('搜索要做的事')).toBeFocused()
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
})
