import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockSilentMedia } from './fixtures/silent-media'

async function mockPublicMusic(page: Page) {
	await mockSilentMedia(page)
	await page.addInitScript(() => {
		Object.defineProperty(window, '__mobileMediaLoadCount', { configurable: true, writable: true, value: 0 })
		localStorage.setItem('fly-living-music-state-v1', JSON.stringify({
			trackId: 'mobile-a',
			progress: 12,
			volume: 0.7,
			muted: false,
			mode: 'sequence',
			expanded: true,
		}))
		Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 120 })
		HTMLMediaElement.prototype.load = function load() {
			Object.assign(window, {
				__mobileMediaLoadCount: Number((window as unknown as { __mobileMediaLoadCount?: number }).__mobileMediaLoadCount || 0) + 1,
			})
			setTimeout(() => {
				this.dispatchEvent(new Event('loadedmetadata'))
				this.dispatchEvent(new Event('canplay'))
			}, 0)
		}
		HTMLMediaElement.prototype.play = async function play() {
			this.dispatchEvent(new Event('play'))
		}
		HTMLMediaElement.prototype.pause = function pause() {
			this.dispatchEvent(new Event('pause'))
		}
	})
	await page.route('**/api/music/playlist', route => route.fulfill({
		contentType: 'application/json',
		body: JSON.stringify({
			ok: true,
			requestId: 'mobile-music-performance',
			data: {
				enabled: true,
				title: '随心听',
				description: 'mobile performance playlist',
				tracks: [
					{ id: 'mobile-a', title: 'Mobile Song A', artist: 'fly', audioUrl: 'https://media.example.com/mobile-a.wav', coverUrl: null, duration: 120, enabled: true, order: 0 },
					{ id: 'mobile-b', title: 'Mobile Song B', artist: 'fly', audioUrl: 'https://media.example.com/mobile-b.wav', coverUrl: null, duration: 120, enabled: true, order: 1 },
				],
			},
		}),
	}))
}

test.describe('移动端播放器与性能基线', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '移动端性能回归只在移动项目运行。')
	})

	test('首次进入保持隐藏并通过共享浮动面板按需展开', async ({ page }) => {
		await mockPublicMusic(page)
		await page.goto('/2026/welcome', { waitUntil: 'domcontentloaded' })

		const player = page.getByRole('region', { name: '随心听播放器' })
		const launcher = page.getByRole('button', { name: '打开音乐播放器' })
		await expect(launcher).toBeVisible()
		await expect(launcher).toHaveAttribute('aria-expanded', 'false')
		await expect(player).toBeHidden()
		expect(await page.evaluate(() => Number((window as unknown as { __mobileMediaLoadCount?: number }).__mobileMediaLoadCount || 0))).toBe(0)

		await launcher.click()
		await expect(player).toBeVisible()
		await expect.poll(() => page.evaluate(() => Number((window as unknown as { __mobileMediaLoadCount?: number }).__mobileMediaLoadCount || 0))).toBe(1)
		await expect(page.getByRole('button', { name: '收起音乐播放器' })).toHaveAttribute('aria-expanded', 'true')
		await expect(player.locator('.music-player-details')).toHaveCount(0)
		const playerHeight = await player.evaluate(element => element.getBoundingClientRect().height)
		expect(playerHeight).toBeLessThan(80)
		const playerBox = await player.boundingBox()
		const panelBox = await page.locator('#blog-panel').boundingBox()
		expect(playerBox).not.toBeNull()
		expect(panelBox).not.toBeNull()
		expect((panelBox?.y ?? 0) + (panelBox?.height ?? 0)).toBeLessThanOrEqual((playerBox?.y ?? 0) - 12)
		const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
		expect(overflowX).toBe(false)
		for (const name of ['上一首', '播放', '下一首']) {
			const target = player.getByRole('button', { name, exact: true })
			const box = await target.boundingBox()
			expect(box?.width).toBeGreaterThanOrEqual(44)
			expect(box?.height).toBeGreaterThanOrEqual(44)
		}
		const volumeToggle = player.getByRole('button', { name: '调节音量' })
		await expect(volumeToggle).toBeVisible()
		await volumeToggle.click()
		const volume = player.getByRole('slider', { name: '音量' })
		await expect(volume).toBeVisible()
		await expect(volume).toHaveAttribute('aria-orientation', 'vertical')
		const volumeBox = await volume.boundingBox()
		expect(volumeBox?.height).toBeGreaterThan((volumeBox?.width ?? 0) * 2)
		await volumeToggle.click()
		await expect(volume).toHaveCount(0)
		await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible()
		await player.getByRole('button', { name: '播放', exact: true }).click()
		await expect(player.getByRole('button', { name: '暂停' })).toBeVisible()
		await player.getByRole('button', { name: '下一首' }).click()
		await expect(player.getByText('Mobile Song B')).toBeVisible()

		await page.getByRole('button', { name: '收起音乐播放器' }).click()
		await expect(player).toBeHidden()
	})

	test('移动端不运行持续氛围动画且触摸不会生成鼠标粒子', async ({ page }) => {
		await mockPublicMusic(page)
		await page.goto('/ai.news', { waitUntil: 'domcontentloaded' })

		const atmosphereAnimations = await page.evaluate(() => document.getAnimations().filter((animation) => {
			const target = animation.effect?.target
			return target instanceof Element && Boolean(target.closest('.blog-atmosphere')) && animation.playState === 'running'
		}).length)
		expect(atmosphereAnimations).toBe(0)

		for (let index = 0; index < 10; index++)
			await page.touchscreen.tap(190, 300)
		await page.waitForTimeout(80)
		await expect(page.locator('.storyboard-layer > *')).toHaveCount(0)
	})
})
