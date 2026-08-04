import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
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
		await expect(page.getByText(/已读取线上配置/u)).toBeVisible()
		await page.getByRole('tab', { name: /^导航/u }).click()
		await expect(page.getByRole('button', { name: '没有改动' })).toBeDisabled()
		await expect(page.getByText('导航菜单', { exact: true })).toBeVisible()
		await expect(page.getByText('结构化 JSON')).toHaveCount(0)
		await page.getByRole('button', { name: '添加导航项' }).click()
		const items = page.locator('.admin-config-item')
		await items.last().getByLabel('显示文字').fill('新入口')
		await items.last().getByLabel('链接地址').fill('/new-entry')
		await page.getByRole('button', { name: '保存导航并预览' }).click()
		await expect.poll(() => capture.configWrites.some(write => write.kind === 'navigation')).toBe(true)
		const write = capture.configWrites.find(item => item.kind === 'navigation')
		expect(write?.content[0].items.at(-1)).toMatchObject({ text: '新入口', url: '/new-entry' })
	})

	test('moment composer keeps optional fields out of the way and publishes in one step', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/moments?compose=1')
		await expect(page.getByText('地点、标签、音乐、图片均为可选')).toBeVisible()
		await expect(page.getByLabel('城市')).toBeHidden()
		await page.getByPlaceholder('此刻在想什么？').fill('直接从一个输入框发布的瞬间。')
		await page.getByRole('button', { name: '立即发布' }).click()
		await expect.poll(() => capture.momentWrites.length).toBe(1)
		expect(capture.momentWrites[0]).toMatchObject({ moment: { content: '直接从一个输入框发布的瞬间。', status: 'published' } })
	})

	test('about timeline and links are edited as cards instead of JSON', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/about')
		await expect(page.getByText('JSON', { exact: true })).toHaveCount(0)
		await page.getByRole('button', { name: '添加经历' }).click()
		const timelineCard = page.locator('.admin-about-item').first()
		await timelineCard.getByLabel('时间').fill('2026')
		await timelineCard.getByLabel('标题').fill('完成拟人化后台')
		await page.getByRole('button', { name: '保存时间线并预览' }).click()
		await expect.poll(() => capture.configWrites.some(write => write.kind === 'aboutTimeline')).toBe(true)
		expect(capture.configWrites.find(write => write.kind === 'aboutTimeline')?.content).toContainEqual(expect.objectContaining({ title: '完成拟人化后台' }))
	})

	test('media upload and reuse stay on one page', async ({ page, context }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await context.grantPermissions(['clipboard-read', 'clipboard-write'])
		await page.goto('/admin/media')
		await page.getByRole('button', { name: '瞬间图片' }).click()
		await page.getByLabel('选择要上传的媒体文件').setInputFiles({
			name: 'moment.webp',
			mimeType: 'image/webp',
			buffer: Buffer.from('image-data'),
		})
		await expect.poll(() => capture.mediaUploads).toBe(1)
		expect(capture.mediaUploadBodies[0]).toContain('moment')
		await page.getByRole('button', { name: '复制链接' }).first().click()
		await expect(page.getByRole('button', { name: '已复制' })).toBeVisible()
		await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('https://media.example/sample.webp')
	})

	test('music can be created directly from an uploaded audio file', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/music')
		await page.locator('.admin-task-header button').filter({ hasText: '从媒体库添加' }).click()
		const picker = page.getByRole('dialog')
		await picker.getByRole('button', { name: /sample\.mp3/u }).click()
		await expect(page.getByLabel('歌曲名', { exact: true })).toHaveValue('sample')
		await expect(page.locator('.music-enable-toggle input')).toBeChecked()
		await page.getByRole('button', { name: '保存歌单' }).click()
		await expect.poll(() => capture.musicWrites.length).toBe(1)
		expect(capture.musicWrites[0]).toMatchObject({ playlist: { tracks: [expect.objectContaining({ title: 'sample', enabled: true, audioUrl: 'https://flyovo.cc.cd/media/music/sample.mp3' })] } })
	})

	test('AI news uses on-demand forms, human labels, and simple deletion confirmation', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/ai-news')
		await expect(page.getByLabel('标题')).toHaveCount(0)
		await expect(page.locator('.admin-news-inbox-item').filter({ hasText: 'AI HOT 站内阅读测试' })).toBeVisible()
		await page.getByRole('tab', { name: /手动精选/u }).click()
		await page.getByLabel('标题').fill('人工精选')
		await page.getByLabel('原文链接').fill('https://example.com/pick')
		await page.getByRole('button', { name: '添加到内容列表' }).click()
		await expect.poll(() => capture.newsWrites.length).toBe(1)
		await page.getByPlaceholder('搜索标题、摘要或分类').fill('外部精选')
		await page.getByRole('button', { name: /删除 外部精选测试/u }).click()
		const dialog = page.getByRole('dialog')
		await expect(dialog.getByRole('textbox')).toHaveCount(0)
		await dialog.getByRole('button', { name: '删除条目' }).click()
	})

	test('merge confirmation is explicit without requiring a memorized command', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/reviews')
		await page.getByRole('button').filter({ hasText: 'categories.json' }).click()
		await page.getByRole('button', { name: '确认上线' }).click()
		const dialog = page.getByRole('dialog')
		await expect(dialog.getByRole('textbox')).toHaveCount(0)
		await dialog.getByRole('button', { name: '确认上线' }).click()
		await expect.poll(() => capture.mergeCount).toBe(1)
	})

	test('review detail speaks in publishing language rather than raw provider states', async ({ page }) => {
		await mockAuthenticatedAdmin(page)
		await page.goto('/admin/reviews')
		await page.getByRole('button').filter({ hasText: 'categories.json' }).click()
		await expect(page.getByText('自动检查', { exact: true })).toBeVisible()
		await expect(page.getByText('预览站点', { exact: true })).toBeVisible()
		await expect(page.getByText('类型、测试和构建检查已通过。')).toBeVisible()
		await expect(page.getByText('success', { exact: true })).toHaveCount(0)
	})
})

test('cycle 5 quick start remains usable as a mobile bottom sheet', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile quick-start coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	await page.goto('/admin')
	const dock = page.getByRole('navigation', { name: '常用后台操作' })
	await expect(dock).toBeVisible()
	await expect(dock.getByRole('link', { name: '写文章' })).toBeVisible()
	await dock.getByRole('button', { name: '打开更多操作' }).click()
	const palette = page.getByRole('dialog', { name: '快速开始' })
	await expect(palette).toBeVisible()
	await expect(palette.getByPlaceholder('搜索要做的事')).toBeFocused()
	const dimensions = await page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		clientWidth: document.documentElement.clientWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
})
