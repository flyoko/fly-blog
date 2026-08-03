import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractZaihuaArticle, htmlToReadableText, parseAiHotFullFeed, parseAiHotItems, parseRssFeed } from '../src/features/news/parsers'
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
			if (url.includes('/api/v1/items')) {
				return Response.json({ items: [
					{ id: 'safe', title: 'safe hot', links: { aihot: 'https://example.com/hot' } },
					{ id: 'private', title: 'private hot', links: { original: 'http://169.254.169.254/meta' } },
				] })
			}
			if (url.endsWith('/feed/full.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
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


describe('news source parsers', () => {
	it('converts untrusted HTML into readable plain text', () => {
		expect(htmlToReadableText(`
			<p>第一段 &amp; 补充</p>
			<script>alert('xss')</script>
			<ul><li>条目一</li><li>条目二</li></ul>
			<iframe src="https://evil.example"></iframe>
		`)).toBe('第一段 & 补充\n\n条目一\n\n条目二')
	})

	it('parses AI HOT full feed without treating summaries as full text', () => {
		const entries = parseAiHotFullFeed(`
			<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
				<item>
					<title><![CDATA[允许转载的全文]]></title>
					<link>https://aihot.virxact.com/items/cms-full</link>
					<guid isPermaLink="false">cms-full</guid>
					<description><![CDATA[<p>简短摘要</p>]]></description>
					<content:encoded><![CDATA[<p>正文第一段</p><p>正文第二段</p>]]></content:encoded>
				</item>
				<item>
					<title>只有摘要</title>
					<link>https://aihot.virxact.com/items/cms-summary</link>
					<guid>cms-summary</guid>
					<description><![CDATA[<p>来源未允许全文再分发</p>]]></description>
				</item>
			</channel></rss>
		`)
		expect(entries).toEqual([
			expect.objectContaining({ upstreamId: 'cms-full', bodyText: '正文第一段\n\n正文第二段', contentMode: 'full' }),
			expect.objectContaining({ upstreamId: 'cms-summary', bodyText: '来源未允许全文再分发', contentMode: 'summary' }),
		])
	})

	it('extracts the readable Zaihua article body and rejects unknown markup', () => {
		const article = extractZaihuaArticle(`
			<html><head><meta property="og:title" content="站长资讯标题"></head><body>
				<article><h1><strong>站长资讯标题</strong></h1>
				<div class="msg-prose text-[18px]"><p>第一段。</p><p>第二段 <a href="https://example.com">来源</a>。</p></div>
				</article>
			</body></html>
		`)
		expect(article).toEqual({ title: '站长资讯标题', bodyText: '第一段。\n\n第二段 来源。' })
		expect(extractZaihuaArticle('<article><p>结构已变化</p></article>')).toBeNull()
	})

	it('normalizes RSS and AI HOT item payloads', () => {
		const rss = parseRssFeed(`
			<rss><channel><item>
				<title><![CDATA[RSS 标题]]></title>
				<link>https://www.zaihua.news/article/1/</link>
				<guid>https://www.zaihua.news/article/1/</guid>
				<description><![CDATA[<p>RSS 摘要</p>]]></description>
				<pubDate>Mon, 03 Aug 2026 12:22:56 GMT</pubDate>
			</item></channel></rss>
		`)
		expect(rss[0]).toMatchObject({ title: 'RSS 标题', descriptionText: 'RSS 摘要', publishedAt: '2026-08-03T12:22:56.000Z' })

		const items = parseAiHotItems({ items: [{
			id: 'cms1',
			title: 'AI 标题',
			summary: 'AI 摘要',
			source: { name: '测试来源' },
			links: { aihot: 'https://aihot.virxact.com/items/cms1', original: 'https://example.com/original' },
			publishedAt: '2026-08-03T13:00:00.000Z',
			category: 'ai-models',
			score: 89,
			selected: true,
		}] })
		expect(items[0]).toMatchObject({ upstreamId: 'cms1', summary: 'AI 摘要', sourceName: '测试来源', score: 89 })
	})
})
