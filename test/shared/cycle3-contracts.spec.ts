import { describe, expect, it } from 'vitest'
import { musicPlaylistSchema } from '../../shared/admin/music'
import { newsItemSchema } from '../../shared/admin/news'
import { modulesConfigSchema, newsSourcesConfigSchema, weatherConfigSchema } from '../../shared/admin/site-config'

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

	it('defines internal reader fields and source sync adapters', () => {
		const item = newsItemSchema.parse({
			id: 'ai-hot:cms1',
			sourceId: 'ai-hot-items',
			kind: 'hot',
			title: '测试资讯',
			summary: '摘要',
			url: 'https://aihot.virxact.com/items/cms1',
			originalUrl: 'https://example.com/article',
			category: 'AI 模型',
			rank: null,
			publishedAt: '2026-08-03T00:00:00.000Z',
			fetchedAt: '2026-08-03T00:30:00.000Z',
			selected: true,
			readerPath: null,
			contentMode: null,
		})
		expect(item).toMatchObject({ readerPath: null, contentMode: null })

		const config = newsSourcesConfigSchema.parse({
			enabled: true,
			sources: [
				{ id: 'ai-hot-items', title: 'AI 精选', type: 'rest', url: 'https://aihot.virxact.com/api/v1/items', enabled: true, priority: 0, adapter: 'aihot-items', intervalMinutes: 30, publishItems: true },
				{ id: 'station-news', title: '站长资讯', type: 'rss', url: 'https://www.zaihua.news/rss.xml', enabled: true, priority: 1, adapter: 'zaihua-rss', intervalMinutes: 60, publishItems: true },
			],
		})
		expect(config.sources).toEqual(expect.arrayContaining([
			expect.objectContaining({ adapter: 'aihot-items', intervalMinutes: 30, publishItems: true }),
			expect.objectContaining({ adapter: 'zaihua-rss', intervalMinutes: 60, publishItems: true }),
		]))
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
