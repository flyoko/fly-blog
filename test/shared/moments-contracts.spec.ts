import { describe, expect, it } from 'vitest'
import { aboutLinksSchema, aboutProfileSchema } from '../../shared/admin/about'
import { momentCreateRequestSchema, momentInputSchema, momentMusicSchema } from '../../shared/admin/moments'
import { manualNewsRequestSchema, newsItemSchema } from '../../shared/admin/news'

describe('cycle 2 contracts', () => {
	it('normalizes duplicate tags and media ids', () => {
		const mediaId = crypto.randomUUID()
		const parsed = momentInputSchema.parse({
			content: 'hello',
			tags: ['生活', '生活'],
			mediaIds: [mediaId, mediaId],
		})
		expect(parsed.tags).toEqual(['生活'])
		expect(parsed.mediaIds).toEqual([mediaId])
	})

	it('rejects precise locations while allowing city-level labels', () => {
		expect(momentInputSchema.safeParse({ content: '', tags: [], mediaIds: [] }).success).toBe(false)
		expect(momentInputSchema.safeParse({ content: 'ok', tags: Array.from({ length: 9 }, (_, i) => String(i)), mediaIds: [] }).success).toBe(false)
		expect(momentInputSchema.safeParse({ content: 'ok', city: '上海市', tags: [], mediaIds: [] }).success).toBe(true)
		for (const city of ['31.2304,121.4737', '31.2304 121.4737', '31°13′49″N 121°28′25″E', '8Q7X+F7', '127.0.0.1', '上海市世纪大道100号', '200000', 'GPS: 31.2, 121.4']) {
			expect(momentInputSchema.safeParse({ content: 'ok', city, tags: [], mediaIds: [] }).success, city).toBe(false)
		}
	})

	it('requires idempotency keys for moment writes', () => {
		expect(momentCreateRequestSchema.safeParse({ moment: { content: 'hello' } }).success).toBe(false)
	})

	it('accepts only public HTTP links across public content contracts', () => {
		expect(aboutLinksSchema.safeParse([{ id: 'bad', label: 'bad', url: 'javascript:alert(1)' }]).success).toBe(false)
		expect(aboutProfileSchema.safeParse({ title: 'fly', summary: '', body: 'hello', avatar: 'file:///tmp/a' }).success).toBe(false)
		expect(aboutLinksSchema.safeParse([{ id: 'github', label: 'GitHub', url: 'https://github.com/flyoko' }]).success).toBe(true)
		for (const url of [
			'http://localhost:8787',
			'http://127.0.0.1',
			'http://2130706433',
			'http://169.254.169.254/latest/meta-data',
			'http://127.0.0.1.nip.io/private',
			'http://127-0-0-1.sslip.io/private',
			'http://[::1]',
			'https://home.arpa/private',
			'https://service.internal/path',
			'https://user:pass@example.com/path',
		]) {
			expect(aboutLinksSchema.safeParse([{ id: 'bad', label: 'bad', url }]).success, url).toBe(false)
			expect(momentMusicSchema.safeParse({ id: 'song', title: 'song', url }).success, url).toBe(false)
			expect(manualNewsRequestSchema.safeParse({ title: 'news', url, idempotencyKey: 'news-key-123' }).success, url).toBe(false)
		}
		expect(newsItemSchema.safeParse({
			id: 'news',
			sourceId: 'source',
			kind: 'rss',
			title: 'news',
			summary: null,
			url: 'https://example.com/news',
			originalUrl: 'https://example.com/original',
			category: null,
			rank: null,
			publishedAt: null,
			fetchedAt: '2026-08-03T00:00:00.000Z',
			selected: false,
		}).success).toBe(true)
	})
})
