import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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

	it('lazy loads weather and music and lets public APIs decide visibility', () => {
		const layout = read('app/layouts/default.vue')
		expect(layout).toContain('<LazyWidgetWeather @visibility-change="weatherVisible = $event" />')
		expect(layout).toContain('<LazyMusicGlobalPlayer />')
		expect(layout).toContain('Boolean(slots?.aside) || weatherVisible.value')
	})

	it('uses a semantic keyboard-operable sidebar search control', () => {
		const sidebar = read('app/components/blog/BlogSidebar.vue')
		expect(sidebar).toContain('<button class="search-btn')
		expect(sidebar).not.toContain('<div class="search-btn')
	})
})
