import { describe, expect, it } from 'vitest'
import { musicPlaylistSchema } from '../../shared/admin/music'
import { modulesConfigSchema, weatherConfigSchema } from '../../shared/admin/site-config'

describe('cycle 3 contracts', () => {
	it('requires a complete fixed city when weather is enabled', () => {
		expect(() => weatherConfigSchema.parse({ enabled: true, provider: 'open-meteo', city: '', latitude: null, longitude: null, timezone: 'Asia/Shanghai' })).toThrow()
		expect(weatherConfigSchema.parse({ enabled: false, provider: 'open-meteo', city: '', latitude: null, longitude: null, timezone: 'Asia/Shanghai' }).enabled).toBe(false)
	})

	it('rejects private media URLs and duplicate playlist identities', () => {
		expect(() => musicPlaylistSchema.parse({
			title: '随心听',
			tracks: [{ id: 'a', title: 'A', audioUrl: 'http://127.0.0.1/a.mp3', enabled: true, order: 0 }],
		})).toThrow()
		expect(() => musicPlaylistSchema.parse({
			title: '随心听',
			tracks: [
				{ id: 'a', title: 'A', audioUrl: 'https://media.example.com/a.mp3', enabled: true, order: 0 },
				{ id: 'a', title: 'B', audioUrl: 'https://media.example.com/b.mp3', enabled: true, order: 0 },
			],
		})).toThrow()
	})

	it('keeps module orders unique and complete', () => {
		expect(() => modulesConfigSchema.parse([
			{ id: 'articles', enabled: true, order: 0 },
		])).toThrow()
	})
})
