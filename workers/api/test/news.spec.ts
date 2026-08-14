import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractAiHotArticle, extractHtmlImages, extractZaihuaArticle, htmlToReadableText, parseAiHotFullFeed, parseAiHotItems, parseRssFeed } from '../src/features/news/parsers'
import { publicNewsRoutes } from '../src/features/news/routes'
import { NewsService } from '../src/features/news/service'
import { failure, normalizeError } from '../src/lib/api-error'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
function runtimeEnv(): Env {
	return { ...testEnv } as unknown as Env
}

function publicApp() {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/news', publicNewsRoutes)
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}
beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM news_documents'),
		testEnv.DB.prepare('DELETE FROM news_exclusions'),
		testEnv.DB.prepare('DELETE FROM news_items'),
		testEnv.DB.prepare('DELETE FROM news_briefings'),
		testEnv.DB.prepare('DELETE FROM news_sync_state'),
	])
})

describe('news service', () => {
	it('creates internal reading for manual cards and deletes them permanently', async () => {
		const service = new NewsService(runtimeEnv())
		const item = await service.addManual({ title: 'A useful link', summary: 'summary', url: 'https://example.com/article', category: '精选' })
		expect(item).toMatchObject({ kind: 'manual', title: 'A useful link', selected: true, contentMode: 'summary' })
		expect(item.readerPath).toMatch(/^\/ai\.news\/read\/[a-f0-9]{32}$/u)
		const document = await service.read(item.readerPath!.split('/').at(-1)!)
		expect(document).toMatchObject({
			bodyText: 'summary',
			contentMode: 'summary',
			attribution: { name: 'example.com', url: 'https://example.com/article' },
			originalUrl: 'https://example.com/article',
		})

		expect(await service.deleteItem(item.id)).toMatchObject({ id: item.id, kind: 'manual' })
		expect((await service.list()).total).toBe(0)
		expect(await service.read(item.readerPath!.split('/').at(-1)!)).toBeNull()
		expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM news_exclusions WHERE item_id = ?').bind(item.id).first()).toEqual({ count: 1 })
		await expect(service.addManual({ title: '中间站链接', url: 'https://www.zaihua.news/article/1/' })).rejects.toThrow('Only direct public HTTP(S) news links are allowed')
	})

	it('cleans automatic news older than 15 days while preserving recent and manual content', async () => {
		const old = '2026-07-01T00:00:00.000Z'
		const recent = '2026-08-05T00:00:00.000Z'
		const retentionOld = '2025-01-01T00:00:00.000Z'
		const now = new Date('2026-08-13T00:00:00.000Z')
		await testEnv.DB.batch([
			testEnv.DB.prepare(`
				INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, rank, published_at, fetched_at, selected, metadata_json, updated_at)
				VALUES ('old-hidden', 'ai-hot-items', 'hot', '旧隐藏资讯', NULL, 'https://example.com/old-hidden', NULL, NULL, NULL, ?, ?, 0, '{}', ?)
			`).bind(old, old, old),
			testEnv.DB.prepare(`
				INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, rank, published_at, fetched_at, selected, metadata_json, updated_at)
				VALUES ('old-selected', 'ai-hot-items', 'hot', '旧公开资讯', NULL, 'https://example.com/old-selected', NULL, NULL, NULL, ?, ?, 1, '{}', ?)
			`).bind(old, old, old),
			testEnv.DB.prepare(`
				INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, rank, published_at, fetched_at, selected, metadata_json, updated_at)
				VALUES ('old-manual', 'manual', 'manual', '旧手动精选', NULL, 'https://example.com/old-manual', NULL, NULL, NULL, ?, ?, 0, '{}', ?)
			`).bind(old, old, old),
			testEnv.DB.prepare(`
				INSERT INTO news_items (id, source_id, kind, title, summary, url, original_url, category, rank, published_at, fetched_at, selected, metadata_json, updated_at)
				VALUES ('recent-selected', 'ai-hot-items', 'hot', '近期公开资讯', NULL, 'https://example.com/recent-selected', NULL, NULL, NULL, ?, ?, 1, '{}', ?)
			`).bind(recent, recent, recent),
			testEnv.DB.prepare(`
				INSERT INTO news_documents (item_id, reader_key, source_id, source_url, original_url, title, body_text, content_mode, attribution_name, attribution_url, published_at, content_hash, fetched_at, updated_at, images_json)
				VALUES ('old-hidden', '11111111111111111111111111111111', 'ai-hot-items', 'https://example.com/old-hidden', NULL, '旧隐藏资讯', '正文', 'full', 'example.com', 'https://example.com/old-hidden', ?, 'hash-old-hidden', ?, ?, '[]')
			`).bind(old, old, old),
			testEnv.DB.prepare(`
				INSERT INTO news_briefings (date, title, lead, content_json, source_url, generated_at, fetched_at)
				VALUES ('2025-01-01', '旧日报', NULL, '[]', 'https://example.com/daily', ?, ?)
			`).bind(retentionOld, retentionOld),
			testEnv.DB.prepare('INSERT INTO news_exclusions (item_id, created_at) VALUES (\'orphan-old\', ?)').bind(retentionOld),
		])

		const result = await new NewsService(runtimeEnv()).cleanupRetention(now)
		expect(result).toEqual({ deletedItems: 2, deletedBriefings: 1, deletedExclusions: 1 })
		expect(await testEnv.DB.prepare('SELECT id FROM news_items ORDER BY id').all<{ id: string }>())
			.toMatchObject({ results: [{ id: 'old-manual' }, { id: 'recent-selected' }] })
		expect(await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM news_documents WHERE item_id = \'old-hidden\'').first()).toEqual({ count: 0 })
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

	it('stores internal reader snapshots and upgrades AI HOT summaries to allowed full text', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			const headers = new Headers(init?.headers)
			if (headers.get('if-none-match'))
				return new Response(null, { status: 304, headers: { etag: headers.get('if-none-match')! } })
			if (url.endsWith('/rss.xml')) {
				return new Response(`
					<rss><channel><item>
						<title>RSS 中的截断标题…</title>
						<link>https://www.zaihua.news/article/100/</link>
						<guid>https://www.zaihua.news/article/100/</guid>
						<description><![CDATA[<p>站长资讯摘要</p>]]></description>
						<pubDate>Mon, 03 Aug 2026 12:22:56 GMT</pubDate>
					</item></channel></rss>
				`, { status: 200, headers: { 'etag': '"zaihua-v1"', 'last-modified': 'Mon, 03 Aug 2026 12:30:00 GMT' } })
			}
			if (url === 'https://www.zaihua.news/article/100/') {
				return new Response(`
					<meta property="og:title" content="完整的站长资讯标题">
					<div class="msg-prose text-[18px]">
						<img src="/images/zaihua.png" alt="站长资讯配图">
						<p>站长正文第一段。</p><p>站长正文第二段。</p>
						<p><a href="https://news.example.com/original">腾讯新闻</a></p>
						<p>🌸 <a href="https://t.me/ZaiHuaPd">在花频道</a> · <a href="https://t.me/zaihuachat">茶馆水群</a> · <a href="https://t.me/ZaiHuabot">投稿通道</a></p>
					</div>
				`, { status: 200 })
			}
			if (url.includes('/api/v1/items')) {
				return Response.json({ items: [{
					id: 'cms-reader',
					title: 'AI HOT 站内阅读测试',
					summary: 'AI HOT 摘要',
					source: { name: '官方博客' },
					links: { aihot: 'https://aihot.virxact.com/items/cms-reader', original: 'https://example.com/original' },
					publishedAt: '2026-08-03T13:00:00.000Z',
					category: 'ai-models',
					selected: true,
				}] }, { headers: { etag: '"items-v1"' } })
			}
			if (url === 'https://aihot.virxact.com/items/cms-reader') {
				return new Response(`
					<div class="m-detail-html">
						<img srcset="https://cdn.example.com/aihot-small.png 320w, https://cdn.example.com/aihot-large.png 1280w" alt="AI HOT 配图">
						<p>来源页面正文第一段。</p><p>来源页面正文第二段。</p>
					</div>
				`, { status: 200 })
			}
			if (url === 'https://cdn.example.com/aihot-large.png') {
				return new Response(null, {
					status: 302,
					headers: { location: 'https://cdn.example.com/files/aihot.png' },
				})
			}
			if (url === 'https://www.zaihua.news/images/zaihua.png' || url === 'https://cdn.example.com/files/aihot.png') {
				return new Response(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, url.length]), {
					status: 200,
					headers: { 'content-type': 'image/png' },
				})
			}
			if (url.endsWith('/feed/full.xml')) {
				return new Response(`
					<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><item>
						<title>AI HOT 站内阅读测试</title>
						<link>https://aihot.virxact.com/items/cms-reader</link>
						<guid>cms-reader</guid>
						<description><![CDATA[<p>AI HOT 摘要</p><p><a href="https://example.com/original">阅读原文</a></p>]]></description>
					</item></channel></rss>
				`, { status: 200, headers: { etag: '"full-v1"' } })
			}
			return Response.json({ report: {
				date: '2026-08-03',
				generatedAt: '2026-08-03T00:00:04.358Z',
				links: { aihot: 'https://aihot.virxact.com/daily/2026-08-03' },
				sections: [],
			} }, { headers: { etag: '"daily-v1"' } })
		})
		try {
			const service = new NewsService(runtimeEnv())
			const first = await service.sync({ force: true })
			expect(first.sources.every(source => source.status === 'success')).toBe(true)

			const data = await service.list()
			expect(data.items).toHaveLength(2)
			const hot = data.items.find(item => item.id === 'ai-hot:cms-reader')!
			const rss = data.items.find(item => item.sourceId === 'station-news')!
			expect(hot).toMatchObject({
				contentMode: 'full',
				originalUrl: 'https://example.com/original',
				url: 'https://example.com/original',
				coverImage: { alt: 'AI HOT 配图', mime: 'image/png' },
			})
			expect(rss).toMatchObject({
				title: '完整的站长资讯标题',
				contentMode: 'full',
				originalUrl: 'https://news.example.com/original',
				url: 'https://news.example.com/original',
				coverImage: { alt: '站长资讯配图', mime: 'image/png' },
			})
			expect(hot.coverImage?.url).toContain('/public/news/')
			expect(rss.coverImage?.url).toContain('/public/news/')
			expect(hot.coverImage?.url).not.toContain('cdn.example.com')
			const imageRequest = fetchSpy.mock.calls.find(([input]) => {
				const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
				return url === 'https://cdn.example.com/aihot-large.png'
			})
			expect(imageRequest).toBeDefined()
			const imageAccept = new Headers(imageRequest?.[1]?.headers).get('accept') || ''
			expect(imageAccept).toContain('image/webp')
			expect(imageAccept).not.toContain('image/avif')
			expect(data.briefing?.source_url).toBe('https://flyovo.cc.cd/ai.news')
			expect(hot.readerPath).toMatch(/^\/ai\.news\/read\/[a-f0-9]{32}$/u)
			expect(rss.readerPath).toMatch(/^\/ai\.news\/read\/[a-f0-9]{32}$/u)

			const hotDocument = await service.read(hot.readerPath!.split('/').at(-1)!)
			expect(hotDocument).toMatchObject({
				bodyText: '来源页面正文第一段。\n\n来源页面正文第二段。',
				contentMode: 'full',
				attribution: { name: '官方博客', url: 'https://example.com/original' },
				sourceUrl: 'https://example.com/original',
				originalUrl: 'https://example.com/original',
				images: [expect.objectContaining({ alt: 'AI HOT 配图', mime: 'image/png' })],
			})

			const rssDocument = await service.read(rss.readerPath!.split('/').at(-1)!)
			expect(rssDocument).toMatchObject({
				bodyText: '站长正文第一段。\n\n站长正文第二段。',
				attribution: { name: '腾讯新闻', url: 'https://news.example.com/original' },
				sourceUrl: 'https://news.example.com/original',
				originalUrl: 'https://news.example.com/original',
				images: [expect.objectContaining({ alt: '站长资讯配图', mime: 'image/png' })],
			})
			expect(rssDocument?.bodyText).not.toContain('在花频道')

			fetchSpy.mockClear()
			const skipped = await service.sync()
			expect(skipped.sources.every(source => source.status === 'skipped')).toBe(true)
			expect(fetchSpy).not.toHaveBeenCalled()

			const checked = await service.sync({ force: true })
			expect(checked.sources.every(source => source.status === 'success')).toBe(true)
			expect(fetchSpy.mock.calls.some(([, init]) => new Headers(init?.headers).has('if-none-match'))).toBe(true)
			expect((await service.list()).items).toHaveLength(2)
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('ignores AI HOT metadata cards without replacing existing full text', async () => {
		let metadataOnlyPage = false
		const imageUrl = 'https://aihot.virxact.com/items/cms-backfill/opengraph-image'
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
			if (url.includes('/api/v1/items')) {
				return Response.json({ items: [{
					id: 'cms-backfill',
					title: 'AI HOT 图片回填',
					summary: '摘要正文',
					source: { name: '官方博客' },
					links: { aihot: 'https://aihot.virxact.com/items/cms-backfill', original: 'https://example.com/original' },
					selected: true,
				}] })
			}
			if (url.endsWith('/feed/full.xml')) {
				return new Response(`
					<rss><channel><item>
						<title>AI HOT 图片回填</title>
						<link>https://aihot.virxact.com/items/cms-backfill</link>
						<guid>cms-backfill</guid>
						<description><![CDATA[<p>摘要正文</p>]]></description>
					</item></channel></rss>
				`, { status: 200 })
			}
			if (url === 'https://aihot.virxact.com/items/cms-backfill') {
				return metadataOnlyPage
					? new Response(`<head><meta property="og:image" content="${imageUrl}"></head><body><main>仅元数据图片</main></body>`, { status: 200 })
					: new Response('<div class="m-detail-html"><p>已保存的完整正文。</p></div>', { status: 200 })
			}
			if (url === imageUrl) {
				return new Response(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x01]), {
					status: 200,
					headers: { 'content-type': 'image/png' },
				})
			}
			return Response.json({ report: {
				date: '2026-08-04',
				links: { aihot: 'https://aihot.virxact.com/daily/2026-08-04' },
				sections: [],
			} })
		})
		try {
			const service = new NewsService(runtimeEnv())
			await service.sync({ force: true })
			const before = (await service.list()).items.find(item => item.id === 'ai-hot:cms-backfill')!
			const beforeDocument = await service.read(before.readerPath!.split('/').at(-1)!)
			expect(before.coverImage).toBeNull()
			expect(beforeDocument).toMatchObject({ bodyText: '已保存的完整正文。', contentMode: 'full', images: [] })

			metadataOnlyPage = true
			await service.sync({ force: true })
			const after = (await service.list()).items.find(item => item.id === 'ai-hot:cms-backfill')!
			const afterDocument = await service.read(after.readerPath!.split('/').at(-1)!)
			expect(after.coverImage).toBeNull()
			expect(afterDocument).toMatchObject({
				bodyText: '已保存的完整正文。',
				contentMode: 'full',
				images: [],
			})
			expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => {
				const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
				return url === imageUrl
			})).toBe(false)
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('resets the image budget between sources so later sources are not starved', async () => {
		let logicalNow = 1_000
		vi.spyOn(Date, 'now').mockImplementation(() => logicalNow)
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml')) {
				return new Response(`
					<rss><channel><item>
						<title>站长图片预算</title>
						<link>https://www.zaihua.news/article/budget/</link>
						<guid>https://www.zaihua.news/article/budget/</guid>
						<description><![CDATA[<p>站长摘要</p><img src="https://cdn.example.com/station-budget.png">]]></description>
					</item></channel></rss>
				`, { status: 200 })
			}
			if (url === 'https://www.zaihua.news/article/budget/') {
				return new Response(`
					<meta property="og:title" content="站长图片预算">
					<div class="msg-prose">
						<img src="https://cdn.example.com/station-budget.png" alt="站长正文配图">
						<p>站长正文。</p>
						<p><a href="https://example.com/station-original">原文</a></p>
					</div>
				`, { status: 200 })
			}
			if (url === 'https://cdn.example.com/station-budget.png') {
				logicalNow += 46_000
				return new Response(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x11]), { status: 200 })
			}
			if (url.includes('/api/v1/items')) {
				return Response.json({ items: [{
					id: 'cms-budget',
					title: 'AI HOT 图片预算',
					summary: 'AI HOT 摘要',
					links: { aihot: 'https://aihot.virxact.com/items/cms-budget', original: 'https://example.com/original' },
					selected: true,
				}] })
			}
			if (url.endsWith('/feed/full.xml')) {
				return new Response(`
					<rss><channel><item>
						<title>AI HOT 图片预算</title>
						<link>https://aihot.virxact.com/items/cms-budget</link>
						<guid>cms-budget</guid>
						<description><![CDATA[<p>AI HOT 摘要</p>]]></description>
					</item></channel></rss>
				`, { status: 200 })
			}
			if (url === 'https://aihot.virxact.com/items/cms-budget') {
				return new Response(`
					<head><meta property="og:image" content="https://cdn.example.com/aihot-brand-card.png"></head>
					<div class="m-detail-html">
						<img src="https://cdn.example.com/aihot-budget.png" alt="正文配图">
						<p>AI HOT 正文。</p>
					</div>
				`, { status: 200 })
			}
			if (url === 'https://cdn.example.com/aihot-budget.png') {
				return new Response(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x22]), { status: 200 })
			}
			return Response.json({ report: {
				date: '2026-08-04',
				links: { aihot: 'https://aihot.virxact.com/daily/2026-08-04' },
				sections: [],
			} })
		})
		try {
			const service = new NewsService(runtimeEnv())
			await service.sync({ force: true })
			const items = (await service.list()).items
			expect(items.find(item => item.kind === 'rss')?.coverImage).toMatchObject({ mime: 'image/png' })
			expect(items.find(item => item.kind === 'hot')?.coverImage).toMatchObject({ mime: 'image/png' })
			expect(vi.mocked(globalThis.fetch).mock.calls.some(([input]) => {
				const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
				return url === 'https://cdn.example.com/aihot-brand-card.png'
			})).toBe(false)
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('reserves subrequests for source checks and removes retired source state', async () => {
		let requestCount = 0
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			requestCount += 1
			if (requestCount > 50)
				throw new Error('Too many subrequests by single Worker invocation')
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml')) {
				const entries = Array.from({ length: 30 }, (_, index) => `
					<item>
						<title>站长资讯 ${index}</title>
						<link>https://www.zaihua.news/article/budget-${index}/</link>
						<guid>budget-${index}</guid>
						<description><![CDATA[<p>摘要 ${index}</p>]]></description>
					</item>`).join('')
				return new Response(`<rss><channel>${entries}</channel></rss>`, { status: 200 })
			}
			if (url.startsWith('https://www.zaihua.news/article/budget-')) {
				const id = url.match(/budget-(\d+)/u)?.[1] || '0'
				return new Response(`
					<meta property="og:title" content="站长资讯 ${id}">
					<div class="msg-prose">
						<img src="https://cdn.example.com/budget-${id}.png" alt="配图 ${id}">
						<p>正文 ${id}</p>
						<p><a href="https://example.com/original-${id}">原文</a></p>
					</div>
				`, { status: 200 })
			}
			if (url.startsWith('https://cdn.example.com/budget-')) {
				return new Response(Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x33]), {
					status: 200,
					headers: { 'content-type': 'image/png' },
				})
			}
			if (url.includes('/api/v1/items'))
				return Response.json({ items: [] })
			if (url.endsWith('/feed/full.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
			return Response.json({ report: {
				date: '2026-08-14',
				generatedAt: '2026-08-14T15:00:00.000Z',
				links: { aihot: 'https://aihot.virxact.com/daily/2026-08-14' },
				sections: [],
			} })
		})
		try {
			await testEnv.DB.prepare(`
				INSERT INTO news_sync_state (source_id, status, item_count, last_success_at, last_error, updated_at, etag, last_modified, next_sync_at)
				VALUES ('ai-hot', 'failed', 2, '2026-08-03T14:26:57.962Z', 'legacy error', '2026-08-03T14:26:57.962Z', NULL, NULL, NULL)
			`).run()
			const service = new NewsService(runtimeEnv())
			expect((await service.list()).sources.map(source => source.source_id)).not.toContain('ai-hot')
			expect((await service.sourceState()).map(source => source.source_id)).not.toContain('ai-hot')

			const result = await service.sync({ force: true })
			expect(result.sources).toHaveLength(4)
			expect(result.sources.every(source => source.status === 'success')).toBe(true)
			expect(requestCount).toBeLessThanOrEqual(36)
			expect(fetchSpy.mock.calls.some(([input]) => {
				const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
				return url.endsWith('/api/v1/dailies/latest')
			})).toBe(true)
			expect(await testEnv.DB.prepare('SELECT source_id FROM news_sync_state WHERE source_id = \'ai-hot\'').first()).toBeNull()
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('keeps deleted automated items excluded after later source syncs', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
			if (url.includes('/api/v1/items')) {
				return Response.json({ items: [{
					id: 'excluded-item',
					title: '稍后仍在上游的数据',
					summary: '摘要',
					links: { aihot: 'https://aihot.virxact.com/items/excluded-item', original: 'https://example.com/excluded' },
					selected: true,
				}] })
			}
			if (url === 'https://aihot.virxact.com/items/excluded-item')
				return new Response('<div class="m-detail-html"><p>正文</p></div>', { status: 200 })
			if (url.endsWith('/feed/full.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
			return Response.json({ report: null })
		})
		try {
			const service = new NewsService(runtimeEnv())
			await service.sync({ force: true })
			const item = (await service.list()).items[0]!
			expect(item.id).toBe('ai-hot:excluded-item')
			await service.deleteItem(item.id)
			expect((await service.list()).total).toBe(0)

			await service.sync({ force: true })
			expect((await service.list()).total).toBe(0)
			expect(await testEnv.DB.prepare('SELECT selected FROM news_items WHERE id = ?').bind(item.id).first()).toEqual({ selected: 0 })
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('respects Retry-After without checking a source faster than its minimum interval', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, {
			status: 429,
			headers: { 'retry-after': '3600' },
		}))
		try {
			const startedAt = Date.now()
			const result = await new NewsService(runtimeEnv()).syncSource('ai-hot-items')
			expect(result.sources[0]).toMatchObject({ status: 'failed', itemCount: 0 })
			expect(Date.parse(result.sources[0]!.nextSyncAt!) - startedAt).toBeGreaterThanOrEqual(3_590_000)
			const state = await testEnv.DB.prepare('SELECT * FROM news_sync_state WHERE source_id = ?')
				.bind('ai-hot-items')
				.first<{ status: string, last_error: string }>()
			expect(state).toMatchObject({ status: 'failed', last_error: 'AI HOT 精选 请求过于频繁' })
		}
		finally {
			vi.restoreAllMocks()
		}
	})

	it('falls back to the RSS summary when a Zaihua article cannot be extracted', async () => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
			if (url.endsWith('/rss.xml')) {
				return new Response(`<rss><channel><item>
					<title>摘要条目</title><link>https://www.zaihua.news/article/101/</link>
					<description><![CDATA[<p>可安全展示的 RSS 摘要。</p>]]></description>
				</item></channel></rss>`, { status: 200 })
			}
			if (url === 'https://www.zaihua.news/article/101/')
				return new Response('<article><p>未知结构</p></article>', { status: 200 })
			if (url.includes('/api/v1/items'))
				return Response.json({ items: [] })
			if (url.endsWith('/feed/full.xml'))
				return new Response('<rss><channel></channel></rss>', { status: 200 })
			return Response.json({ report: null })
		})
		try {
			const service = new NewsService(runtimeEnv())
			await service.sync({ force: true })
			const item = (await service.list()).items[0]
			expect(item).toMatchObject({ contentMode: 'summary' })
			const document = await service.read(item.readerPath!.split('/').at(-1)!)
			expect(document).toMatchObject({ bodyText: '可安全展示的 RSS 摘要。', contentMode: 'summary' })
		}
		finally {
			vi.restoreAllMocks()
		}
	})
})

