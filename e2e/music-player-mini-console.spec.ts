import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { mockSilentMedia } from './fixtures/silent-media'

async function mockPublicMusic(page: Page) {
	await mockSilentMedia(page)
	await page.addInitScript(() => {
		Object.defineProperty(window, '__desktopMediaLoadCount', { configurable: true, writable: true, value: 0 })
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
			Object.assign(window, {
				__desktopMediaLoadCount: Number((window as unknown as { __desktopMediaLoadCount?: number }).__desktopMediaLoadCount || 0) + 1,
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

	test('桌面首次隐藏，按需打开，并通过竖向滑杆调节音量', async ({ page }) => {
		await mockPublicMusic(page)
		await page.goto('/2026/welcome', { waitUntil: 'domcontentloaded' })

		const player = page.getByRole('region', { name: '随心听播放器' })
		const launcher = page.getByRole('button', { name: '打开音乐播放器' })
		await expect(launcher).toBeVisible()
		await expect(launcher).toHaveAttribute('aria-expanded', 'false')
		await expect(player).toBeHidden()
		expect(await page.evaluate(() => Number((window as unknown as { __desktopMediaLoadCount?: number }).__desktopMediaLoadCount || 0))).toBe(0)

		await launcher.click()
		await expect(player).toBeVisible()
		await expect(page.getByRole('button', { name: '收起音乐播放器' })).toHaveAttribute('aria-expanded', 'true')
		await expect.poll(() => page.evaluate(() => Number((window as unknown as { __desktopMediaLoadCount?: number }).__desktopMediaLoadCount || 0))).toBe(1)
		await expect(player.getByText('半岛铁盒')).toBeVisible()
		await expect(player.getByText('周杰伦')).toBeVisible()
		await expect(player.getByRole('button', { name: '上一首' })).toBeVisible()
		await expect(player.getByRole('button', { name: '播放', exact: true })).toBeVisible()
		await expect(player.getByRole('button', { name: '下一首' })).toBeVisible()
		await expect(player.getByRole('slider', { name: '播放进度' })).toBeVisible()

		const collapsed = await player.evaluate((element) => {
			const rect = element.getBoundingClientRect()
			return { width: rect.width, height: rect.height }
		})
		expect(collapsed.width).toBeLessThanOrEqual(340)
		expect(collapsed.height).toBeLessThanOrEqual(70)
		const panelBox = await page.locator('#blog-panel').boundingBox()
		const playerBox = await player.boundingBox()
		expect(playerBox).not.toBeNull()
		expect(panelBox).not.toBeNull()
		expect((playerBox?.x ?? 0) + (playerBox?.width ?? 0)).toBeLessThanOrEqual((panelBox?.x ?? 0) - 12)

		const volumeToggle = player.getByRole('button', { name: '调节音量' })
		await expect(volumeToggle).toHaveAttribute('aria-expanded', 'false')
		await expect(player.getByRole('slider', { name: '音量' })).toHaveCount(0)
		await volumeToggle.click()
		await expect(volumeToggle).toHaveAttribute('aria-expanded', 'true')
		const volume = player.getByRole('slider', { name: '音量' })
		await expect(volume).toBeVisible()
		await expect(volume).toHaveAttribute('aria-orientation', 'vertical')
		const volumeBox = await volume.boundingBox()
		expect(volumeBox?.height).toBeGreaterThan((volumeBox?.width ?? 0) * 2)
		await expect(player.getByText('70%')).toBeVisible()
		await volume.evaluate((element) => {
			const input = element as HTMLInputElement
			input.value = '0.4'
			input.dispatchEvent(new Event('input', { bubbles: true }))
		})
		await expect(player.getByText('40%')).toBeVisible()
		await volumeToggle.click()
		await expect(player.getByRole('slider', { name: '音量' })).toHaveCount(0)

		const detailsToggle = player.getByRole('button', { name: '展开播放器详情' })
		await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false')
		await detailsToggle.click()
		await expect(player.getByRole('button', { name: '收起播放器详情' })).toHaveAttribute('aria-expanded', 'true')
		await expect(player.getByRole('button', { name: '切换为随机播放' })).toBeVisible()

		const expandedHeight = await player.evaluate(element => element.getBoundingClientRect().height)
		expect(expandedHeight).toBeGreaterThan(collapsed.height)
		expect(expandedHeight).toBeLessThan(145)

		await player.getByRole('button', { name: '播放', exact: true }).click()
		await expect(player.getByRole('button', { name: '暂停' })).toBeVisible()
		await expect(player).toHaveClass(/is-playing/)
		await player.getByRole('button', { name: '下一首' }).click()
		await expect(player.getByText('The Rain')).toBeVisible()

		await page.getByRole('button', { name: '收起音乐播放器' }).click()
		await expect(player).toBeHidden()
		await expect(page.getByRole('button', { name: '打开音乐播放器' })).toHaveAttribute('aria-expanded', 'false')
	})
})
