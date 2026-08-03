import { expect, test } from '@playwright/test'
import { mockAuthenticatedAdmin } from './fixtures/admin-api'

test.describe('cycle 3 desktop workflows', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'Cycle 3 desktop workflows run in the desktop project.')
	})

	test('searches a fixed weather city and creates a controlled PR', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/settings')
		await page.getByRole('button', { name: /天气/u }).click()
		await page.getByLabel('搜索城市').fill('杭州')
		await page.getByRole('button', { name: '搜索', exact: true }).click()
		await page.getByRole('button', { name: /杭州/u }).click()
		await expect(page.getByText('杭州 · 浙江 · 中国')).toBeVisible()
		await page.getByRole('button', { name: '创建配置 PR' }).click()
		await expect.poll(() => capture.configWrites.some(write => write.kind === 'weather')).toBe(true)
		const weatherWrite = capture.configWrites.find(write => write.kind === 'weather')
		expect(weatherWrite).toMatchObject({ content: { enabled: true, latitude: 30.2741, longitude: 120.1551, timezone: 'Asia/Shanghai' } })
	})

	test('edits a playlist, selects R2 audio, and saves a direct commit', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/music')
		await page.getByRole('button', { name: '添加歌曲' }).first().click()
		await page.getByLabel('标题').last().fill('Browser song')
		await page.getByRole('button', { name: '选择/上传音频' }).click()
		await page.getByRole('button', { name: /sample\.mp3/u }).click()
		await expect(page.getByLabel('音频 URL')).toHaveValue('https://flyovo.cc.cd/media/music/sample.mp3')
		await page.getByLabel('在公开播放器中启用').check()
		await page.getByRole('button', { name: '直接保存歌单' }).click()
		await expect.poll(() => capture.musicWrites.length).toBe(1)
		expect(capture.musicWrites[0]).toMatchObject({
			expectedSha: 'playlist-sha',
			playlist: { tracks: [{ title: 'Browser song', audioUrl: 'https://flyovo.cc.cd/media/music/sample.mp3', enabled: true, order: 0 }] },
		})
		await expect(page.getByText(/歌单提交成功/u)).toBeVisible()
	})

	test('normalizes module order and creates a modules PR', async ({ page }) => {
		const capture = await mockAuthenticatedAdmin(page)
		await page.goto('/admin/modules')
		const weatherCard = page.locator('.module-card').filter({ hasText: '城市天气' })
		await weatherCard.getByRole('checkbox').check()
		await weatherCard.getByRole('button', { name: '上移模块' }).click()
		await page.getByRole('button', { name: '创建模块 PR' }).click()
		await expect.poll(() => capture.configWrites.some(write => write.kind === 'modules')).toBe(true)
		const modules = capture.configWrites.find(write => write.kind === 'modules')?.content as Array<{ order: number }>
		expect(modules.map(module => module.order)).toEqual(modules.map((_, index) => index))
	})
})

test('cycle 3 admin pages remain usable on mobile', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile coverage runs in the mobile project.')
	await mockAuthenticatedAdmin(page)
	for (const path of ['/admin/music', '/admin/modules', '/admin/settings']) {
		await page.goto(path)
		await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll')
		const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
		expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
	}
})
