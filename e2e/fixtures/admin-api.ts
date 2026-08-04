import type { Page, Route } from '@playwright/test'
import { encodeArticleId } from '../../shared/admin/articles'

export interface AdminApiMockOptions {
	authenticated?: boolean
	overviewFailure?: boolean
	articleConflict?: boolean
	mediaPartialFailure?: boolean
	sessionExpiresAfterLoad?: boolean
	analyticsStatusFailure?: boolean
}

export interface AdminApiCapture {
	articleWrites: Array<Record<string, unknown>>
	configWrites: Array<Record<string, unknown>>
	momentWrites: Array<Record<string, unknown>>
	momentBackupWrites: Array<{ path: string, body: Record<string, unknown> | null }>
	aboutWrites: Array<Record<string, unknown>>
	newsWrites: Array<Record<string, unknown>>
	musicWrites: Array<Record<string, unknown>>
	mediaActions: Array<{ method: string, path: string }>
	mediaUploads: number
	mediaUploadBodies: string[]
	logoutCount: number
	analyticsIpViews: number
	analyticsExports: number
}

const momentId = '11111111-1111-4111-8111-111111111111'
const aiHotReaderKey = 'c'.repeat(32)
const zaihuaReaderKey = 'd'.repeat(32)

const articlePath = 'content/posts/2026/cycle-1-test.md'
const articleId = encodeArticleId(articlePath)

function success(data: unknown, status = 200) {
	return {
		status,
		contentType: 'application/json',
		body: JSON.stringify({ ok: true, data }),
	}
}

function failure(code: string, message: string, status = 400, details?: unknown) {
	return {
		status,
		contentType: 'application/json',
		body: JSON.stringify({
			ok: false,
			error: { code, message, requestId: 'e2e-request', details },
		}),
	}
}

function articleSummary() {
	return {
		id: articleId,
		path: articlePath,
		sha: 'article-sha-1',
		title: 'Cycle 1 article',
		description: 'A deterministic article used by browser tests.',
		date: '2026-08-03',
		updated: '2026-08-03',
		categories: ['技术'],
		tags: ['Nuxt'],
		draft: false,
	}
}

function articleDocument() {
	return {
		path: articlePath,
		sha: 'article-sha-1',
		body: '# Existing article\n',
		frontmatter: {
			title: 'Cycle 1 article',
			description: 'A deterministic article used by browser tests.',
			date: '2026-08-03',
			updated: '2026-08-03',
			categories: ['技术'],
			tags: ['Nuxt'],
			draft: false,
			customField: { preserved: true },
		},
	}
}

function momentItem() {
	return {
		id: momentId,
		content: 'A deterministic Cycle 2 moment.',
		status: 'published',
		tags: ['生活'],
		city: 'Shanghai',
		music: null,
		media: [],
		likeCount: 2,
		liked: false,
		version: 2,
		publishedAt: '2026-08-03T08:00:00.000Z',
		createdAt: '2026-08-03T07:00:00.000Z',
		updatedAt: '2026-08-03T08:00:00.000Z',
	}
}

