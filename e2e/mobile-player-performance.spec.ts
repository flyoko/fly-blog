import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

async function mockPublicMusic(page: Page) {
	await page.addInitScript(() => {
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

		await launcher.click()
		await expect(player).toBeVisible()
		await expect(page.getByRole('button', { name: '收起音乐播放器' })).toHaveAttribute('aria-expanded', 'true')
		await expect(player.locator('.music-player-expanded')).toHaveCount(0)
		const playerHeight = await player.evaluate(element => element.getBoundingClientRect().height)
		expect(playerHeight).toBeLessThan(190)
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
