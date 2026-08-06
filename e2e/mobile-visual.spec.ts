import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
	maskDynamicMobileRegions,
	prepareStableMobilePage,
} from './fixtures/mobile-quality'

const visualStylePath = fileURLToPath(new URL('./fixtures/mobile-visual.css', import.meta.url))

const visualCases = [
	{ name: 'home-320', route: '/', width: 320, height: 700 },
	{ name: 'article-320', route: '/2026/welcome', width: 320, height: 700 },
	{ name: 'about-320', route: '/me', width: 320, height: 700 },
	{ name: 'ai-news-320', route: '/ai.news', width: 320, height: 700 },
	{ name: 'comments-320', route: '/comments', width: 320, height: 700 },
	{ name: 'home-390', route: '/', width: 390, height: 844 },
	{ name: 'article-390', route: '/2026/welcome', width: 390, height: 844 },
	{ name: 'about-390', route: '/me', width: 390, height: 844 },
	{ name: 'ai-news-390', route: '/ai.news', width: 390, height: 844 },
	{ name: 'comments-390', route: '/comments', width: 390, height: 844 },
] as const

test.describe('@visual 移动视觉基线', () => {
	test.describe.configure({ timeout: 120_000 })

	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '移动视觉回归只在移动项目运行。')
		test.skip(process.platform !== 'linux', '截图基线固定由 Linux Chromium 生成和验证。')
	})

	for (const visualCase of visualCases) {
		test(`${visualCase.name} 保持稳定`, async ({ page }) => {
			await prepareStableMobilePage(page, { ...visualCase, visual: true })
			const mask = await maskDynamicMobileRegions(page)
			await expect(page).toHaveScreenshot(`${visualCase.name}.png`, {
				fullPage: false,
				mask,
				maskColor: '#dce8f8',
				stylePath: visualStylePath,
				timeout: 30_000,
			})
		})
	}
})
