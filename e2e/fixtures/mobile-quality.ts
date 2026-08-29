import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface MobileRouteCase {
	name: string
	route: string
	width: 320 | 390
	height: number
}

interface StableMobilePageOptions {
	route: string
	width: number
	height: number
	visual?: boolean
}

const FIXED_NOW = '2026-08-06T04:00:00+08:00'
const stableMediaSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eaf2ff" />
      <stop offset="1" stop-color="#d8e7ff" />
    </linearGradient>
  </defs>
  <rect width="1200" height="675" rx="48" fill="url(#background)" />
  <path d="M80 510C250 330 410 570 585 375C760 180 925 420 1120 220" fill="none" stroke="#8fb5ef" stroke-width="24" stroke-linecap="round" opacity=".58" />
  <circle cx="965" cy="145" r="62" fill="#b8d2f8" />
</svg>`

const stableTwikooScript = `
window.twikoo = {
  init(options) {
    const root = document.querySelector(options.el)
    if (!root)
      return
    root.innerHTML = \`
      <div class="tk-submit" aria-label="稳定评论占位">
        <div class="tk-row">
          <div class="tk-col">
            <div class="tk-input">
              <textarea class="el-textarea__inner" aria-label="评论内容"></textarea>
            </div>
            <div class="tk-meta-input">
              <div class="el-input-group"><input class="el-input__inner" name="nick" aria-label="昵称"></div>
              <div class="el-input-group"><input class="el-input__inner" name="mail" aria-label="邮箱"></div>
              <div class="el-input-group"><input class="el-input__inner" name="link" aria-label="网址"></div>
            </div>
          </div>
        </div>
        <div class="tk-row actions">
          <button class="el-button" type="button">预览</button>
          <button class="el-button tk-send" type="button">发送</button>
        </div>
      </div>
    \`
  },
}
`

const stableNewsPayload = {
	data: {
		items: [
			{
				id: 'visual-ai-hot-1',
				sourceId: 'visual-source',
				kind: 'hot',
				title: '端侧模型让日常工具更轻、更快',
				summary: '本地推理继续改善响应速度与隐私体验，开发者开始把更多能力放回设备。',
				url: 'https://example.com/visual-ai-hot-1',
				originalUrl: 'https://example.com/visual-ai-hot-1',
				category: 'AI 产品',
				rank: 1,
				publishedAt: '2026-08-06T01:00:00.000Z',
				fetchedAt: '2026-08-06T02:00:00.000Z',
				selected: true,
				readerPath: null,
				contentMode: 'summary',
				coverImage: null,
			},
			{
				id: 'visual-rss-1',
				sourceId: 'visual-rss',
				kind: 'rss',
				title: '浏览器平台继续完善移动端交互能力',
				summary: '新的平台能力聚焦更稳定的视口、输入和无障碍体验。',
				url: 'https://example.com/visual-rss-1',
				originalUrl: 'https://example.com/visual-rss-1',
				category: 'Web 开发',
				rank: null,
				publishedAt: '2026-08-05T23:00:00.000Z',
				fetchedAt: '2026-08-06T02:00:00.000Z',
				selected: false,
				readerPath: null,
				contentMode: 'summary',
				coverImage: null,
			},
		],
		total: 2,
		briefing: {
			date: '2026-08-06',
			title: '今日 AI 与 Web 简报',
			lead: '端侧能力与移动体验继续成为产品演进重点。',
			content_json: JSON.stringify([
				{
					label: '产品与平台',
					items: [
						{
							title: '端侧模型让日常工具更轻、更快',
							summary: '更多能力正在回到设备本地。',
							links: { original: 'https://example.com/visual-ai-hot-1' },
						},
					],
				},
			]),
			source_url: 'https://example.com/visual-briefing',
			generated_at: '2026-08-06T02:00:00.000Z',
		},
		sources: [
			{
				source_id: 'visual-source',
				status: 'success',
				item_count: 2,
				last_success_at: '2026-08-06T02:00:00.000Z',
				last_error: null,
				next_sync_at: '2026-08-06T03:00:00.000Z',
			},
		],
	},
}

async function waitForLoadedImage(locator: Locator) {
	await locator.waitFor({ state: 'attached', timeout: 10_000 })
	await locator.evaluate((element) => {
		if (element instanceof HTMLImageElement) {
			element.loading = 'eager'
			element.fetchPriority = 'high'
		}
	})
	await expect.poll(async () => locator.evaluate((element) => {
		return element instanceof HTMLImageElement
			&& element.complete
			&& element.naturalWidth > 0
	}), { timeout: 10_000 }).toBe(true)
}

const stableHomeArticlePaths = [
	'/2026/article-20260812-030125-fa491d82',
	'/2026/boss-helper-job-applications',
	'/2026/welcome',
] as const

async function stabilizeHomeArticleCards(page: Page) {
	await page.locator('.post-list .proper-height').evaluate((list, stablePaths) => {
		const cards = Array.from(list.querySelectorAll<HTMLAnchorElement>('.article-card'))
		const cardsByPath = new Map(cards.map(card => [new URL(card.href).pathname.replace(/\/$/u, ''), card]))
		const stableCards = stablePaths.map(path => cardsByPath.get(path))
		if (stableCards.some(card => !card))
			throw new Error('移动视觉基线所需的固定文章不存在。')
		list.replaceChildren(...stableCards as HTMLAnchorElement[])
	}, stableHomeArticlePaths)
}

async function waitForStableMainContent(page: Page) {
	let previousSignature = ''
	let stableSamples = 0
	for (let index = 0; index < 24; index++) {
		const signature = await page.locator('#main-content').evaluate((element) => {
			const images = Array.from(element.querySelectorAll('img')).map(image => [
				image.currentSrc || image.src,
				image.complete,
				image.naturalWidth,
				Math.round(image.getBoundingClientRect().height),
			])
			return JSON.stringify({
				height: element.scrollHeight,
				images,
				nodes: element.querySelectorAll('*').length,
				textLength: element.textContent?.length ?? 0,
			})
		})
		if (signature === previousSignature)
			stableSamples += 1
		else
			stableSamples = 0
		if (stableSamples >= 6)
			return
		previousSignature = signature
		await page.waitForTimeout(150)
	}
	throw new Error('主内容在视觉截图前未进入稳定状态。')
}

async function waitForNuxtHydrated(page: Page) {
	await page.waitForFunction(() => {
		const nuxtWindow = window as typeof window & {
			useNuxtApp?: () => { isHydrating?: boolean }
		}
		if (typeof nuxtWindow.useNuxtApp !== 'function')
			return false
		try {
			return nuxtWindow.useNuxtApp().isHydrating === false
		}
		catch {
			return false
		}
	}, undefined, { timeout: 30_000 })
}

async function configureHydratedMobilePage(page: Page, options: StableMobilePageOptions) {
	await page.setViewportSize({ width: options.width, height: options.height })
	await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
	await page.clock.setFixedTime(new Date(FIXED_NOW))
	await page.addInitScript(() => {
		localStorage.setItem('nuxt-color-mode', 'light')
		localStorage.setItem('color-mode', 'light')
	})
	await page.route('https://cdnjs.snrat.com/ajax/libs/twikoo/**', async route => route.fulfill({
		body: stableTwikooScript,
		contentType: 'application/javascript',
		status: 200,
	}))
}

async function navigateHydratedMobilePage(page: Page, route: string) {
	await page.goto(route, { waitUntil: 'commit', timeout: 15_000 })
	if (route === '/ai.news') {
		const mainContentReady = await page.locator('#main-content')
			.waitFor({ state: 'attached', timeout: 2_000 })
			.then(() => true)
			.catch(() => false)
		if (!mainContentReady)
			await page.goto('/ai.news/index/', { waitUntil: 'commit', timeout: 15_000 })
	}
	await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 })
}

