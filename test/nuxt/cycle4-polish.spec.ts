import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { timeElapse } from '../../shared/utils/time'

const read = (path: string) => readFileSync(path, 'utf8')

describe('cycle 4 polish contracts', () => {
	it('uses a bounded page transition and shared polish stylesheet', () => {
		expect(read('app/app.vue')).toContain('name: \'page\'')
		expect(read('nuxt.config.ts')).toContain('@/assets/css/polish.scss')
		const css = read('app/assets/css/polish.scss')
		expect(css).toContain('.page-enter-active')
		expect(css).toContain('prefers-reduced-motion: reduce')
		expect(css).toContain(':focus-visible')
		expect(css).toContain('forced-colors: active')
	})

	it('keeps weather and music runtimes module-aware while placing weather in the home aside', () => {
		const layout = read('app/layouts/default.vue')
		const routeAside = read('app/components/blog/RouteAside.vue')
		const widgets = read('app/composables/useWidgets.ts')
		const weather = read('app/components/widget/Weather.vue')
		expect(layout).toContain('<LazyMusicGlobalPlayer v-if="musicEnabled" />')
		expect(layout).toContain('<BlogRouteAside @visibility-change="routeAsideVisible = $event" />')
		expect(routeAside).toContain('return [\'blog-stats\', \'weather\', \'comm-group\']')
		expect(widgets).toContain('LazyWidgetWeather')
		expect(weather).toContain('module.id === \'weather\' && module.enabled')
		expect(weather).toContain('<BlogWidget v-if="visible" title="站长城市天气" card>')
		const panel = read('app/components/blog/BlogPanel.vue')
		expect(panel).toContain('z-index: calc(var(--z-index-popover) + 3)')
		expect(layout).toContain(':not(.blog-atmosphere, .reading-progress, #blog-panel, .music-player)')
		const nuxtConfig = read('nuxt.config.ts')
		expect(nuxtConfig).toContain('env.NUXT_E2E !== \'1\'')
		expect(nuxtConfig).toContain('file: resolve(\'./e2e/fixtures/modules-page.vue\')')
		expect(existsSync('app/pages/__e2e__.vue')).toBe(false)
		expect(existsSync('e2e/fixtures/modules-page.vue')).toBe(true)
	})

	it('uses a semantic keyboard-operable sidebar search control', () => {
		const sidebar = read('app/components/blog/BlogSidebar.vue')
		expect(sidebar).toMatch(/<button[^>]*class="search-btn/u)
		expect(sidebar).not.toContain('<div class="search-btn')
	})

	it('formats elapsed time against an explicit deterministic reference', () => {
		expect(timeElapse('2026-08-02', 2, '2026-08-03T12:30:00+08:00[Asia/Shanghai]')).toBe('1天12小时')
	})

	it('keeps hydration-sensitive controls deterministic and semantic', () => {
		const key = read('app/components/content/Key.vue')
		const dropdown = read('app/components/partial/Dropdown.vue')
		const order = read('app/components/post/OrderToggle.vue')
		const moments = read('app/pages/moments/index.vue')
		expect(key).toContain('const mounted = useMounted()')
		expect(key).not.toContain('<UtilHydrateSafe>')
		expect(dropdown).toContain('class="dropdown-trigger"')
		expect(dropdown).toContain(':aria-expanded="open"')
		expect(order).not.toContain('trigger="focusin"')
		expect(moments).toMatch(/prefers-reduced-motion: reduce[\s\S]*?moment-card[\s\S]*?animation: none;/u)
	})

	it('keeps the AI news feed inside the layout main landmark', () => {
		const aiNews = read('app/pages/ai.news/index.vue')
		expect(aiNews).toContain('<section class=\"news-feed card\"')
		expect(aiNews).not.toContain('<main class=\"news-feed card\"')
	})

	it('repairs third-party comment semantics and keeps low-emphasis text readable', () => {
		const comment = read('app/components/post/Comment.vue')
		const toc = read('app/components/widget/Toc.vue')
		const about = read('app/pages/me.vue')
		const moments = read('app/pages/moments/index.vue')
		const archive = read('app/pages/archive.vue')
		expect(comment).toContain('textarea.setAttribute(\'aria-label\', \'评论内容\')')
		expect(comment).toContain('link.setAttribute(\'aria-label\'')
		expect(comment).toContain('new MutationObserver(enhanceTwikooAccessibility)')
		expect(toc).toMatch(/\.no-toc[\s\S]*?color: var\(--c-text-1\)/u)
		expect(about).toMatch(/\.about-timeline time[\s\S]*?color: var\(--c-text-1\)/u)
		expect(moments).toMatch(/\.moments-filter span[\s\S]*?color: var\(--c-text-1\)/u)
		expect(archive).toContain('<h1 class="visually-hidden">')
	})

	it('keeps AI news landmarks and status controls accessible', () => {
		const news = read('app/pages/ai.news/index.vue')
		expect(news).not.toContain('<main class="news-feed')
		expect(news).toContain('<section class="news-feed')
		expect(news).toContain('<span class="visually-hidden">搜索标题或摘要</span>')
		expect(news).not.toContain('class="sr-only"')
		expect(news).toMatch(/\.news-sync span,[\s\S]*?\.news-sync small[\s\S]*?color: var\(--c-text-1\)/u)
		expect(news).toMatch(/\.news-filter button\.active[\s\S]*?border: 1px solid var\(--c-primary\)[\s\S]*?color: var\(--c-text\)/u)
		expect(news).toMatch(/\.news-feed-header p[\s\S]*?color: var\(--c-text-1\)/u)
		expect(news).toMatch(/\.news-digest-header p[\s\S]*?color: var\(--c-text-1\)/u)
	})
})
