import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewsService } from '../src/features/news/service'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM news_items'),
		testEnv.DB.prepare('DELETE FROM news_briefings'),
		testEnv.DB.prepare('DELETE FROM news_sync_state'),
	])
})

describe('news service', () => {
	it('keeps manual cards in the public snapshot', async () => {
		const service = new NewsService(runtimeEnv())
		await service.addManual({ title: 'A useful link', summary: 'summary', url: 'https://example.com/article', category: '精选' })
		const data = await service.list()
		expect(data.total).toBe(1)
		expect(data.items[0]).toMatchObject({ kind: 'manual', title: 'A useful link', selected: true })
	})

	it('drops non-public links returned by upstream feeds', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml')) {
				return new Response(`
					<rss><channel>
						<item><title>safe rss</title><link>https://example.com/rss</link></item>
						<item><title>private rss</title><link>http://127.0.0.1/private</link></item>
					</channel></rss>
				`, { status: 200 })
			}
			if (url.endsWith('/hot-topics')) {
				return Response.json({ items: [
					{ id: 'safe', title: 'safe hot', links: { aihot: 'https://example.com/hot' } },
					{ id: 'private', title: 'private hot', links: { original: 'http://169.254.169.254/meta' } },
				] })
			}
			return Response.json({ report: {
				date: '2026-08-03',
				lead: 'daily',
				links: { aihot: 'http://localhost/private' },
				sections: [],
			} })
		})
		try {
			await new NewsService(runtimeEnv()).sync()
			const data = await new NewsService(runtimeEnv()).list()
			expect(data.items.map(item => item.url).sort()).toEqual([
				'https://example.com/hot',
				'https://example.com/rss',
			])
			expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM news_briefings').first<{ count: number }>()).toEqual({ count: 0 })
		}
		finally {
			vi.restoreAllMocks()
		}
	})
})