describe('news public routes', () => {
	it('serves and caches an internal document by reader key', async () => {
		const readerKey = 'a'.repeat(32)
		const now = '2026-08-03T12:00:00.000Z'
		await testEnv.DB.batch([
			testEnv.DB.prepare(`
				INSERT INTO news_items (
					id, source_id, kind, title, summary, url, original_url, category, rank,
					published_at, fetched_at, selected, metadata_json, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '{}', ?)
			`).bind(
				'ai-hot:route-test',
				'ai-hot-items',
				'hot',
				'详情接口测试',
				'详情摘要',
				'https://aihot.virxact.com/items/route-test',
				'https://example.com/original',
				'AI 模型',
				null,
				now,
				now,
				now,
			),
			testEnv.DB.prepare(`
				INSERT INTO news_documents (
					item_id, reader_key, source_id, source_url, original_url, title, body_text,
					content_mode, attribution_name, attribution_url, published_at, content_hash,
					fetched_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, 'full', 'AI HOT', ?, ?, 'hash', ?, ?)
			`).bind(
				'ai-hot:route-test',
				readerKey,
				'ai-hot-items',
				'https://aihot.virxact.com/items/route-test',
				'https://example.com/original',
				'详情接口测试',
				'正文第一段。\n\n正文第二段。',
				'https://aihot.virxact.com/items/route-test',
				now,
				now,
				now,
			),
		])

		const url = `https://blog.example.test/api/news/read/${readerKey}`
		const first = await publicApp().request(url, {}, runtimeEnv())
		expect(first.status).toBe(200)
		expect(first.headers.get('x-fly-cache')).toBe('MISS')
		expect(first.headers.get('cache-control')).toContain('max-age=300')
		expect(await first.json()).toMatchObject({
			ok: true,
			data: {
				readerKey,
				bodyText: '正文第一段。\n\n正文第二段。',
				contentMode: 'full',
			},
		})

		const cached = await publicApp().request(url, {}, runtimeEnv())
		expect(cached.headers.get('x-fly-cache')).toBe('HIT')
	})

	it('returns 404 for unknown or invalid reader keys instead of proxying a URL', async () => {
		const unknown = await publicApp().request(`https://blog.example.test/api/news/read/${'b'.repeat(32)}?url=https://www.zaihua.news/`, {}, runtimeEnv())
		expect(unknown.status).toBe(404)
		expect(await unknown.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })

		const invalid = await publicApp().request('https://blog.example.test/api/news/read/invalid-reader-key', {}, runtimeEnv())
		expect(invalid.status).toBe(404)
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

	it('extracts lazy and responsive images with stable ordering', () => {
		expect(extractHtmlImages(`
			<img src="/placeholder.gif" data-src="/hero.webp" alt="主图">
			<img srcset="/small.jpg 320w, /large.jpg 1280w" alt="响应式图">
			<img src="/hero.webp" alt="重复图">
		`, 'https://news.example.com/story')).toEqual([
			{ url: 'https://news.example.com/hero.webp', alt: '主图' },
			{ url: 'https://news.example.com/large.jpg', alt: '响应式图' },
		])
	})

	it('parses AI HOT full feed without treating summaries as full text', () => {
		const entries = parseAiHotFullFeed(`
			<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
				<item>
					<title><![CDATA[允许转载的全文]]></title>
					<link>https://aihot.virxact.com/items/cms-full</link>
					<guid isPermaLink="false">cms-full</guid>
					<description><![CDATA[<p>简短摘要</p>]]></description>
					<content:encoded><![CDATA[<p>正文第一段</p><p>正文第二段</p><p>—— 本文由 AI HOT 聚合整理，完整版与更多 AI 动态见 https://aihot.virxact.com/items/cms-full</p>]]></content:encoded>
				</item>
				<item>
					<title>只有摘要</title>
					<link>https://aihot.virxact.com/items/cms-summary</link>
					<guid>cms-summary</guid>
					<description><![CDATA[<p>来源未允许全文再分发</p><p>🔗 阅读原文</p><p>via AI HOT · https://aihot.virxact.com/items/cms-summary</p>]]></description>
				</item>
			</channel></rss>
		`)
		expect(entries).toEqual([
			expect.objectContaining({ upstreamId: 'cms-full', bodyText: '正文第一段\n\n正文第二段', contentMode: 'full' }),
			expect.objectContaining({ upstreamId: 'cms-summary', bodyText: '来源未允许全文再分发', contentMode: 'summary' }),
		])
	})

	it('extracts Zaihua body images but rejects the source metadata card', () => {
		const article = extractZaihuaArticle(`
			<html><head>
				<meta property="og:title" content="站长资讯标题">
				<meta property="og:image" content="/article/1/opengraph-image">
			</head><body>
				<article><h1><strong>站长资讯标题</strong></h1>
				<div class="msg-prose text-[18px]">
					<img src="/images/content-photo.png" alt="正文现场图片">
					<img src="https://cdn.zaihua.news/emojis/custom/5861941673918994174.webp" alt="装饰表情">
					<p>第一段。</p><p>第二段。</p>
					<p><a href="https://news.example.com/story">腾讯新闻</a></p>
					<p>🌸 <a href="https://t.me/ZaiHuaPd">在花频道</a> · <a href="https://t.me/zaihuachat">茶馆水群</a> · <a href="https://t.me/ZaiHuabot">投稿通道</a></p>
				</div>
				</article>
			</body></html>
		`, 'https://www.zaihua.news/article/1/')
		expect(article).toEqual({
			title: '站长资讯标题',
			bodyText: '第一段。\n\n第二段。',
			images: [{ url: 'https://www.zaihua.news/images/content-photo.png', alt: '正文现场图片' }],
			originalUrl: 'https://news.example.com/story',
			sourceName: '腾讯新闻',
		})
		expect(extractZaihuaArticle(`
			<head>
				<meta property="og:title" content="只有 CDN 内容图">
				<meta property="og:image" content="https://cdn.zaihua.news/main/1/content-photo.jpg">
			</head>
			<div class="msg-prose"><p>正文。</p><p><a href="https://news.example.com/story">原文</a></p></div>
		`, 'https://www.zaihua.news/article/1/')).toMatchObject({
			images: [{ url: 'https://cdn.zaihua.news/main/1/content-photo.jpg', alt: null }],
		})
		expect(extractZaihuaArticle(`
			<head>
				<meta property="og:title" content="只有标题卡">
				<meta property="og:image" content="https://www.zaihua.news/og/article/1.png">
			</head>
			<div class="msg-prose"><p>正文。</p><p><a href="https://news.example.com/story">原文</a></p></div>
		`, 'https://www.zaihua.news/article/1/')).toMatchObject({ images: [] })
		expect(extractZaihuaArticle('<article><p>结构已变化</p></article>')).toBeNull()
	})

	it('extracts AI HOT body images but rejects source metadata cards', () => {
		expect(extractAiHotArticle(`
			<head><meta property="og:image" content="/items/cms1/opengraph-image"></head>
			<div class="m-detail-summary"><p>摘要不应被当作正文。</p></div>
			<div id="article-body"><div class="m-detail-html">
				<img src="/images/article-photo.webp" alt="正文产品图片">
				<p>完整正文第一段。</p><h2>小标题</h2><p>完整正文第二段。</p>
				<p>—— 本文由 AI HOT 聚合整理，完整版与更多 AI 动态见 https://aihot.virxact.com/items/cms1</p>
			</div></div>
		`, 'https://aihot.virxact.com/items/cms1')).toEqual({
			bodyText: '完整正文第一段。\n\n小标题\n\n完整正文第二段。',
			images: [{ url: 'https://aihot.virxact.com/images/article-photo.webp', alt: '正文产品图片' }],
		})
		expect(extractAiHotArticle(`
			<head><meta property="og:image" content="/items/cms1/opengraph-image"></head>
			<body><div>没有正文结构</div></body>
		`, 'https://aihot.virxact.com/items/cms1')).toBeNull()
		expect(extractAiHotArticle('<div>没有正文结构</div>')).toBeNull()
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
