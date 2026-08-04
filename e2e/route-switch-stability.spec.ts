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

interface MacCompositorFrame {
	flowTransform: string | null
	path: string
	visibleCount: number
}

declare global {
	interface Window {
		__captureRouteFrame?: () => void
		__routeFrames?: RouteFrame[]
		__routeRecorderDone?: boolean
		__routePulseSeen?: boolean
		__routeTransitionSeen?: boolean
		__macCompositorDone?: boolean
		__macCompositorFrames?: MacCompositorFrame[]
		__stopMacCompositorRecorder?: () => void
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

	test('keeps avatar hover compositor-local while switching routes in macOS Chrome', async ({ page }) => {
		await page.goto('/2026/welcome', { waitUntil: 'domcontentloaded' })
		const header = page.locator('.sidebar-header')
		const logo = header.locator('.blog-logo')
		await expect(header).toBeVisible()
		await logo.hover()
		await page.waitForTimeout(1_200)

		const headerState = await header.evaluate((element) => {
			const logoElement = element.querySelector<HTMLElement>('.blog-logo')
			const titleChar = element.querySelector<HTMLElement>('.header-title .split-char')
			const style = getComputedStyle(element)
			return {
				backdropFilter: style.backdropFilter,
				contain: style.contain,
				logoTransform: logoElement ? getComputedStyle(logoElement).transform : null,
				pointerActive: element.classList.contains('is-pointer-active'),
				surfaceShiftX: element.style.getPropertyValue('--surface-shift-x'),
				surfaceShiftY: element.style.getPropertyValue('--surface-shift-y'),
				titleAnimation: titleChar ? getComputedStyle(titleChar).animationName : null,
				transform: style.transform,
			}
		})
		expect(headerState.backdropFilter).toBe('none')
		expect(headerState.contain).toContain('layout')
		expect(headerState.contain).toContain('paint')
		expect(headerState.logoTransform).toBe('none')
		expect(headerState.pointerActive).toBe(false)
		expect(headerState.surfaceShiftX).toBe('')
		expect(headerState.surfaceShiftY).toBe('')
		expect(headerState.titleAnimation).toBe('none')
		expect(headerState.transform).toBe('none')

		await page.evaluate(() => {
			window.__macCompositorFrames = []
			window.__macCompositorDone = false
			const record = () => {
				const main = document.querySelector('#main-content')
				const visibleChildren = main
					? Array.from(main.children).filter((child) => {
							if (child.matches('footer'))
								return false
							const rect = child.getBoundingClientRect()
							const style = getComputedStyle(child)
							return style.display !== 'none'
								&& style.visibility !== 'hidden'
								&& Number(style.opacity) > 0.01
								&& rect.width > 1
								&& rect.height > 1
						})
					: []
				const flow = document.querySelector<HTMLElement>('.atmosphere-flow')
				window.__macCompositorFrames?.push({
					flowTransform: flow ? getComputedStyle(flow).transform : null,
					path: location.pathname,
					visibleCount: visibleChildren.length,
				})
			}
			let frame = 0
			const loop = () => {
				record()
				if (!window.__macCompositorDone)
					frame = requestAnimationFrame(loop)
			}
			frame = requestAnimationFrame(loop)
			window.__stopMacCompositorRecorder = () => {
				window.__macCompositorDone = true
				cancelAnimationFrame(frame)
				record()
			}
		})

		for (const path of ['/moments', '/link', '/archive', '/ai.news', '/']) {
			await page.locator(`.sidebar-nav-item[href="${path}"]`).click()
			await expect(page).toHaveURL(path)
			await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
			const first = await page.locator('.atmosphere-flow').evaluate(element => getComputedStyle(element).transform)
			await page.waitForTimeout(120)
			const second = await page.locator('.atmosphere-flow').evaluate(element => getComputedStyle(element).transform)
			expect(second).toBe(first)
		}

		await page.evaluate(() => window.__stopMacCompositorRecorder?.())
		const frames = await page.evaluate(() => window.__macCompositorFrames ?? [])
		expect(frames.length).toBeGreaterThan(10)
		expect(frames.some(frame => frame.visibleCount === 0)).toBe(false)
	})
})