function newsPayload() {
	return {
		items: [
			{
				id: 'ai-hot:1',
				sourceId: 'ai-hot-items',
				kind: 'hot',
				title: 'AI HOT 站内阅读测试',
				summary: '这条 AI HOT 内容应当直接在博客内打开。',
				url: 'https://aihot.virxact.com/items/test',
				originalUrl: 'https://example.com/original',
				category: 'AI 模型',
				rank: null,
				publishedAt: '2026-08-03T08:00:00.000Z',
				fetchedAt: '2026-08-03T08:05:00.000Z',
				selected: true,
				readerPath: `/ai.news/read/${aiHotReaderKey}`,
				contentMode: 'full',
			},
			{
				id: 'station-news:https://www.zaihua.news/article/1/',
				sourceId: 'station-news',
				kind: 'rss',
				title: '站长资讯站内阅读测试',
				summary: '这条在花资讯也应当直接在博客内打开。',
				url: 'https://www.zaihua.news/article/1/',
				originalUrl: 'https://news.example.com/zaihua-original',
				category: '站长资讯',
				rank: null,
				publishedAt: '2026-08-03T07:30:00.000Z',
				fetchedAt: '2026-08-03T08:05:00.000Z',
				selected: true,
				readerPath: `/ai.news/read/${zaihuaReaderKey}`,
				contentMode: 'full',
			},
			{
				id: 'manual:external',
				sourceId: 'manual',
				kind: 'manual',
				title: '外部精选测试',
				summary: '不在白名单中的来源继续外部打开。',
				url: 'https://example.com/manual-news',
				originalUrl: 'https://example.com/manual-news',
				category: '手动精选',
				rank: null,
				publishedAt: '2026-08-03T07:00:00.000Z',
				fetchedAt: '2026-08-03T08:05:00.000Z',
				selected: true,
				readerPath: null,
				contentMode: null,
			},
		],
		total: 3,
		briefing: {
			date: '2026-08-03',
			title: 'AI 日报 · 2026-08-03',
			lead: '今日重点聚焦模型发布与开发工具。',
			content_json: JSON.stringify([{ label: '产品发布', items: [{ title: 'AI HOT 站内阅读测试', summary: '关注推理、编码和工具调用。', links: { aihot: 'https://aihot.virxact.com/items/test', original: 'https://example.com/original' } }] }]),
			source_url: 'https://aihot.virxact.com/daily/2026-08-03',
			generated_at: '2026-08-03T08:00:00.000Z',
		},
		sources: [
			{ source_id: 'ai-hot-items', status: 'success', item_count: 1, last_success_at: '2026-08-03T08:05:00.000Z', last_error: null, next_sync_at: '2026-08-03T08:35:00.000Z' },
			{ source_id: 'ai-hot-full', status: 'success', item_count: 1, last_success_at: '2026-08-03T08:05:00.000Z', last_error: null, next_sync_at: '2026-08-03T08:35:00.000Z' },
			{ source_id: 'ai-hot-daily', status: 'success', item_count: 1, last_success_at: '2026-08-03T08:05:00.000Z', last_error: null, next_sync_at: '2026-08-03T08:35:00.000Z' },
			{ source_id: 'station-news', status: 'success', item_count: 1, last_success_at: '2026-08-03T08:05:00.000Z', last_error: null, next_sync_at: '2026-08-03T09:05:00.000Z' },
		],
	}
}

function newsDocument(readerKey: string) {
	const zaihua = readerKey === zaihuaReaderKey
	const item = newsPayload().items[zaihua ? 1 : 0]
	return {
		item,
		readerKey,
		bodyText: zaihua
			? '站长正文第一段。\n\n站长正文第二段。'
			: 'AI HOT 正文第一段。\n\nAI HOT 正文第二段。',
		contentMode: 'full',
		attribution: {
			name: zaihua ? '腾讯新闻' : '官方博客',
			url: zaihua ? 'https://news.example.com/zaihua-original' : 'https://example.com/original',
		},
		sourceUrl: item.originalUrl,
		originalUrl: item.originalUrl,
		fetchedAt: item.fetchedAt,
	}
}

function mediaItems(kind: 'image' | 'audio' = 'image', status: 'active' | 'trashed' | 'deleted' = 'active') {
	if (kind === 'audio') {
		return [{
			id: 'media-audio-1',
			key: 'music/sample.mp3',
			trashKey: status === 'trashed' ? 'trash/music/sample.mp3' : null,
			url: 'https://flyovo.cc.cd/media/music/sample.mp3',
			originalName: 'sample.mp3',
			mime: 'audio/mpeg',
			size: 2048,
			kind: 'audio',
			status,
			referenceCount: 0,
			createdAt: '2026-08-03T00:00:00.000Z',
			updatedAt: '2026-08-03T00:00:00.000Z',
			trashedAt: status === 'trashed' ? '2026-08-03T01:00:00.000Z' : null,
			deletedAt: status === 'deleted' ? '2026-08-03T02:00:00.000Z' : null,
		}]
	}
	return [{
		id: 'media-1',
		key: 'articles/2026/sample.webp',
		trashKey: status === 'trashed' ? 'trash/articles/2026/sample.webp' : null,
		url: 'https://media.example/sample.webp',
		originalName: 'sample.webp',
		mime: 'image/webp',
		size: 1024,
		kind: 'image',
		status,
		referenceCount: 1,
		createdAt: '2026-08-03T00:00:00.000Z',
		updatedAt: '2026-08-03T00:00:00.000Z',
		trashedAt: status === 'trashed' ? '2026-08-03T01:00:00.000Z' : null,
		deletedAt: status === 'deleted' ? '2026-08-03T02:00:00.000Z' : null,
	}]
}

