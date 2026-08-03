import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { ArticleRepositoryPort } from '../src/features/articles/routes'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { encodeArticleId } from '../../../shared/admin/articles'
import { createArticleRoutes } from '../src/features/articles/routes'
import { ApiError, failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & {
	DB: D1Database
	MEDIA: R2Bucket
	TEST_MIGRATIONS: D1Migration[]
}

const categories = JSON.stringify([
	{ name: '未分类', icon: 'tabler:circle-dashed' },
	{ name: '技术', icon: 'tabler:mouse', color: '#33aaff' },
])

function articleSource(input: {
	title: string
	category?: string
	draft?: boolean
	body?: string
}) {
	return `---\ntitle: ${input.title}\ncategories:\n  - ${input.category ?? '技术'}\ntags: []\ndate: 2026-08-03\ndraft: ${input.draft ?? false}\n---\n${input.body ?? `# ${input.title}`}\n`
}

class FakeArticleRepository implements ArticleRepositoryPort {
	files = new Map<string, { sha: string, content: string }>([
		['config/taxonomy/categories.json', { sha: 'categories-sha', content: categories }],
		['content/posts/2026/alpha.md', { sha: 'alpha-sha', content: articleSource({ title: 'Alpha' }) }],
		['content/posts/2026/beta.md', { sha: 'beta-sha', content: articleSource({ title: 'Beta', draft: true }) }],
	])

	head = 'head-1'
	commitCalls = 0
	failCommit = false

	async listFiles(prefix: string) {
		return Array.from(this.files.entries())
			.filter(([path]) => path.startsWith(prefix))
			.map(([path, value]) => ({ path, sha: value.sha }))
	}

	async getFile(path: string) {
		const file = this.files.get(path)
		if (!file)
			throw new ApiError('NOT_FOUND', 404, 'missing')
		return { path, sha: file.sha, content: file.content }
	}

	async getBranchHead() {
		return this.head
	}

	async createAtomicCommit(input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}) {
		this.commitCalls++
		if (this.failCommit)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub unavailable')
		if (input.expectedHeadSha !== this.head)
			throw new ApiError('CONFLICT', 409, 'head changed')
		const commitSha = `commit-${this.commitCalls}`
		for (const file of input.files) {
			if (file.content === null)
				this.files.delete(file.path)
			else
				this.files.set(file.path, { sha: commitSha, content: file.content })
		}
		this.head = commitSha
		return { commitSha }
	}
}

function rateLimiter(): RateLimit {
	return { limit: async () => ({ success: true }) } as RateLimit
}

function runtimeEnv(): Env {
	return {
		...testEnv,
		AUTH_RATE_LIMITER: rateLimiter(),
		WRITE_RATE_LIMITER: rateLimiter(),
		PUBLIC_ORIGIN: 'https://blog.example.test',
		PAGES_ORIGIN: 'https://pages.example.test',
		MEDIA_ORIGIN: 'https://media.example.test',
		GITHUB_API_BASE_URL: 'https://api.github.test',
		GITHUB_OAUTH_BASE_URL: 'https://github.test',
		GITHUB_OWNER: 'flyoko',
		GITHUB_REPO: 'fly-blog',
		GITHUB_DEFAULT_BRANCH: 'setup/personalize',
		GITHUB_APP_ID: '1',
		GITHUB_CLIENT_ID: 'client',
		GITHUB_CLIENT_SECRET: 'secret',
		GITHUB_PRIVATE_KEY: '',
		GITHUB_INSTALLATION_ID: '2',
		GITHUB_ALLOWED_LOGIN: 'flyoko',
		GITHUB_ALLOWED_USER_ID: '42',
		SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(5))),
	} as Env
}

async function createSession() {
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
	`).bind(
		await sha256Base64Url('article-session'),
		await sha256Base64Url('article-csrf'),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
}

function headers(write = false) {
	return {
		cookie: 'fly_admin_session=article-session',
		...(write
			? { 'origin': 'https://blog.example.test', 'x-csrf-token': 'article-csrf' }
			: {}),
	}
}

function createApp(repository: FakeArticleRepository) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/articles', createArticleRoutes({ repositoryFactory: () => repository }))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM media_references'),
		testEnv.DB.prepare('DELETE FROM publish_runs'),
		testEnv.DB.prepare('DELETE FROM idempotency_keys'),
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
	await createSession()
})

describe('article list and read routes', () => {
	it('filters drafts and paginates summaries', async () => {
		const response = await createApp(new FakeArticleRepository()).request(
			'https://blog.example.test/api/admin/articles?page=1&pageSize=1&query=beta&category=技术&draft=true',
			{ headers: headers() },
			runtimeEnv(),
		)
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			data: { page: 1, pageSize: 1, total: 1, items: [{ title: 'Beta', draft: true }] },
		})
	})

	it('reads an article by encoded repository path', async () => {
		const id = encodeArticleId('content/posts/2026/alpha.md')
		const response = await createApp(new FakeArticleRepository()).request(
			`https://blog.example.test/api/admin/articles/${id}`,
			{ headers: headers() },
			runtimeEnv(),
		)
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			data: { path: 'content/posts/2026/alpha.md', sha: 'alpha-sha', frontmatter: { title: 'Alpha' } },
		})
	})
})

