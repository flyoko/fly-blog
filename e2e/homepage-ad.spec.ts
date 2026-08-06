import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { articlePresentationConfigSchema } from '../shared/admin/site-config'

const articleConfig = articlePresentationConfigSchema.parse(JSON.parse(
	readFileSync(new URL('../config/site/article.json', import.meta.url), 'utf8'),
))

const enabledAds = articleConfig.headerAds.filter(ad => ad.enabled)
const contactAd = enabledAds.find(ad => ad.action === 'wechat')
const linkAdConfig = enabledAds.find(ad => ad.action === 'link' && ad.href.startsWith('/'))

if (!contactAd?.wechatQr)
	throw new Error('Homepage ad E2E requires an enabled WeChat ad with a QR image.')
if (!linkAdConfig)
	throw new Error('Homepage ad E2E requires an enabled internal link ad.')

const contactAdTitle = contactAd.title
const linkAdTitle = linkAdConfig.title
const wechatQrPath = contactAd.wechatQr
const linkAdPath = linkAdConfig.href
const linkAdIndex = enabledAds.findIndex(ad => ad.id === linkAdConfig.id)
const nextAdTitle = enabledAds[(linkAdIndex + 1) % enabledAds.length]!.title

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
		await expect(linkAd).toHaveAttribute('href', linkAdPath)
		await expect(linkAd).toHaveAttribute('rel', /sponsored/u)
		await linkAd.click()
		await expect(page).toHaveURL(linkAdPath)
	})

	test('uses the mobile height and stays visible on filtered and sorted home views', async ({ page, isMobile }) => {
		test.skip(!isMobile, 'Mobile dimensions run in the mobile project.')
		test.setTimeout(60_000)
		await page.goto('/')
		const carousel = page.locator('.home-ad-carousel')
		await expect(page.locator('.home-ad-carousel-frame')).toHaveCSS('height', '132px')
		await expect(carousel).toContainText(contactAdTitle)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
		await expect(page.getByRole('button', { name: '上一条广告' })).toBeHidden()
		await expect(page.getByRole('button', { name: '下一条广告' })).toBeHidden()
		await expect(page.getByRole('button', { name: '暂停自动轮播' })).toBeHidden()

		const linkAdTab = page.getByRole('tab', { name: `第 ${linkAdIndex + 1} 条广告：${linkAdTitle}` })
		await expect(linkAdTab).toBeVisible()
		await linkAdTab.click()
		await expect(carousel).toContainText(linkAdTitle)
		await page.waitForTimeout(6_000)
		await expect(carousel).toContainText(nextAdTitle)

		for (const query of ['?category=生活', '?sort=updated']) {
			await page.goto(`/${query}`)
			await expect(page.locator('.home-ad-carousel')).toBeVisible()
			await expect(page.locator('.home-ad-carousel')).toContainText(contactAdTitle)
		}
	})
})
