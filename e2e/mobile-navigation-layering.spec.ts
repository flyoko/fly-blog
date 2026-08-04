import { expect, test } from '@playwright/test'

async function waitForDrawer(page: import('@playwright/test').Page, selector: string) {
	const drawer = page.locator(selector)
	await expect(drawer).toHaveClass(/show/)
	await expect(drawer).toHaveCSS('transform', 'none')
	return drawer
}

async function readOverlayLayers(page: import('@playwright/test').Page, options: {
	drawerSelector: string
	maskSelector: string
	probeSelector: string
}) {
	return page.evaluate(({ drawerSelector, maskSelector, probeSelector }) => {
		const drawer = document.querySelector<HTMLElement>(drawerSelector)
		const mask = document.querySelector<HTMLElement>(maskSelector)
		const content = document.querySelector<HTMLElement>('#content')
		const player = document.querySelector<HTMLElement>('.music-player')
		const panel = document.querySelector<HTMLElement>('#blog-panel')
		const probe = document.querySelector<HTMLElement>(probeSelector)
		if (!drawer || !mask || !content || !probe)
			throw new Error('移动端抽屉结构不完整')

		const probeRect = probe.getBoundingClientRect()
		const topElement = document.elementFromPoint(
			probeRect.left + probeRect.width / 2,
			probeRect.top + probeRect.height / 2,
		)
		const zIndex = (element: HTMLElement | null) => Number.parseInt(element ? getComputedStyle(element).zIndex : '-1', 10)

		return {
			drawer: zIndex(drawer),
			mask: zIndex(mask),
			content: zIndex(content),
			player: zIndex(player),
			panel: zIndex(panel),
			probeOwnsPoint: Boolean(topElement?.closest(drawerSelector)),
		}
	}, options)
}

test.describe('移动端抽屉层级与关闭行为', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '移动端抽屉回归只在移动项目运行。')
	})

	test('主菜单完整覆盖正文、播放器和浮动面板', async ({ page }) => {
		await page.goto('/2026/welcome')
		const toggle = page.getByRole('button', { name: '切换菜单' })
		await toggle.click()
		await waitForDrawer(page, '#blog-sidebar')
		await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

		const layers = await readOverlayLayers(page, {
			drawerSelector: '#blog-sidebar',
			maskSelector: '.sidebar-mask',
			probeSelector: '#blog-sidebar .sidebar-header',
		})

		expect(layers.drawer).toBeGreaterThan(layers.mask)
		expect(layers.mask).toBeGreaterThan(layers.content)
		expect(layers.mask).toBeGreaterThan(layers.player)
		expect(layers.mask).toBeGreaterThan(layers.panel)
		expect(layers.probeOwnsPoint).toBe(true)

		const viewport = page.viewportSize()
		if (!viewport)
			throw new Error('移动端视口不可用')
		await page.mouse.click(viewport.width - 8, 96)
		await expect(page.locator('#blog-sidebar')).not.toHaveClass(/show/)
		await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
		await expect(toggle).toBeFocused()
	})

	test('右侧补充信息抽屉使用同一套安全层级', async ({ page }) => {
		await page.goto('/2026/welcome')
		const toggle = page.getByRole('button', { name: '切换侧边栏' })
		await expect(toggle).toBeVisible()
		await toggle.click()
		await waitForDrawer(page, '#blog-aside')

		const layers = await readOverlayLayers(page, {
			drawerSelector: '#blog-aside',
			maskSelector: '.aside-mask',
			probeSelector: '#blog-aside .blog-widget',
		})

		expect(layers.drawer).toBeGreaterThan(layers.mask)
		expect(layers.mask).toBeGreaterThan(layers.content)
		expect(layers.mask).toBeGreaterThan(layers.player)
		expect(layers.mask).toBeGreaterThan(layers.panel)
		expect(layers.probeOwnsPoint).toBe(true)

		await page.mouse.click(8, 96)
		await expect(page.locator('#blog-aside')).not.toHaveClass(/show/)
		await expect(toggle).toBeFocused()
	})
})
