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
		expect(player).toContain('/api/music/playlist')
		expect(player).toContain('response.data.tracks')
		expect(player).not.toContain('content/playlists/default.json')
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
		expect(widget).toContain('ApiSuccess<PublicWeather>')
		expect(widget).toContain('weather.sourceName')
	})
})

describe('qMCv2 music import UI contracts', () => {
	it('routes both music upload entrypoints through local preparation before FormData upload', () => {
		const picker = read('app/components/admin/AdminMediaPicker.vue')
		const media = read('app/pages/admin/media.vue')
		for (const source of [picker, media]) {
			expect(source).toContain('useMusicImport()')
			expect(source).toContain('musicAudioAccept')
			expect(source).toContain('prepareFiles(files)')
			expect(source).toContain('form.append(\'files\', prepared.file)')
			expect(source).toContain('cancelMusicImport')
			expect(source).toContain('admin-music-import-progress')
			expect(source).toContain('本人拥有、已获授权或可合法公开播放')
		}
	})

	it('exposes an in-memory MusicEx MMKV and JSON key workflow at both music upload entrypoints', () => {
		const picker = read('app/components/admin/AdminMediaPicker.vue')
		const media = read('app/pages/admin/media.vue')
		for (const source of [picker, media]) {
			expect(source).toContain('loadKeyFile')
			expect(source).toContain('clearMediaKeys')
			expect(source).toContain('keyCount')
			expect(source).toContain('导入 QQ 音乐密钥文件')
			expect(source).toContain('MMKVStreamEncryptId')
			expect(source).toContain('filenameEkeyMap')
			expect(source).toContain('仅保留在当前页面内存')
			expect(source).toContain('移除本机密钥')
		}
	})
})
