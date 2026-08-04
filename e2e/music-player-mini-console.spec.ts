import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

async function mockPublicMusic(page: Page) {
	await page.addInitScript(() => {
		localStorage.setItem('fly-living-music-state-v1', JSON.stringify({
			trackId: 'console-a',
			progress: 12,
			volume: 0.7,
			muted: false,
			mode: 'sequence',
			expanded: false,
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
			requestId: 'mini-console-e2e',
			data: {
				enabled: true,
				title: '随心听',
				description: 'mini console playlist',
				tracks: [
					{ id: 'console-a', title: '半岛铁盒', artist: '周杰伦', audioUrl: 'https://media.example.com/console-a.wav', coverUrl: null, duration: 120, enabled: true, order: 0 },
					{ id: 'console-b', title: 'The Rain', artist: '久石让', audioUrl: 'https://media.example.com/console-b.wav', coverUrl: null, duration: 120, enabled: true, order: 1 },
				],
			},
		}),
	}))
}

test.describe('随心听迷你控制台', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(isMobile, '桌面几何回归只在桌面项目运行。')
	})

	test('默认紧凑并在展开后提供完整控制', async ({ page }) => {
		await mockPublicMusic(page)
		await page.goto('/2026/welcome', { waitUntil: 'domcontentloaded' })

		const player = page.getByRole('region', { name: '随心听播放器' })
		await expect(player).toBeVisible()
		await expect(player.getByText('半岛铁盒')).toBeVisible()
		await expect(player.getByText('周杰伦')).toBeVisible()
		await expect(player.getByRole('button', { name: '上一首' })).toBeVisible()
		await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible()
		await expect(player.getByRole('button', { name: '下一首' })).toBeVisible()
		await expect(player.getByRole('slider', { name: '播放进度' })).toBeVisible()
		await expect(player.getByRole('slider', { name: '音量' })).toHaveCount(0)

		const collapsed = await player.evaluate((element) => {
			const rect = element.getBoundingClientRect()
			return { width: rect.width, height: rect.height }
		})
		expect(collapsed.width).toBeLessThanOrEqual(340)
		expect(collapsed.height).toBeLessThanOrEqual(66)

		const detailsToggle = player.getByRole('button', { name: '展开播放器详情' })
		await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false')
		await detailsToggle.click()
		await expect(player.getByRole('button', { name: '收起播放器详情' })).toHaveAttribute('aria-expanded', 'true')
		await expect(player.getByRole('slider', { name: '音量' })).toBeVisible()
		await expect(player.getByText('70%')).toBeVisible()
		await expect(player.getByRole('button', { name: '切换为随机播放' })).toBeVisible()

		const expandedHeight = await player.evaluate(element => element.getBoundingClientRect().height)
		expect(expandedHeight).toBeGreaterThan(collapsed.height)
		expect(expandedHeight).toBeLessThan(180)

		await player.getByRole('button', { name: '播放', exact: true }).click()
		await expect(player.getByRole('button', { name: '暂停' })).toBeVisible()
		await expect(player).toHaveClass(/is-playing/)
		await player.getByRole('button', { name: '下一首' }).click()
		await expect(player.getByText('The Rain')).toBeVisible()

		await player.getByRole('button', { name: '收起播放器详情' }).click()
		await expect(player.getByRole('slider', { name: '音量' })).toHaveCount(0)
		const collapsedAgain = await player.evaluate(element => element.getBoundingClientRect().height)
		expect(collapsedAgain).toBeLessThanOrEqual(66)
	})
})