function publishRun() {
	return {
		id: 'run-1',
		kind: 'pull_request',
		status: 'preview_ready',
		repositoryRef: 'refs/heads/admin/categories-test',
		resourcePath: 'config/taxonomy/categories.json',
		commitSha: 'head-sha-1',
		pullNumber: 42,
		pullRequestUrl: 'https://github.example/pull/42',
		workflowRunId: 99,
		deploymentUrl: 'https://preview.example',
		errorCode: null,
		errorMessage: null,
		createdAt: '2026-08-03T00:00:00.000Z',
		updatedAt: '2026-08-03T00:01:00.000Z',
	}
}

function analyticsSummary() {
	return {
		pageviews: { value: 248, previousValue: 196, changePercent: 26.5 },
		visitors: { value: 91, previousValue: 78, changePercent: 16.7 },
		sessions: { value: 112, previousValue: 95, changePercent: 17.9 },
		newVisitors: { value: 34, previousValue: 29, changePercent: 17.2 },
		averageDepth: { value: 2.21, previousValue: 2.06, changePercent: 7.3 },
	}
}

function analyticsVisitors(trafficType: string | null) {
	const automated = trafficType === 'bot' || trafficType === 'suspected'
	return {
		items: [{
			eventId: automated ? 202 : 101,
			visitorId: automated ? 'bot:google' : 'visitor-8a1f',
			maskedIp: automated ? '66.249.66.xxx' : '203.0.113.xxx',
			firstSeenAt: '2026-08-04T06:10:00.000Z',
			lastSeenAt: '2026-08-04T08:30:00.000Z',
			lastPath: automated ? '/robots.txt' : '/2026/welcome',
			totalPageviews: automated ? 12 : 6,
			totalSessions: automated ? 0 : 2,
			country: 'US',
			region: 'California',
			city: 'San Francisco',
			device: automated ? 'desktop' : 'mobile',
			browser: automated ? null : 'Safari',
			os: automated ? null : 'iOS',
			trafficType: automated ? trafficType : 'human',
			isNewVisitor: !automated,
		}],
		total: 1,
		page: 1,
		pageSize: 20,
	}
}