interface ContentPageFrame {
	asideVisible: boolean
	pageKind: 'me' | 'link' | 'none'
	pageWidth: number | null
	path: string
}

declare global {
	interface Window {
		__contentPageFrames?: ContentPageFrame[]
		__contentPageRecorderDone?: boolean
	}
}

test.describe('self-introduction and links route stability', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(Boolean(isMobile), 'The reported macOS route flicker is covered in the desktop project.')
	})

	test('keeps the same content width while repeatedly switching between self-introduction and links', async ({ page }) => {
		await page.goto('/me', { waitUntil: 'domcontentloaded' })
		await expect(page.locator('.about-page')).toBeVisible()

		await page.evaluate(() => {
			window.__contentPageFrames = []
			window.__contentPageRecorderDone = false
			const record = () => {
				const about = document.querySelector<HTMLElement>('.about-page')
				const link = document.querySelector<HTMLElement>('.link-page')
				const active = about || link
				const aside = document.querySelector<HTMLElement>('#blog-aside')
				window.__contentPageFrames?.push({
					asideVisible: Boolean(aside && aside.childElementCount > 0 && getComputedStyle(aside).display !== 'none'),
					pageKind: about ? 'me' : link ? 'link' : 'none',
					pageWidth: active?.getBoundingClientRect().width ?? null,
					path: location.pathname,
				})
			}
			record()
			const observer = new MutationObserver(record)
			observer.observe(document.querySelector('#main-content')!, { childList: true, subtree: true })
			const timer = window.setInterval(record, 10)
			window.setTimeout(() => {
				window.clearInterval(timer)
				observer.disconnect()
				record()
				window.__contentPageRecorderDone = true
			}, 2_200)
		})

		for (let index = 0; index < 4; index++) {
			await page.locator('.sidebar-nav-item[href="/link"]').click()
			await expect(page).toHaveURL('/link')
			await expect(page.locator('.link-page')).toBeVisible()
			await page.waitForTimeout(40)
			await page.locator('.sidebar-nav-item[href="/me"]').click()
			await expect(page).toHaveURL('/me')
			await expect(page.locator('.about-page')).toBeVisible()
			await page.waitForTimeout(40)
		}

		await page.waitForFunction(() => window.__contentPageRecorderDone === true)
		const frames = await page.evaluate(() => window.__contentPageFrames ?? [])
		const widths = frames.map(frame => frame.pageWidth).filter((width): width is number => width !== null)

		expect(frames.some(frame => frame.pageKind === 'me')).toBe(true)
		expect(frames.some(frame => frame.pageKind === 'link')).toBe(true)
		expect(frames.some(frame => frame.pageKind === 'none')).toBe(false)
		expect(frames.some(frame => frame.asideVisible)).toBe(false)
		expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1)
	})

	test('reserves the self-introduction image space before the image finishes loading', async ({ page }) => {
		const profileImage = 'https://flyovo.cc.cd/media/public/profile/3000773f-11b2-4991-9690-5dae22d4295e.png'
		let releaseImage: (() => void) | undefined
		const imageGate = new Promise<void>((resolve) => {
			releaseImage = resolve
		})
		await page.route(profileImage, async (route) => {
			await imageGate
			await route.continue()
		})

		await page.goto('/link', { waitUntil: 'domcontentloaded' })
		await page.locator('.sidebar-nav-item[href="/me"]').click()
		await expect(page).toHaveURL('/me')
		const image = page.locator(`.about-section.article img[src="${profileImage}"]`)
		await expect(image).toHaveAttribute('width', '2394')
		await expect(image).toHaveAttribute('height', '657')
		const heightBeforeLoad = await page.locator('.about-page').evaluate(element => element.getBoundingClientRect().height)

		releaseImage?.()
		await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete)).toBe(true)
		const heightAfterLoad = await page.locator('.about-page').evaluate(element => element.getBoundingClientRect().height)
		expect(Math.abs(heightAfterLoad - heightBeforeLoad)).toBeLessThanOrEqual(1)
	})
})
