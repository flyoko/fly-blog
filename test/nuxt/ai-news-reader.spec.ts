import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('ai 阅闻站内阅读界面', () => {
	it('uses a compact searchable news workspace instead of the cancelled feature-card layout', () => {
		const page = read('app/pages/ai.news/index.vue')
		expect(page).toContain('v-model="query"')
		expect(page).toContain('搜索标题或摘要')
		expect(page).toContain('option in filterOptions')
		expect(page).toContain('latestSyncAt')
		expect(page).toContain('内容持续更新')
		expect(page).toContain('highlight.readerPath')
		expect(page).toContain('highlight.originalUrl')
		expect(page).toContain('item.readerPath')
		expect(page).toContain('<NuxtLink')
		expect(page).toContain('站内阅读')
		expect(page).toContain('访问原文')
		expect(page).not.toContain('每 5 分钟检查')
		expect(page).not.toContain('AI HOT 最短 30 分钟')
		expect(page).not.toContain('查看 AI HOT 原始日报')
		expect(page).not.toContain('少一些跳转')
		expect(page).not.toContain('news-feature')
		expect(page).not.toContain('<img')
		expect(page).not.toContain('background-image')
	})

	it('renders fetched article text as safe paragraphs with source attribution', () => {
		const page = read('app/pages/ai.news/read/[id].vue')
		expect(page).toContain('import type { NewsDocumentDto }')
		expect(page).toContain('\'/api/news/read/\'')
		expect(page).toContain('newsDocument.value?.bodyText')
		expect(page).toContain('contentMode')
		expect(page).toContain('返回 AI 阅闻')
		expect(page).toContain('查看原始来源')
		expect(page).toContain('以下为内容摘要，完整信息请阅读原文')
		expect(page).not.toContain('查看聚合来源')
		expect(page).not.toContain('v-html')
		expect(page).not.toContain('<iframe')
	})

	it('avoids directory rewrite loops for dynamic routes', () => {
		const redirects = read('public/_redirects')
		expect(redirects).toContain('/admin https://flyovo.cc.cd/admin 302')
		expect(redirects).toContain('/admin/* https://flyovo.cc.cd/admin/:splat 302')
		expect(redirects).toContain('/moments/* /200 200')
		expect(redirects).not.toContain('/admin/* /200 200')
		expect(redirects).not.toContain('/moments/* /moments 200')
	})

	it('rewrites internal reader deep links to the Nuxt app shell', () => {
		const redirects = read('public/_redirects')
		expect(redirects).toContain('/ai.news/read/* /200 200')
	})
})
