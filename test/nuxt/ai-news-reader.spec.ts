import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('aI 阅闻站内阅读界面', () => {
	it('uses a compact searchable news workspace instead of the cancelled feature-card layout', () => {
		const page = read('app/pages/ai.news.vue')
		expect(page).toContain('v-model="query"')
		expect(page).toContain('搜索标题或摘要')
		expect(page).toContain('option in filterOptions')
		expect(page).toContain('latestSyncAt')
		expect(page).toContain('AI HOT 每 30 分钟')
		expect(page).toContain('站长资讯每 60 分钟')
		expect(page).toContain('item.readerPath')
		expect(page).toContain('<NuxtLink')
		expect(page).toContain('站内阅读')
		expect(page).toContain('访问原文')
		expect(page).not.toContain('news-feature')
		expect(page).not.toContain('<img')
		expect(page).not.toContain('background-image')
	})
})
