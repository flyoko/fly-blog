import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const source = (path: string) => readFile(resolve(root, path), 'utf8')

describe('移动端动态主题与功能页源码契约', () => {
	it('默认使用 Dynamic，并在移动端只恢复低功耗动画', async () => {
		const [nuxtConfig, css, atmosphere] = await Promise.all([
			source('nuxt.config.ts'),
			source('app/assets/css/main.scss'),
			source('app/components/blog/BlogAtmosphere.vue'),
		])

		expect(nuxtConfig).toContain('preference: \'dynamic\'')
		expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
		expect(css).toContain(':where(.dynamic) .atmosphere-lens-a')
		expect(css).toContain(':where(.dynamic) .atmosphere-stars-far')
		expect(css).toContain(':where(.dynamic) .flow-thread')
		expect(css).toContain(':where(.dynamic) .flow-signal')
		expect(css).toContain('.atmosphere-pointer')
		expect(atmosphere).toContain('isMobilePerformanceMode.value')
	})

	it('留言、自述和瞬间保留完整移动品牌头并使用紧凑移动布局', async () => {
		const [comments, me, moments] = await Promise.all([
			source('app/pages/comments.vue'),
			source('app/pages/me.vue'),
			source('app/pages/moments/index.vue'),
		])

		for (const page of [comments, me, moments])
			expect(page).toContain('BlogHeader class="mobile-page-header"')

		expect(comments).toContain('comments-mobile-shell')
		expect(comments).toContain('comments-intro-meta')
		expect(comments).toContain('无需登录')
		expect(me).toContain('about-mobile-grid')
		expect(me).toContain('min-height: 13.5rem')
		expect(me).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
		expect(moments).toContain('moments-filter-strip')
		expect(moments).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))')
		expect(moments).toContain('@media (max-width: 360px)')
	})

	it('ai 阅闻在手机上优先搜索与资讯流，并保留横滑筛选', async () => {
		const news = await source('app/pages/ai.news/index.vue')

		expect(news).toContain('BlogHeader class="mobile-page-header"')
		expect(news).toContain('class="news-workbench"')
		expect(news).toContain('scroll-snap-type: x proximity')
		expect(news).toContain('min-height: var(--touch-target)')
		expect(news).toContain('grid-row: 2')
		expect(news).toContain('-webkit-line-clamp: 2')
	})
})
