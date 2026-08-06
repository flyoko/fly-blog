import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { prepareHydratedMobilePage } from './fixtures/mobile-quality'

const MOBILE_WIDTHS = [320, 375, 390, 430] as const
const CORE_ROUTES = ['/', '/2026/welcome', '/me', '/ai.news', '/comments'] as const
const MIN_TOUCH_TARGET_PX = 43.5

async function getOverflowDiagnostics(page: Page) {
	return page.evaluate(() => {
		function selectorFor(element: Element) {
			const parts: string[] = []
			let current: Element | null = element
			while (current && parts.length < 4) {
				let part = current.tagName.toLowerCase()
				if (current.id) {
					part += `#${current.id}`
					parts.unshift(part)
					break
				}
				const classes = Array.from(current.classList).slice(0, 3)
				if (classes.length)
					part += `.${classes.join('.')}`
				parts.unshift(part)
				current = current.parentElement
			}
			return parts.join(' > ')
		}

		const viewportWidth = document.documentElement.clientWidth
		const candidates = Array.from(document.querySelectorAll<HTMLElement>('body *'))
			.map((element) => {
				const rect = element.getBoundingClientRect()
				const style = getComputedStyle(element)
				return {
					selector: selectorFor(element),
					left: Math.round(rect.left * 10) / 10,
					right: Math.round(rect.right * 10) / 10,
					width: Math.round(rect.width * 10) / 10,
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
					overflowX: style.overflowX,
				}
			})
			.filter(candidate => candidate.width > 0 && (
				candidate.right > viewportWidth + 1
				|| candidate.left < -1
				|| candidate.scrollWidth > candidate.clientWidth + 1
			))
			.sort((left, right) => {
				const leftOverflow = Math.max(left.right - viewportWidth, -left.left, left.scrollWidth - left.clientWidth)
				const rightOverflow = Math.max(right.right - viewportWidth, -right.left, right.scrollWidth - right.clientWidth)
				return rightOverflow - leftOverflow
			})
			.slice(0, 12)

		return {
			clientWidth: viewportWidth,
			documentScrollWidth: document.documentElement.scrollWidth,
			bodyScrollWidth: document.body.scrollWidth,
			bodyRectWidth: Math.round(document.body.getBoundingClientRect().width * 10) / 10,
			candidates,
		}
	})
}

async function assertNoPageOverflow(page: Page, route: string, width: number) {
	const pageErrors: string[] = []
	const onPageError = (error: Error) => pageErrors.push(error.message)
	page.on('pageerror', onPageError)

	try {
		await prepareHydratedMobilePage(page, { route, width, height: 844 })
		await page.waitForTimeout(100)

		const diagnostics = await getOverflowDiagnostics(page)
		const details = JSON.stringify(diagnostics, null, 2)
		expect(
			diagnostics.documentScrollWidth,
			`${route} 在 ${width}px 出现页面级横向溢出：\n${details}`,
		).toBeLessThanOrEqual(diagnostics.clientWidth + 1)
		expect(
			diagnostics.bodyScrollWidth,
			`${route} 在 ${width}px 的 body 被内容撑宽：\n${details}`,
		).toBeLessThanOrEqual(diagnostics.clientWidth + 1)
		expect(
			diagnostics.bodyRectWidth,
			`${route} 在 ${width}px 的 body 布局宽度异常：\n${details}`,
		).toBeLessThanOrEqual(diagnostics.clientWidth + 1)
		expect(pageErrors, `${route} 在 ${width}px 产生 pageerror`).toEqual([])
	}
	finally {
		page.off('pageerror', onPageError)
	}
}

async function expectTouchTarget(locator: Locator, name: string) {
	await expect(locator, `${name} 应可见`).toBeVisible()
	await expect.poll(async () => locator.evaluate((element) => {
		if (!element.isConnected)
			return 0
		return element.getBoundingClientRect().width
	}).catch(() => 0), { message: `${name} 宽度不足约 44px` }).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
	await expect.poll(async () => locator.evaluate((element) => {
		if (!element.isConnected)
			return 0
		return element.getBoundingClientRect().height
	}).catch(() => 0), { message: `${name} 高度不足约 44px` }).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
}

