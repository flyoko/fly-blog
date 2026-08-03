import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockAuthenticatedAdmin } from './fixtures/admin-api'

async function mockPublicWeatherAndMusic(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 120 })
		HTMLMediaElement.prototype.load = function load() {
			queueMicrotask(() => {
				this.dispatchEvent(new Event('loadedmetadata'))
				this.dispatchEvent(new Event('canplay'))
			})
		}
		HTMLMediaElement.prototype.play = async function play() {
			this.dispatchEvent(new Event('play'))
			this.currentTime += 1
			this.dispatchEvent(new Event('timeupdate'))
		}
		HTMLMediaElement.prototype.pause = function pause() {
			this.dispatchEvent(new Event('pause'))
		}
	})
	await page.route('**/api/weather', route => route.fulfill({
		contentType: 'application/json',
		body: JSON.stringify({
			ok: true,
			requestId: 'weather-e2e',
			data: {
				available: true,
				city: '杭州 · 浙江 · 中国',
				timezone: 'Asia/Shanghai',
				temperature: 29.4,
				weatherCode: 1,
				condition: '少云',
				icon: 'tabler:cloud-sun',
				isDay: true,
				high: 34,
				low: 25,
				windSpeed: 8.2,
				precipitationProbability: 20,
				tip: '适合安排一次轻松的户外活动。',
				observedAt: '2026-08-03T20:00',
				fetchedAt: '2026-08-03T12:00:00.000Z',
				stale: false,
				sourceName: 'Open-Meteo',
				sourceUrl: 'https://open-meteo.com/',
			},
		}),
	}))
	await page.route('**/api/music/playlist', route => route.fulfill({
		contentType: 'application/json',
		body: JSON.stringify({
			ok: true,
			requestId: 'music-e2e',
			data: {
				enabled: true,
				title: '随心听',
				description: 'E2E playlist',
				tracks: [
					{ id: 'e2e-a', title: 'E2E Song A', artist: 'fly', audioUrl: 'https://media.example.com/e2e-a.wav', coverUrl: null, duration: 120, enabled: true, order: 0 },
					{ id: 'e2e-b', title: 'E2E Song B', artist: 'fly', audioUrl: 'https://media.example.com/e2e-b.wav', coverUrl: null, duration: 120, enabled: true, order: 1 },
				],
			},
		}),
	}))
}

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

	test('keeps weather and music usable while navigating between public pages', async ({ page }) => {
		await mockPublicWeatherAndMusic(page)
		await page.goto('/__e2e__', { waitUntil: 'domcontentloaded' })
		await expect(page.getByText('杭州 · 浙江 · 中国')).toBeVisible()
		await expect(page.getByRole('link', { name: 'Open-Meteo' })).toBeVisible()
		const player = page.getByRole('region', { name: '随心听播放器' })
		await expect(player).toBeVisible()
		await expect(player.getByText('E2E Song A')).toBeVisible()
		await player.getByRole('button', { name: '播放', exact: true }).click()
		await expect(player.getByRole('button', { name: '暂停' })).toBeVisible()
		await expect.poll(async () => Number(await player.getByLabel('播放进度').inputValue())).toBeGreaterThan(0)
		await player.getByRole('button', { name: '下一首' }).click()
		await expect(player.getByText('E2E Song B')).toBeVisible()
		await page.getByRole('link', { name: '自述', exact: true }).click()
		await expect(page).toHaveURL(/\/me$/u)
		const persistedPlayer = page.getByRole('region', { name: '随心听播放器' })
		await expect(persistedPlayer.getByRole('button', { name: '暂停' })).toBeVisible()
		await expect(persistedPlayer.getByText('E2E Song B')).toBeVisible()
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

test('cycle 3 public weather and player remain usable on mobile', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Mobile coverage runs in the mobile project.')
	await mockPublicWeatherAndMusic(page)
	await page.goto('/__e2e__', { waitUntil: 'domcontentloaded' })
	await expect(page.getByText('杭州 · 浙江 · 中国')).toBeVisible()
	await expect(page.getByRole('region', { name: '随心听播放器' })).toBeVisible()
	const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
})
