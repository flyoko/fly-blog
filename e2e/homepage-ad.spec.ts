import { expect, test } from '@playwright/test'

const contactAdTitle = '质保 plus月抛封号'
const linkAdTitle = '使用Boss-Helper 批量投递简历 省时间更省力！'
const wechatQrPath = 'https://flyovo.cc.cd/media/public/profile/2d6c33d9-5beb-4129-8cca-2f57b36103af.jpg'

test.describe('homepage advertisement carousel', () => {
	test('stays compact on desktop and does not enter article pages', async ({ page, isMobile }) => {
		test.skip(Boolean(isMobile), 'Desktop dimensions run in the desktop project.')
		test.setTimeout(60_000)
		await page.goto('/')

		const carousel = page.locator('.home-ad-carousel')
		const frame = page.locator('.home-ad-carousel-frame')
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(contactAdTitle)
		await expect(frame).toHaveCSS('height', '164px')

		const layout = await page.evaluate(() => {
			const frame = document.querySelector<HTMLElement>('.home-ad-carousel-frame')
			const postList = document.querySelector<HTMLElement>('.post-list')
			return {
				noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
				beforePostList: Boolean(frame && postList && frame.getBoundingClientRect().bottom < postList.getBoundingClientRect().bottom),
			}
		})
		expect(layout.noOverflow).toBe(true)
		expect(layout.beforePostList).toBe(true)

		await page.getByRole('button', { name: '全部分类', exact: true }).click()
		await page.locator('.dropdown-content:visible').getByRole('button', { name: '生活', exact: true }).click()
		await expect(page).toHaveURL(/category=%E7%94%9F%E6%B4%BB/u)
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(contactAdTitle)

		await page.goto('/?sort=updated')
		await expect(carousel).toBeVisible()
		await expect(carousel).toContainText(contactAdTitle)

		await page.goto('/2026/welcome')
		await expect(page.locator('.home-ad-carousel')).toHaveCount(0)
		await expect(page.getByRole('heading', { name: '你好，这里是 fly living' })).toBeVisible()
	})

	test('reveals hover controls, opens WeChat contact, and follows the link ad', async ({ page, isMobile }) => {
		test.skip(Boolean(isMobile), 'Desktop pointer interactions run in the desktop project.')
		await page.goto('/')

		const frame = page.locator('.home-ad-carousel-frame')
		const previous = page.getByRole('button', { name: '上一条广告' })
		const next = page.getByRole('button', { name: '下一条广告' })
		await expect(previous).toBeAttached()
		await expect(next).toBeAttached()
		await expect(previous).toHaveCSS('opacity', '0')
		await expect(next).toHaveCSS('opacity', '0')

		await frame.hover()
		await expect(previous).toHaveCSS('opacity', '1')
		await expect(next).toHaveCSS('opacity', '1')

		const contactTrigger = page.getByRole('button', { name: `微信联系：${contactAdTitle}` })
		await expect(contactTrigger).toBeVisible()
		await contactTrigger.click()
		const dialog = page.getByRole('dialog', { name: contactAdTitle })
		await expect(dialog).toBeVisible()
		await expect(dialog.locator('.home-ad-dialog-qr')).toHaveAttribute('src', wechatQrPath)
		await expect.poll(() => dialog.locator('.home-ad-dialog-qr').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
		await page.getByRole('button', { name: '关闭微信联系' }).click()
		await expect(dialog).toHaveCount(0)
		await expect(contactTrigger).toBeFocused()

		await frame.hover()
		await next.click()
		const linkAd = page.locator('.home-ad-carousel-main')
		await expect(linkAd).toContainText(linkAdTitle)
		await expect(linkAd).toHaveAttribute('href', '/2026/boss-helper-job-applications')
		await expect(linkAd).toHaveAttribute('rel', /sponsored/u)
		await linkAd.click()
		await expect(page).toHaveURL('/2026/boss-helper-job-applications')
	})

	test('uses the mobile height and stays visible on filtered and sorted home views', async ({ page, isMobile }) => {
		test.skip(!isMobile, 'Mobile dimensions run in the mobile project.')
		test.setTimeout(60_000)
		await page.goto('/')
		await expect(page.locator('.home-ad-carousel-frame')).toHaveCSS('height', '132px')
		await expect(page.locator('.home-ad-carousel')).toContainText(contactAdTitle)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)

		for (const query of ['?category=生活', '?sort=updated']) {
			await page.goto(`/${query}`)
			await expect(page.locator('.home-ad-carousel')).toBeVisible()
			await expect(page.locator('.home-ad-carousel')).toContainText(contactAdTitle)
		}
	})
})