test.describe('移动端整体体验基线', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '移动端整体体验回归只在移动项目运行。')
	})

	for (const width of MOBILE_WIDTHS) {
		for (const route of CORE_ROUTES) {
			test(`${route} 在 ${width}px 无页面级溢出和脚本错误`, async ({ page }) => {
				await assertNoPageOverflow(page, route, width)
			})
		}
	}

	test('320px 首页筛选、菜单、遮罩和搜索可操作', async ({ page }) => {
		await prepareHydratedMobilePage(page, { route: '/', width: 320, height: 700 })

		const category = page.locator('.order-toggle .dropdown-trigger').first()
		const direction = page.getByRole('button', { name: '切换为最早优先' })
		const order = page.locator('.sort-controls .dropdown-trigger')
		const menuToggle = page.getByRole('button', { name: '切换菜单' })
		await expectTouchTarget(category, '分类筛选')
		await expectTouchTarget(direction, '排序方向')
		await expectTouchTarget(order, '排序方式')
		await expectTouchTarget(menuToggle, '主菜单按钮')

		await menuToggle.click()
		const drawer = page.locator('#blog-sidebar')
		await expect(drawer).toHaveClass(/show/)
		await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')

		const drawerBox = await drawer.boundingBox()
		expect(drawerBox).not.toBeNull()
		expect(drawerBox?.width, '320px 视口应保留至少 44px 遮罩关闭区域').toBeLessThanOrEqual(276)

		await page.mouse.click(312, 96)
		await expect(drawer).not.toHaveClass(/show/)
		await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
		await expect(menuToggle).toBeFocused()

		await menuToggle.click()
		await expect(drawer).toHaveClass(/show/)
		const searchButton = page.getByRole('button', { name: '搜索站内内容' })
		await expect(searchButton).toBeVisible()
		await searchButton.click()
		const dialog = page.getByRole('dialog', { name: '站内搜索' })
		await expect(dialog).toBeVisible({ timeout: 15_000 })
		await expect(page.getByRole('searchbox', { name: '搜索文章标题、正文或页面' })).toBeFocused()
	})

	test('320px 补充信息抽屉保留遮罩关闭区域', async ({ page }) => {
		await prepareHydratedMobilePage(page, { route: '/2026/welcome', width: 320, height: 700 })

		const toggle = page.getByRole('button', { name: '切换侧边栏' })
		await expect(toggle, '补充信息按钮应在路由侧栏完成挂载后出现').toBeVisible({ timeout: 15_000 })
		await expectTouchTarget(toggle, '补充信息按钮')
		await expect.poll(async () => toggle.evaluate((element) => {
			const rect = element.getBoundingClientRect()
			const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
			return topElement === element || Boolean(topElement?.closest('button') === element)
		}), { timeout: 15_000, message: '补充信息按钮应位于可点击层级最上方' }).toBe(true)
		await toggle.click()

		const drawer = page.locator('#blog-aside')
		await expect(drawer).toHaveClass(/show/)
		await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
		const drawerBox = await drawer.boundingBox()
		expect(drawerBox).not.toBeNull()
		expect(drawerBox?.width, '320px 视口应保留至少 44px 遮罩关闭区域').toBeLessThanOrEqual(276)

		await page.mouse.click(8, 96)
		await expect(drawer).not.toHaveClass(/show/)
		await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
		await expect(toggle).toBeFocused()
	})

	test('浮动面板位于安全区内且主内容预留底部操作空间', async ({ page }) => {
		await prepareHydratedMobilePage(page, { route: '/2026/welcome', width: 390, height: 700 })

		const panel = page.locator('#blog-panel-shell')
		await expect(panel).toBeVisible()
		const panelBox = await panel.boundingBox()
		const viewport = page.viewportSize()
		expect(panelBox).not.toBeNull()
		expect(viewport).not.toBeNull()
		expect(panelBox?.x).toBeGreaterThanOrEqual(0)
		expect(panelBox?.y).toBeGreaterThanOrEqual(0)
		expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0)
		expect((panelBox?.y ?? 0) + (panelBox?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0)

		const mainPaddingBottom = await page.locator('#main-content').evaluate((element) => {
			return Number.parseFloat(getComputedStyle(element).paddingBottom)
		})
		expect(mainPaddingBottom, '主内容底部应为浮动操作和系统安全区预留空间').toBeGreaterThanOrEqual(72)
	})

	test('320px 评论区主要操作具备完整触控区域', async ({ page }) => {
		await prepareHydratedMobilePage(page, { route: '/2026/welcome', width: 320, height: 700 })

		const comment = page.locator('.z-comment')
		await expect(comment).toBeVisible()
		await expectTouchTarget(page.getByRole('button', { name: '评论隐私说明：无需登录，邮箱不会公开' }), '评论隐私说明')

		const actions = comment.locator('#twikoo .tk-row.actions')
		if (await actions.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await expectTouchTarget(comment.getByRole('button', { name: /^(?:Preview|预览)$/u }), '评论预览')
			await expectTouchTarget(comment.getByRole('button', { name: /^(?:Send|发送)$/u }), '评论发送')

			const inputFontSizes = await comment.locator('input[name="nick"], input[name="mail"], input[name="link"], textarea').evaluateAll((elements) => {
				return elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize))
			})
			expect(inputFontSizes.length).toBeGreaterThan(0)
			for (const fontSize of inputFontSizes)
				expect(fontSize, '移动端表单字体不能小于 16px，以避免 iOS 自动缩放').toBeGreaterThanOrEqual(16)
		}
		else {
			await expect(comment.locator('.comment-status')).toBeVisible()
			await expect(comment.locator('.comment-status')).toContainText(/正在连接评论服务|评论区暂时没有加载成功/u)
		}
	})

	test('搜索在 320×568 动态视口下可输入、滚动并关闭', async ({ page }) => {
		await prepareHydratedMobilePage(page, { route: '/', width: 320, height: 568 })
		await page.getByRole('button', { name: '切换菜单' }).click()
		await expect(page.locator('#blog-sidebar')).toHaveClass(/show/)
		const searchButton = page.getByRole('button', { name: '搜索站内内容' })
		await expect(searchButton).toBeVisible()
		await searchButton.click()

		const dialog = page.getByRole('dialog', { name: '站内搜索' })
		const input = page.getByRole('searchbox', { name: '搜索文章标题、正文或页面' })
		await expect(dialog).toBeVisible()
		await expect(input).toBeFocused()
		const dialogBox = await dialog.boundingBox()
		expect(dialogBox).not.toBeNull()
		expect(dialogBox?.height, '搜索弹层不能超过动态视口').toBeLessThanOrEqual(552)

		await input.fill('你好')
		await expect(dialog.locator('.search-result')).toBeVisible({ timeout: 15_000 })
		const result = dialog.locator('.search-result')
		const scrollMetrics = await result.evaluate(element => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
			overflowY: getComputedStyle(element).overflowY,
		}))
		expect(['auto', 'scroll']).toContain(scrollMetrics.overflowY)
		expect(scrollMetrics.clientHeight).toBeGreaterThan(0)

		await page.keyboard.press('Escape')
		await expect(dialog).toBeHidden()
		await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
	})
})
