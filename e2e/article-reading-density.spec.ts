import { expect, test } from '@playwright/test'

const articlePath = '/2026/article-20260907-174336-383eaaa7'

test.describe('public article reading density', () => {
	test('keeps the MacBook 14 and mobile reading layout compact without horizontal overflow', async ({ page, isMobile }) => {
		await page.setViewportSize(isMobile
			? { width: 390, height: 844 }
			: { width: 1512, height: 982 })
		await page.goto(articlePath, { waitUntil: 'domcontentloaded' })

		const article = page.locator('.article-reading')
		await expect(article).toBeVisible()
		await expect(page.locator('.post-title')).toBeVisible()

		const metrics = await page.evaluate(() => {
			const article = document.querySelector<HTMLElement>('.article-reading')!
			const heading = article.querySelector<HTMLElement>('h2')!
			const title = document.querySelector<HTMLElement>('.post-title')!
			const articleStyle = getComputedStyle(article)
			const headingStyle = getComputedStyle(heading)
			const titleStyle = getComputedStyle(title)
			return {
				articleFontSize: Number.parseFloat(articleStyle.fontSize),
				articleLineHeight: Number.parseFloat(articleStyle.lineHeight),
				headingFontSize: Number.parseFloat(headingStyle.fontSize),
				titleFontSize: Number.parseFloat(titleStyle.fontSize),
				scrollWidth: document.documentElement.scrollWidth,
				viewportWidth: window.innerWidth,
			}
		})

		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
		if (isMobile) {
			expect(metrics.articleFontSize).toBeGreaterThanOrEqual(14.7)
			expect(metrics.articleFontSize).toBeLessThanOrEqual(15.5)
			expect(metrics.articleLineHeight / metrics.articleFontSize).toBeLessThanOrEqual(1.7)
			expect(metrics.headingFontSize).toBeLessThanOrEqual(21)
			expect(metrics.titleFontSize).toBeLessThanOrEqual(26)
		}
		else {
			expect(metrics.articleFontSize).toBeGreaterThanOrEqual(14.9)
			expect(metrics.articleFontSize).toBeLessThanOrEqual(15.2)
			expect(metrics.articleLineHeight / metrics.articleFontSize).toBeLessThanOrEqual(1.7)
			expect(metrics.headingFontSize).toBeLessThanOrEqual(21)
			expect(metrics.titleFontSize).toBeLessThanOrEqual(24)
		}
	})
})
