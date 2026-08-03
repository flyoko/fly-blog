import { describe, expect, it } from 'vitest'
import { musicPlaylistSchema } from '../../shared/admin/music'
import { modulesConfigSchema, weatherConfigSchema } from '../../shared/admin/site-config'

describe('cycle 3 contracts', () => {
	it('requires a complete fixed city when weather is enabled', () => {
		expect(() => weatherConfigSchema.parse({ enabled: true, provider: 'open-meteo', city: '', latitude: null, longitude: null, timezone: 'Asia/Shanghai' })).toThrow()
		expect(() => weatherConfigSchema.parse({ enabled: true, provider: 'open-meteo', city: '杭州', latitude: 30.27, longitude: 120.15, timezone: 'Mars/Olympus' })).toThrow()
		expect(weatherConfigSchema.parse({ enabled: false, provider: 'open-meteo', city: '', latitude: null, longitude: null, timezone: 'Asia/Shanghai' }).enabled).toBe(false)
	})

	it('rejects private media URLs and duplicate playlist identities', () => {
		expect(() => musicPlaylistSchema.parse({
			title: '随心听',
			tracks: [{ id: 'a', title: 'A', audioUrl: 'http://127.0.0.1/a.mp3', enabled: true, order: 0 }],
		})).toThrow()
		expect(() => musicPlaylistSchema.parse({
			title: '随心听',
			tracks: [{ id: 'a', title: 'A', audioUrl: 'https://cdn.example.com/a.m3u8?token=temporary', enabled: true, order: 0 }],
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
		expect(() => modulesConfigSchema.parse([
			{ id: 'articles', enabled: true, order: 0 },
			{ id: 'about', enabled: true, order: 2 },
			{ id: 'moments', enabled: true, order: 3 },
			{ id: 'ai-news', enabled: true, order: 4 },
			{ id: 'weather', enabled: false, order: 5 },
			{ id: 'music', enabled: false, order: 6 },
			{ id: 'links', enabled: true, order: 7 },
			{ id: 'archive', enabled: true, order: 8 },
		])).toThrow()
	})
})
