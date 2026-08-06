import { performance } from 'node:perf_hooks'
import { expect, test } from '@playwright/test'
import { prepareStableMobilePage } from './fixtures/mobile-quality'

interface MobileBrowserBudget {
	maxResourceCount: number
	maxResourceBytes: number
	maxDomNodes: number
	maxMainReadyMs: number
}

interface MobileBrowserMetrics {
	resourceCount: number
	resourceBytes: number
	domNodes: number
	mainReadyMs: number
	documentScrollWidth: number
	viewportWidth: number
}

const routes = [
	{ name: 'home', route: '/' },
	{ name: 'article', route: '/2026/welcome' },
	{ name: 'about', route: '/me' },
	{ name: 'ai-news', route: '/ai.news' },
	{ name: 'comments', route: '/comments' },
] as const

const viewports = [
	{ width: 320, height: 700 },
	{ width: 390, height: 844 },
] as const

const browserBudget: MobileBrowserBudget = {
	maxResourceCount: 120,
	maxResourceBytes: 4_000_000,
	maxDomNodes: 1_800,
	maxMainReadyMs: 5_000,
}

function budgetViolations(metrics: MobileBrowserMetrics, budget: MobileBrowserBudget) {
	const checks = [
		['resource-count', metrics.resourceCount, budget.maxResourceCount],
		['resource-bytes', metrics.resourceBytes, budget.maxResourceBytes],
		['dom-nodes', metrics.domNodes, budget.maxDomNodes],
		['main-ready-ms', Math.round(metrics.mainReadyMs), budget.maxMainReadyMs],
		['page-overflow', metrics.documentScrollWidth, metrics.viewportWidth + 1],
	] as const
	return checks
		.filter(([, actual, limit]) => actual > limit)
		.map(([name, actual, limit]) => `${name}: ${actual} > ${limit}`)
}

async function collectBrowserMetrics(page: Parameters<typeof prepareStableMobilePage>[0], mainReadyMs: number) {
	return page.evaluate((readyMs) => {
		const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
		const localResources = resources.filter((entry) => {
			try {
				return new URL(entry.name).origin === location.origin
			}
			catch {
				return false
			}
		})
		return {
			resourceCount: localResources.length,
			resourceBytes: localResources.reduce((total, entry) => total + Math.max(entry.decodedBodySize, entry.transferSize), 0),
			domNodes: document.querySelectorAll('*').length,
			mainReadyMs: readyMs,
			documentScrollWidth: document.documentElement.scrollWidth,
			viewportWidth: document.documentElement.clientWidth,
		}
	}, mainReadyMs)
}

test.describe('移动端浏览器性能预算', () => {
	test.beforeEach(async ({ isMobile }) => {
		test.skip(!isMobile, '移动性能预算只在移动项目运行。')
	})

	for (const viewport of viewports) {
		for (const route of routes) {
			test(`${route.name}-${viewport.width} 保持在本地性能预算内`, async ({ page }) => {
				const startedAt = performance.now()
				await prepareStableMobilePage(page, {
					route: route.route,
					width: viewport.width,
					height: viewport.height,
				})
				const metrics = await collectBrowserMetrics(page, performance.now() - startedAt)
				const violations = budgetViolations(metrics, browserBudget)
				expect(violations, `${route.name}-${viewport.width} 性能预算超限：\n${JSON.stringify(metrics, null, 2)}`).toEqual([])
			})
		}
	}

	test('320px 首页菜单与搜索在水合后快速响应', async ({ page }) => {
		await prepareStableMobilePage(page, { route: '/', width: 320, height: 700 })
		const startedAt = performance.now()
		await page.getByRole('button', { name: '切换菜单' }).click()
		await expect(page.locator('#blog-sidebar')).toHaveClass(/show/)
		await page.getByRole('button', { name: '搜索站内内容' }).click()
		await expect(page.getByRole('dialog', { name: '站内搜索' })).toBeVisible()
		const interactionReadyMs = performance.now() - startedAt
		expect(interactionReadyMs, `首页菜单与搜索响应耗时 ${interactionReadyMs.toFixed(1)}ms`).toBeLessThanOrEqual(2_000)
	})
})
