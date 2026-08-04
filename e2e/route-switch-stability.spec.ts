import { expect, test } from '@playwright/test'

interface RouteFrame {
	clientWidth: number
	contentLeft: number | null
	contentWidth: number | null
	path: string
	routePulse: boolean
	sidebarLeft: number | null
	sidebarTop: number | null
	transitioning: boolean
	y: number
}

declare global {
	interface Window {
		__captureRouteFrame?: () => void
		__routeFrames?: RouteFrame[]
		__routeRecorderDone?: boolean
		__routePulseSeen?: boolean
		__routeTransitionSeen?: boolean
	}
}

async function startRouteRecorder(page: import('@playwright/test').Page, duration = 1_400) {
	await page.evaluate((recordDuration) => {
		window.__routeFrames = []
		window.__routeRecorderDone = false
		window.__routePulseSeen = false
		window.__routeTransitionSeen = false

		const inspectTransientState = () => {
			window.__routePulseSeen ||= document.querySelector('.blog-atmosphere')?.classList.contains('is-route-pulse') ?? false
			window.__routeTransitionSeen ||= Boolean(document.querySelector('.page-enter-active, .page-leave-active, .page-enter-from, .page-leave-to'))
		}

		const record = () => {
			const sidebar = document.querySelector<HTMLElement>('#blog-sidebar')
			const content = document.querySelector<HTMLElement>('#content')
			const sidebarRect = sidebar?.getBoundingClientRect()
			const contentRect = content?.getBoundingClientRect()
			inspectTransientState()
			window.__routeFrames?.push({
				clientWidth: document.documentElement.clientWidth,
				contentLeft: contentRect?.left ?? null,
				contentWidth: contentRect?.width ?? null,
				path: window.location.pathname,
				routePulse: window.__routePulseSeen ?? false,
				sidebarLeft: sidebarRect?.left ?? null,
				sidebarTop: sidebarRect?.top ?? null,
				transitioning: window.__routeTransitionSeen ?? false,
				y: window.scrollY,
			})
		}

		window.__captureRouteFrame = record
		record()
		const observer = new MutationObserver(inspectTransientState)
		observer.observe(document.documentElement, {
			attributeFilter: ['class'],
			attributes: true,
			childList: true,
			subtree: true,
		})
		const timer = window.setInterval(record, 20)
		window.setTimeout(() => {
			window.clearInterval(timer)
			observer.disconnect()
			record()
			window.__routeRecorderDone = true
		}, recordDuration)
	}, duration)
}

function expectStableGeometry(frames: RouteFrame[]) {
	const range = (values: Array<number | null>) => {
		const present = values.filter((value): value is number => value !== null)
		return Math.max(...present) - Math.min(...present)
	}

	expect(range(frames.map(frame => frame.clientWidth))).toBeLessThanOrEqual(1)
	expect(range(frames.map(frame => frame.sidebarLeft))).toBeLessThanOrEqual(1)
	expect(range(frames.map(frame => frame.sidebarTop))).toBeLessThanOrEqual(1)
	expect(range(frames.map(frame => frame.contentLeft))).toBeLessThanOrEqual(1)
	expect(range(frames.map(frame => frame.contentWidth))).toBeLessThanOrEqual(1)
}

test.describe('public route switch stability', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'The reported macOS route flicker is covered in the desktop project.')
	})

	test('rapid sidebar navigation does not fade, pulse, smooth-scroll, or shift the shell', async ({ page }) => {
		await page.goto('/2026/welcome', { waitUntil: 'domcontentloaded' })
		await expect(page.locator('#blog-sidebar')).toBeVisible()
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

		await startRouteRecorder(page)
		await page.locator('.sidebar-nav-item[href="/ai.news"]').click()
		await expect(page).toHaveURL('/ai.news')
		await page.evaluate(() => window.__captureRouteFrame?.())
		await page.waitForTimeout(80)
		await page.locator('.sidebar-nav-item[href="/moments"]').click()
		await expect(page).toHaveURL('/moments')
		await page.evaluate(() => window.__captureRouteFrame?.())
		await page.waitForFunction(() => window.__routeRecorderDone === true)

		const frames = await page.evaluate(() => window.__routeFrames ?? [])
		expect(frames.length).toBeGreaterThan(3)
		expect(frames.some(frame => frame.path === '/ai.news')).toBe(true)
		expect(frames.some(frame => frame.path === '/moments')).toBe(true)
		expect(await page.evaluate(() => window.__routeTransitionSeen)).toBe(false)
		expect(await page.evaluate(() => window.__routePulseSeen)).toBe(false)
		expect(frames.some(frame => frame.transitioning)).toBe(false)
		expect(frames.some(frame => frame.routePulse)).toBe(false)

		for (const path of ['/ai.news', '/moments']) {
			const routeFrames = frames.filter(frame => frame.path === path)
			expect(routeFrames.length).toBeGreaterThan(0)
			expect(Math.max(...routeFrames.map(frame => frame.y))).toBeLessThanOrEqual(1)
		}

		expectStableGeometry(frames)
	})
})