describe('article validation and publishing routes', () => {
	it('rejects missing categories and paths outside content/posts', async () => {
		const app = createApp(new FakeArticleRepository())
		const missingCategory = await app.request('https://blog.example.test/api/admin/articles/validate', {
			method: 'POST',
			headers: headers(true),
			body: JSON.stringify({
				path: 'content/posts/2026/new.md',
				sha: null,
				body: '# New',
				frontmatter: { title: 'New', categories: ['不存在'], tags: [] },
			}),
		}, runtimeEnv())
		expect(missingCategory.status).toBe(400)
		expect(await missingCategory.json()).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })

		const invalidPath = await app.request('https://blog.example.test/api/admin/articles', {
			method: 'POST',
			headers: { ...headers(true), 'content-type': 'application/json' },
			body: JSON.stringify({
				document: { path: '../secret.md', sha: null, body: '', frontmatter: { title: 'Bad' } },
				expectedSha: null,
				mode: 'direct',
				idempotencyKey: 'invalid-path-1',
			}),
		}, runtimeEnv())
		expect(invalidPath.status).toBe(400)
	})

	it('publishes a new article once for duplicate idempotency keys and synchronizes a publish run', async () => {
		const repository = new FakeArticleRepository()
		const app = createApp(repository)
		const request = () => app.request('https://blog.example.test/api/admin/articles', {
			method: 'POST',
			headers: { ...headers(true), 'content-type': 'application/json' },
			body: JSON.stringify({
				document: {
					path: 'content/posts/2026/new.md',
					sha: null,
					body: '# New',
					frontmatter: { title: 'New', categories: ['技术'], tags: [] },
				},
				expectedSha: null,
				mode: 'direct',
				idempotencyKey: 'article-create-1',
			}),
		}, runtimeEnv())

		const first = await request()
		expect(first.status).toBe(201)
		const firstData = (await first.json() as { data: unknown }).data
		const second = await request()
		expect(second.status).toBe(201)
		expect((await second.json() as { data: unknown }).data).toEqual(firstData)
		expect(repository.commitCalls).toBe(1)
		const run = await testEnv.DB.prepare('SELECT status, commit_sha FROM publish_runs').first<{ status: string, commit_sha: string }>()
		expect(run).toEqual({ status: 'checks_pending', commit_sha: 'commit-1' })
	})

	it('rejects a stale file SHA before committing', async () => {
		const repository = new FakeArticleRepository()
		const id = encodeArticleId('content/posts/2026/alpha.md')
		const response = await createApp(repository).request(`https://blog.example.test/api/admin/articles/${id}`, {
			method: 'PUT',
			headers: { ...headers(true), 'content-type': 'application/json' },
			body: JSON.stringify({
				document: {
					path: 'content/posts/2026/alpha.md',
					sha: 'stale-sha',
					body: '# Changed',
					frontmatter: { title: 'Changed', categories: ['技术'], tags: [] },
				},
				expectedSha: 'stale-sha',
				mode: 'direct',
				idempotencyKey: 'article-update-1',
			}),
		}, runtimeEnv())
		expect(response.status).toBe(409)
		expect(repository.commitCalls).toBe(0)
	})

	it('records an upstream GitHub failure without leaking it as success', async () => {
		const repository = new FakeArticleRepository()
		repository.failCommit = true
		const response = await createApp(repository).request('https://blog.example.test/api/admin/articles', {
			method: 'POST',
			headers: { ...headers(true), 'content-type': 'application/json' },
			body: JSON.stringify({
				document: {
					path: 'content/posts/2026/fail.md',
					sha: null,
					body: '# Fail',
					frontmatter: { title: 'Fail', categories: ['技术'], tags: [] },
				},
				expectedSha: null,
				mode: 'direct',
				idempotencyKey: 'article-failure-1',
			}),
		}, runtimeEnv())
		expect(response.status).toBe(502)
		const run = await testEnv.DB.prepare('SELECT status, error_code FROM publish_runs').first<{ status: string, error_code: string }>()
		expect(run).toEqual({ status: 'failed', error_code: 'UPSTREAM_FAILED' })
	})
})