export async function prepareHydratedMobilePage(page: Page, options: StableMobilePageOptions) {
	await configureHydratedMobilePage(page, options)
	await navigateHydratedMobilePage(page, options.route)
	await waitForNuxtHydrated(page)
}

export async function waitForNuxtInteractive(page: Page, route = new URL(page.url()).pathname) {
	await expect(page.locator('#main-content')).toBeVisible({ timeout: 15_000 })
	await waitForNuxtHydrated(page)

	if (route === '/')
		await waitForLoadedImage(page.locator('.article-card .article-cover').first())
	else if (route === '/me')
		await waitForLoadedImage(page.locator('#about-story img').first())
	await page.evaluate(async () => {
		await document.fonts?.ready
		const images = Array.from(document.images)
		for (const image of images) {
			image.loading = 'eager'
			image.fetchPriority = 'high'
		}
		await Promise.race([
			Promise.all(images.map(image => image.complete
				? Promise.resolve()
				: new Promise<void>((resolve) => {
						image.addEventListener('load', () => resolve(), { once: true })
						image.addEventListener('error', () => resolve(), { once: true })
					}))),
			new Promise(resolve => setTimeout(resolve, 2_000)),
		])
		await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
	})
	await waitForStableMainContent(page)
}

export async function prepareStableMobilePage(page: Page, options: StableMobilePageOptions) {
	await configureHydratedMobilePage(page, options)
	if (options.visual) {
		await page.route(/\.(?:woff2?|ttf|otf)(?:\?.*)?$/i, async route => route.abort())
	}

	await page.route('**/media/**', async route => route.fulfill({
		body: stableMediaSvg,
		contentType: 'image/svg+xml',
		status: 200,
	}))

	if (options.route.startsWith('/ai.news')) {
		await page.route('**/api/news**', async route => route.fulfill({
			body: JSON.stringify(stableNewsPayload),
			contentType: 'application/json',
			status: 200,
		}))
	}

	await navigateHydratedMobilePage(page, options.route)
	await waitForNuxtInteractive(page, options.route)

	if (options.visual) {
		if (options.route === '/')
			await stabilizeHomeArticleCards(page)

		const pauseAutoplay = page.getByRole('button', { name: '暂停自动轮播' })
		if (await pauseAutoplay.isVisible().catch(() => false))
			await pauseAutoplay.click()
		await waitForStableMainContent(page)
	}
}

export async function maskDynamicMobileRegions(page: Page): Promise<Locator[]> {
	const selectors = [
		'.home-ad-carousel-image',
		'.news-sync',
		'.news-digest',
		'.weather-card',
	]
	const locators: Locator[] = []
	for (const selector of selectors) {
		const locator = page.locator(selector)
		if (await locator.count())
			locators.push(locator)
	}
	return locators
}
