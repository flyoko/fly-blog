import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('cycle 3 UI contracts', () => {
	it('ships real music and module admin pages instead of placeholders', () => {
		expect(read('app/pages/admin/music.vue')).toContain('直接保存歌单')
		expect(read('app/pages/admin/music.vue')).toContain('AdminMediaPicker')
		expect(read('app/pages/admin/modules.vue')).toContain('创建模块 PR')
		expect(read('app/types/admin.ts')).toContain('adminUnavailableSections: Record')
	})

	it('keeps the global player in the persistent default layout', () => {
		const layout = read('app/layouts/default.vue')
		const player = read('app/components/music/GlobalPlayer.vue')
		const store = read('app/stores/music.ts')
		expect(layout).toContain('<LazyMusicGlobalPlayer v-if="musicEnabled" />')
		expect(player).toContain('播放进度')
		expect(player).toContain('prefers-reduced-motion')
		expect(store).toContain('localStorage.setItem(storageKey')
		expect(store).not.toContain('element.autoplay = true')
	})

	it('uses a structured fixed-city weather editor and public widget', () => {
		const settings = read('app/pages/admin/settings.vue')
		const widget = read('app/components/widget/Weather.vue')
		expect(settings).toContain('/api/admin/weather/search')
		expect(settings).toContain('不读取访客定位')
		expect(widget).toContain('/api/weather')
		expect(widget).toContain('weather.sourceName')
	})
})