async function respond(route: Route, options: AdminApiMockOptions, capture: AdminApiCapture, state: { sessionCalls: number }) {
	const request = route.request()
	const url = new URL(request.url())
	const method = request.method()
	const path = url.pathname

	if (path === '/api/auth/session') {
		state.sessionCalls += 1
		const authenticated = options.sessionExpiresAfterLoad && state.sessionCalls > 1
			? false
			: options.authenticated !== false
		await route.fulfill(success(authenticated
			? {
					authenticated: true,
					user: { id: '1', login: 'flyoko', avatarUrl: 'https://avatars.example/flyoko.png' },
					expiresAt: '2026-08-04T00:00:00.000Z',
				}
			: { authenticated: false }))
		return
	}

	if (path === '/api/auth/logout' && method === 'POST') {
		capture.logoutCount += 1
		await route.fulfill({ status: 204, body: '' })
		return
	}

	if (path === '/api/admin/analytics/status' && method === 'GET') {
		if (options.analyticsStatusFailure) {
			await route.fulfill(failure('UPSTREAM_UNAVAILABLE', 'Analytics status is temporarily unavailable', 503))
			return
		}
		await route.fulfill(success({
			enabled: true,
			lastEventAt: '2026-08-04T08:30:00.000Z',
			lastMaintenanceAt: '2026-08-04T07:31:00.000Z',
			rawIpRetentionDays: 30,
			eventRetentionDays: 180,
		}))
		return
	}

	if (path === '/api/admin/analytics/summary' && method === 'GET') {
		await route.fulfill(success(analyticsSummary()))
		return
	}

	if (path === '/api/admin/analytics/timeseries' && method === 'GET') {
		await route.fulfill(success([
			{ bucket: '2026-08-01', pageviews: 31, visitors: 14, sessions: 17 },
			{ bucket: '2026-08-02', pageviews: 44, visitors: 19, sessions: 21 },
			{ bucket: '2026-08-03', pageviews: 76, visitors: 28, sessions: 34 },
			{ bucket: '2026-08-04', pageviews: 97, visitors: 30, sessions: 40 },
		]))
		return
	}

	if (path === '/api/admin/analytics/realtime' && method === 'GET') {
		await route.fulfill(success({
			activeVisitors: 3,
			pageviews: 8,
			pages: [{ label: '/2026/welcome', count: 4 }, { label: '/moments', count: 3 }],
			cities: [{ label: 'San Francisco', count: 2 }, { label: 'Hangzhou', count: 1 }],
		}))
		return
	}

	if (path === '/api/admin/analytics/pages' && method === 'GET') {
		await route.fulfill(success([
			{ path: '/2026/welcome', title: '欢迎来到 fly living', pageviews: 106, visitors: 49 },
			{ path: '/moments', title: '瞬间', pageviews: 72, visitors: 31 },
		]))
		return
	}

	if (path === '/api/admin/analytics/geo' && method === 'GET') {
		await route.fulfill(success([
			{ country: 'US', region: 'California', city: 'San Francisco', pageviews: 88, visitors: 34 },
			{ country: 'CN', region: 'Zhejiang', city: 'Hangzhou', pageviews: 61, visitors: 22 },
		]))
		return
	}

	if (path === '/api/admin/analytics/devices' && method === 'GET') {
		await route.fulfill(success({
			devices: [
				{ label: 'mobile', pageviews: 132, visitors: 55 },
				{ label: 'desktop', pageviews: 101, visitors: 43 },
				{ label: 'tablet', pageviews: 15, visitors: 7 },
			],
			browsers: [{ label: 'Safari', pageviews: 116, visitors: 48 }, { label: 'Chrome', pageviews: 97, visitors: 39 }],
			operatingSystems: [{ label: 'iOS', pageviews: 102, visitors: 43 }, { label: 'macOS', pageviews: 72, visitors: 31 }],
		}))
		return
	}

	if (path === '/api/admin/analytics/visitors' && method === 'GET') {
		await route.fulfill(success(analyticsVisitors(url.searchParams.get('trafficType'))))
		return
	}

	if (path === '/api/admin/analytics/bots' && method === 'GET') {
		await route.fulfill(success([
			{ name: 'Googlebot', category: 'search', classificationSource: 'verified', pageviews: 12, lastSeenAt: '2026-08-04T08:20:00.000Z', trafficType: 'bot' },
			{ name: '可疑自动流量', category: 'score', classificationSource: 'cloudflare-score', pageviews: 4, lastSeenAt: '2026-08-04T07:55:00.000Z', trafficType: 'suspected' },
		]))
		return
	}

	if (/^\/api\/admin\/analytics\/events\/\d+\/ip$/u.test(path) && method === 'GET') {
		capture.analyticsIpViews += 1
		await route.fulfill(success({ ip: '203.0.113.42' }))
		return
	}

	if (path === '/api/admin/analytics/export' && method === 'GET') {
		capture.analyticsExports += 1
		await route.fulfill({
			status: 200,
			contentType: 'text/csv; charset=utf-8',
			headers: { 'content-disposition': 'attachment; filename="fly-living-analytics.csv"' },
			body: 'occurred_at,masked_ip,path\n2026-08-04T08:30:00.000Z,203.0.113.xxx,/2026/welcome\n',
		})
		return
	}

	if (path === '/api/admin/overview') {
		await route.fulfill(options.overviewFailure
			? failure('UPSTREAM_UNAVAILABLE', 'GitHub is temporarily unavailable', 503)
			: success({
					counts: { articles: 12, activeMedia: 8, publishedMoments: 1, publishedNews: 1, openPullRequests: 1, pendingPublishes: 0, failedPublishes: 0 },
					backupState: null,
					latestPublish: publishRun(),
					services: [
						{ service: 'github', status: 'ok', checkedAt: '2026-08-03T00:00:00.000Z' },
						{ service: 'd1', status: 'ok', checkedAt: '2026-08-03T00:00:00.000Z' },
						{ service: 'r2', status: 'ok', checkedAt: '2026-08-03T00:00:00.000Z' },
						{ service: 'pages', status: 'ok', checkedAt: '2026-08-03T00:00:00.000Z' },
					],
				}))
		return
	}

	if (path === '/api/admin/moments' && method === 'GET') {
		await route.fulfill(success({ items: [momentItem()], total: 1, page: 1, pageSize: 50 }))
		return
	}

	if (path === '/api/admin/moments' && method === 'POST') {
		capture.momentWrites.push(request.postDataJSON())
		await route.fulfill(success({ ...momentItem(), id: '22222222-2222-4222-8222-222222222222', status: 'draft', version: 1 }, 201))
		return
	}

	if (path.startsWith('/api/admin/moments/') && method === 'PUT') {
		capture.momentWrites.push(request.postDataJSON())
		await route.fulfill(success({ ...momentItem(), content: 'Updated moment', version: 3 }))
		return
	}

	if (/^\/api\/admin\/moments\/[^/]+\/(?:publish|withdraw|restore)$/u.test(path) && method === 'POST') {
		capture.momentWrites.push(request.postDataJSON())
		await route.fulfill(success({ ...momentItem(), status: path.endsWith('withdraw') ? 'withdrawn' : path.endsWith('restore') ? 'draft' : 'published', version: 3 }))
		return
	}

	if (path === '/api/admin/moment-backups' && method === 'GET') {
		await route.fulfill(success({ state: { last_success_at: '2026-08-03T08:00:00.000Z', last_backup_path: 'backups/moments/2026/08/2026-08-03.json', last_error: null }, runs: [] }))
		return
	}

	if (path === '/api/admin/moment-backups/run' && method === 'POST') {
		capture.momentBackupWrites.push({ path, body: request.postDataJSON() })
		await route.fulfill(success({ changed: false, path: 'backups/moments/2026/08/2026-08-03.json' }))
		return
	}

	if (path === '/api/admin/moment-backups/preview' && method === 'POST') {
		capture.momentBackupWrites.push({ path, body: request.postDataJSON() })
		await route.fulfill(success({ momentCount: 1, mediaCount: 0, missingMediaIds: [], canRestore: true, checksum: 'a'.repeat(64) }))
		return
	}

	if (path === '/api/admin/moment-backups/restore' && method === 'POST') {
		capture.momentBackupWrites.push({ path, body: request.postDataJSON() })
		await route.fulfill(success({ restored: 1 }))
		return
	}

	if (path === '/api/admin/about' && method === 'GET') {
		await route.fulfill(success({
			profile: {
				title: '关于我',
				summary: 'summary',
				body: 'Hello',
				date: '2026-08-03',
				sitemap: false,
				customMeta: { preserved: true },
				sha: 'about-sha',
			},
			timeline: { items: [], sha: 'timeline-sha' },
			links: { items: [], sha: 'links-sha' },
		}))
		return
	}

	if (path === '/api/admin/about/profile' && method === 'PUT') {
		capture.aboutWrites.push(request.postDataJSON())
		await route.fulfill(success({ publishRunId: 'about-run', commitSha: 'about-commit' }))
		return
	}

	if (path === '/api/admin/news' && method === 'GET') {
		await route.fulfill(success(newsPayload()))
		return
	}

	if (path === '/api/admin/news/sync' && method === 'POST') {
		capture.newsWrites.push({ action: 'sync' })
		await route.fulfill(success({ syncedAt: '2026-08-03T08:06:00.000Z', sources: [] }))
		return
	}

	if (path === '/api/admin/news/manual' && method === 'POST') {
		capture.newsWrites.push(request.postDataJSON())
		await route.fulfill(success(newsPayload().items[0], 201))
		return
	}

	if (path === '/api/moments' && method === 'GET') {
		await route.fulfill(success({ items: [momentItem()], total: 1, page: 1, pageSize: 12 }))
		return
	}

	if (path === `/api/moments/${momentId}` && method === 'GET') {
		await route.fulfill(success(momentItem()))
		return
	}

	if (path === `/api/moments/${momentId}/likes` && ['POST', 'DELETE'].includes(method)) {
		await route.fulfill(success({ liked: method === 'POST', likeCount: method === 'POST' ? 3 : 2 }))
		return
	}

	if (path === '/api/news' && method === 'GET') {
		await route.fulfill(success(newsPayload()))
		return
	}

	if (path.startsWith('/api/news/read/') && method === 'GET') {
		const readerKey = path.split('/').at(-1) || ''
		if (![aiHotReaderKey, zaihuaReaderKey].includes(readerKey)) {
			await route.fulfill(failure('NOT_FOUND', 'News document not found', 404))
			return
		}
		await route.fulfill(success(newsDocument(readerKey)))
		return
	}

	if (path === '/api/admin/weather/search' && method === 'GET') {
		await route.fulfill(success({ items: [{
			id: '30.2741:120.1551:Asia/Shanghai',
			name: '杭州',
			country: '中国',
			admin1: '浙江',
			latitude: 30.2741,
			longitude: 120.1551,
			timezone: 'Asia/Shanghai',
		}] }))
		return
	}

	if (path === '/api/admin/music/playlist' && method === 'GET') {
		await route.fulfill(success({
			sha: 'playlist-sha',
			playlist: { title: '随心听', description: '测试歌单', tracks: [] },
		}))
		return
	}

	if (path === '/api/admin/music/playlist' && method === 'PUT') {
		capture.musicWrites.push(request.postDataJSON())
		await route.fulfill(success({ publishRunId: 'music-run', commitSha: 'music-commit' }))
		return
	}

	if (path === '/api/admin/articles' && method === 'GET') {
		await route.fulfill(success({ items: [articleSummary()], total: 1, page: 1, pageSize: 20 }))
		return
	}

	if (path === '/api/admin/articles' && method === 'POST') {
		capture.articleWrites.push(request.postDataJSON())
		await route.fulfill(success({
			mode: 'direct',
			path: articlePath,
			commitSha: 'new-commit-sha',
			pullRequestNumber: null,
			pullRequestUrl: null,
			branch: 'main',
		}, 201))
		return
	}

	if (path.startsWith('/api/admin/articles/') && method === 'GET') {
		await route.fulfill(success(articleDocument()))
		return
	}

	if (path.startsWith('/api/admin/articles/') && method === 'PUT') {
		capture.articleWrites.push(request.postDataJSON())
		await route.fulfill(options.articleConflict
			? failure('CONFLICT', 'The remote article changed', 409, { currentSha: 'article-sha-2' })
			: success({ mode: 'direct', path: articlePath, commitSha: 'updated-sha', branch: 'main' }))
		return
	}

	if (path === '/api/admin/media' && method === 'GET') {
		const status = url.searchParams.get('status')
		await route.fulfill(success({
			items: mediaItems(
				url.searchParams.get('type') === 'audio' ? 'audio' : 'image',
				status === 'trashed' || status === 'deleted' ? status : 'active',
			),
			total: 1,
			page: 1,
			pageSize: 40,
		}))
		return
	}

	if (path === '/api/admin/media' && method === 'POST') {
		capture.mediaUploads += 1
		const body = request.postData() ?? ''
		capture.mediaUploadBodies.push(body)
		const uploadedName = /filename="([^"]+)"/u.exec(body)?.[1] ?? 'valid.webp'
		const musicUpload = body.includes('name="purpose"') && body.includes('music')
		await route.fulfill(success(options.mediaPartialFailure
			? [
					{ ok: true, name: 'valid.webp', media: mediaItems()[0] },
					{ ok: false, name: 'invalid.exe', error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' } },
				]
			: [{ ok: true, name: uploadedName, media: mediaItems(musicUpload ? 'audio' : 'image')[0] }]))
		return
	}

	if (path.startsWith('/api/admin/media/') && ['POST', 'DELETE'].includes(method)) {
		capture.mediaActions.push({ method, path })
		await route.fulfill(success({ updated: true }))
		return
	}

	if (path === '/api/admin/publishing/configs/modules' && method === 'GET') {
		await route.fulfill(success({
			kind: 'modules',
			path: 'config/site/modules.json',
			sha: 'module-config-main-sha',
			content: [
				{ id: 'articles', enabled: true, order: 0 },
				{ id: 'ai-news', enabled: true, order: 1 },
				{ id: 'moments', enabled: true, order: 2 },
				{ id: 'about', enabled: true, order: 3 },
				{ id: 'weather', enabled: true, order: 4 },
				{ id: 'music', enabled: true, order: 5 },
				{ id: 'links', enabled: true, order: 6 },
				{ id: 'archive', enabled: true, order: 7 },
			],
		}))
		return
	}

	if (path === '/api/admin/publishing/configs/weather' && method === 'GET') {
		await route.fulfill(success({
			kind: 'weather',
			path: 'config/site/weather.json',
			sha: 'weather-config-main-sha',
			content: {
				enabled: true,
				provider: 'open-meteo',
				city: '杭州',
				latitude: 30.2741,
				longitude: 120.1551,
				timezone: 'Asia/Shanghai',
			},
		}))
		return
	}

	if (path === '/api/admin/publishing/pull-requests' && method === 'POST') {
		capture.configWrites.push(request.postDataJSON())
		await route.fulfill(success({
			pullRequestNumber: 42,
			pullRequestUrl: 'https://github.example/pull/42',
			branch: 'admin/categories-test',
			resourcePath: 'config/taxonomy/categories.json',
		}, 201))
		return
	}

	if (path === '/api/admin/publishing/runs') {
		await route.fulfill(success({ items: [publishRun()], total: 1, page: 1, pageSize: 30 }))
		return
	}

	if (path === '/api/admin/publishing/pull-requests/42' && method === 'GET') {
		await route.fulfill(success({
			run: publishRun(),
			pullRequest: {
				number: 42,
				url: 'https://github.example/pull/42',
				headSha: 'head-sha-1',
				headBranch: 'admin/categories-test',
				baseBranch: 'main',
				state: 'open',
				mergeable: true,
			},
			files: [{
				filename: 'config/taxonomy/categories.json',
				status: 'modified',
				additions: 2,
				deletions: 1,
				changes: 3,
				patch: '@@ -1 +1 @@\n-old\n+new',
			}],
			checks: { status: 'success', total: 4, successful: 4, failed: 0, pending: 0 },
			deployment: { status: 'success', url: 'https://preview.example', environment: 'pages-preview' },
			canMerge: true,
		}))
		return
	}

	if (path === '/api/admin/publishing/pull-requests/42/merge' && method === 'POST') {
		await route.fulfill(success({ merged: true }))
		return
	}

	await route.fulfill(failure('NOT_FOUND', `No E2E mock for ${method} ${path}`, 404))
}

export async function mockAdminApi(page: Page, options: AdminApiMockOptions = {}): Promise<AdminApiCapture> {
	const capture: AdminApiCapture = {
		articleWrites: [],
		configWrites: [],
		momentWrites: [],
		momentBackupWrites: [],
		aboutWrites: [],
		newsWrites: [],
		musicWrites: [],
		mediaActions: [],
		mediaUploads: 0,
		mediaUploadBodies: [],
		logoutCount: 0,
		analyticsIpViews: 0,
		analyticsExports: 0,
	}
	const state = { sessionCalls: 0 }
	await page.route('**/api/**', route => respond(route, options, capture, state))
	return capture
}

export async function mockAuthenticatedAdmin(page: Page, options: Omit<AdminApiMockOptions, 'authenticated'> = {}) {
	return mockAdminApi(page, { ...options, authenticated: true })
}

export { articleId }
