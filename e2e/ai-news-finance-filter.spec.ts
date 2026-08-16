import { expect, test } from '@playwright/test'

const newsPayload = {
	data: {
		items: [],
		total: 0,
		briefing: null,
		sources: [],
	},
}

const financeItems = [
	{
		id: 'finance-important',
		sourceId: 'fixture',
		title: '重要财经快讯',
		summary: '重要筛选应保留这一条。',
		publishedAt: '2026-08-16T15:30:00.000Z',
		category: 'market',
		categoryLabel: '市场',
		topic: null,
		important: true,
		importanceOrigin: 'source',
		importanceScore: 1,
		sourceName: '测试源',
		sourceUrl: null,
	},
	{
		id: 'finance-normal',
		sourceId: 'fixture',
		title: '普通财经快讯',
		summary: '开启重要筛选后应立即隐藏。',
		publishedAt: '2026-08-16T15:20:00.000Z',
		category: 'company',
		categoryLabel: '公司',
		topic: null,
		important: false,
		importanceOrigin: 'source',
		importanceScore: 0,
		sourceName: '测试源',
		sourceUrl: null,
	},
]

test('财经“只看重要”可直接点击并即时筛选', async ({ page }) => {
	await page.route('**/api/news**', route => route.fulfill({
		body: JSON.stringify(newsPayload),
		contentType: 'application/json',
		status: 200,
	}))
	await page.route('**/api/finance/flash**', async (route) => {
		const importantOnly = new URL(route.request().url()).searchParams.get('important') === 'true'
		const items = importantOnly ? financeItems.filter(item => item.important) : financeItems
		await route.fulfill({
			body: JSON.stringify({
				data: {
					items,
					total: items.length,
					updatedAt: '2026-08-16T15:30:00.000Z',
					prototype: false,
				},
			}),
			contentType: 'application/json',
			status: 200,
		})
	})

	await page.goto('/ai.news')
	await page.getByRole('button', { name: '财经 7×24' }).click()

	const toggle = page.getByRole('switch', { name: '只看重要' })
	await expect(toggle).toHaveAttribute('aria-checked', 'false')
	await expect(page.locator('.finance-flash')).toHaveCount(2)

	await toggle.click()
	await expect(toggle).toHaveAttribute('aria-checked', 'true')
	await expect(page.locator('.finance-flash')).toHaveCount(1)
	await expect(page.getByText('重要财经快讯')).toBeVisible()
	await expect(page.getByText('普通财经快讯')).toHaveCount(0)
})
