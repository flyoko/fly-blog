import type { Page, Route } from '@playwright/test'
import { encodeArticleId } from '../../shared/admin/articles'

export interface AdminApiMockOptions {
	authenticated?: boolean
	overviewFailure?: boolean
	articleConflict?: boolean
	mediaPartialFailure?: boolean
	sessionExpiresAfterLoad?: boolean
}

export interface AdminApiCapture {
	articleWrites: Array<Record<string, unknown>>
	configWrites: Array<Record<string, unknown>>
	momentWrites: Array<Record<string, unknown>>
	aboutWrites: Array<Record<string, unknown>>
	newsWrites: Array<Record<string, unknown>>
	mediaUploads: number
	logoutCount: number
}

const momentId = '11111111-1111-4111-8111-111111111111'

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
		items: [{
			id: 'ai-hot:1',
			sourceId: 'ai-hot-topics',
			kind: 'hot',
			title: 'AI HOT test item',
			summary: null,
			url: 'https://example.com/hot',
			originalUrl: 'https://example.com/original',
			category: 'AI 热点',
			rank: 1,
			publishedAt: '2026-08-03T08:00:00.000Z',
			fetchedAt: '2026-08-03T08:05:00.000Z',
			selected: true,
		}],
		total: 1,
		briefing: { date: '2026-08-03', title: 'AI 日报 · 2026-08-03', lead: 'Daily lead', content_json: '[]', source_url: 'https://aihot.example/daily', generated_at: '2026-08-03T08:00:00.000Z' },
		sources: [{ source_id: 'ai-hot-topics', status: 'success', item_count: 1, last_success_at: '2026-08-03T08:05:00.000Z', last_error: null }],
	}
}

function mediaItems() {
	return [{
		id: 'media-1',
		key: 'articles/2026/sample.webp',
		trashKey: null,
		url: 'https://media.example/sample.webp',
		originalName: 'sample.webp',
		mime: 'image/webp',
		size: 1024,
		kind: 'image',
		status: 'active',
		referenceCount: 1,
		createdAt: '2026-08-03T00:00:00.000Z',
		updatedAt: '2026-08-03T00:00:00.000Z',
		trashedAt: null,
		deletedAt: null,
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
		await route.fulfill(success({ changed: false, path: 'backups/moments/2026/08/2026-08-03.json' }))
		return
	}

	if (path === '/api/admin/moment-backups/preview' && method === 'POST') {
		await route.fulfill(success({ momentCount: 1, mediaCount: 0, missingMediaIds: [], canRestore: true, checksum: 'a'.repeat(64) }))
		return
	}

	if (path === '/api/admin/moment-backups/restore' && method === 'POST') {
		await route.fulfill(success({ restored: 1 }))
		return
	}

	if (path === '/api/admin/about' && method === 'GET') {
		await route.fulfill(success({ profile: { title: '关于我', summary: 'summary', body: 'Hello', sha: 'about-sha' }, timeline: { items: [], sha: 'timeline-sha' }, links: { items: [], sha: 'links-sha' } }))
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
		await route.fulfill(success({ items: mediaItems(), total: 1, page: 1, pageSize: 40 }))
		return
	}

	if (path === '/api/admin/media' && method === 'POST') {
		capture.mediaUploads += 1
		await route.fulfill(success(options.mediaPartialFailure
			? [
					{ ok: true, name: 'valid.webp', media: mediaItems()[0] },
					{ ok: false, name: 'invalid.exe', error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported media type' } },
				]
			: [{ ok: true, name: 'valid.webp', media: mediaItems()[0] }]))
		return
	}

	if (path.startsWith('/api/admin/media/') && ['POST', 'DELETE'].includes(method)) {
		await route.fulfill(success({ updated: true }))
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
	const capture: AdminApiCapture = { articleWrites: [], configWrites: [], momentWrites: [], aboutWrites: [], newsWrites: [], mediaUploads: 0, logoutCount: 0 }
	const state = { sessionCalls: 0 }
	await page.route('**/api/**', route => respond(route, options, capture, state))
	return capture
}

export async function mockAuthenticatedAdmin(page: Page, options: Omit<AdminApiMockOptions, 'authenticated'> = {}) {
	return mockAdminApi(page, { ...options, authenticated: true })
}

export { articleId }
