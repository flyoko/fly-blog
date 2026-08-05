import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { CheckSummaryDto, DeploymentDto, PullRequestDto } from '../../../shared/admin/publishing'
import type { AppEnvironment, Env } from '../src/env'
import type { ArticleRepositoryPort } from '../src/features/articles/article-service'
import type { OverviewProbe } from '../src/features/overview/routes'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
	createOverviewRoutes,

} from '../src/features/overview/routes'
import { ApiError, failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & {
	DB: D1Database
	MEDIA: R2Bucket
	TEST_MIGRATIONS: D1Migration[]
}

class FakeArticleRepository implements ArticleRepositoryPort {
	constructor(
		private readonly articleCount: number,
		private readonly pullRequestState: PullRequestDto['state'] = 'open',
		private readonly pullRequestMerged = false,
	) {}

	async listFiles(prefix: string, _ref: string) {
		return Array.from({ length: this.articleCount }, (_, index) => ({
			path: `${prefix}2026/article-${index}.md`,
			sha: `sha-${index}`,
		}))
	}

	async getFile(_path: string, _ref: string): Promise<{ path: string, sha: string, content: string }> {
		throw new ApiError('NOT_FOUND', 404, 'unused')
	}

	async getBranchHead(_branch: string) {
		return 'head-sha'
	}

	async getPullRequest(number: number): Promise<PullRequestDto> {
		return {
			number,
			url: `https://github.test/pr/${number}`,
			title: `PR ${number}`,
			state: this.pullRequestState,
			headSha: 'head-sha',
			headBranch: 'admin/test',
			baseBranch: 'main',
			mergeable: this.pullRequestState === 'open',
			merged: this.pullRequestMerged,
		}
	}

	async getChecks(_ref: string): Promise<CheckSummaryDto> {
		return { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
	}

	async createFileCommit(input: Parameters<ArticleRepositoryPort['createFileCommit']>[0]) {
		return { commitSha: input.expectedHeadSha }
	}

	async getCommitChangeCount(_ref: string): Promise<number> {
		return 1
	}

	async getDeployment(ref: string): Promise<DeploymentDto> {
		return {
			id: 'deployment-1',
			ref,
			environment: 'production',
			url: 'https://production.example.test',
			status: 'success',
			updatedAt: '2026-08-03T02:00:00.000Z',
		}
	}

	async createAtomicCommit(_input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}): Promise<{ commitSha: string }> {
		throw new ApiError('FORBIDDEN', 403, 'unused')
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
		GITHUB_DEFAULT_BRANCH: 'main',
		GITHUB_APP_ID: '1',
		GITHUB_CLIENT_ID: 'client',
		GITHUB_CLIENT_SECRET: 'secret',
		GITHUB_PRIVATE_KEY: '',
		GITHUB_INSTALLATION_ID: '2',
		GITHUB_ALLOWED_LOGIN: 'flyoko',
		GITHUB_ALLOWED_USER_ID: '42',
		SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(8))),
	} as Env
}

async function createSession() {
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', 'csrf', ?, ?, ?)
	`).bind(
		await sha256Base64Url('overview-session'),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
}

function healthyProbe(service: 'github' | 'd1' | 'r2' | 'pages'): OverviewProbe {
	return async () => ({ service, status: 'ok' })
}

function createApp(input: {
	articleCount?: number
	pullRequestState?: PullRequestDto['state']
	pullRequestMerged?: boolean
	probes?: Partial<Record<'github' | 'd1' | 'r2' | 'pages', OverviewProbe>>
	timeoutMs?: number
}) {
	const repository = new FakeArticleRepository(
		input.articleCount ?? 0,
		input.pullRequestState,
		input.pullRequestMerged,
	)
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/overview', createOverviewRoutes({
		articleRepositoryFactory: () => repository,
		publishingRepositoryFactory: () => repository,
		probes: {
			github: healthyProbe('github'),
			d1: healthyProbe('d1'),
			r2: healthyProbe('r2'),
			pages: healthyProbe('pages'),
			...input.probes,
		},
		timeoutMs: input.timeoutMs,
		now: () => new Date('2026-08-03T02:00:00.000Z'),
	}))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

async function overview(app: Hono<AppEnvironment>) {
	return app.request(
		'https://blog.example.test/api/admin/overview',
		{ headers: { cookie: 'fly_admin_session=overview-session' } },
		runtimeEnv(),
	)
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM publish_runs'),
		testEnv.DB.prepare('DELETE FROM media_references'),
		testEnv.DB.prepare('DELETE FROM media_objects'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
	await createSession()
})

describe('overview counts and health', () => {
	it('returns real counts and all healthy dependencies', async () => {
		await testEnv.DB.batch([
			testEnv.DB.prepare(`
				INSERT INTO media_objects (
					id, object_key, original_name, purpose, mime_type, size_bytes,
					sha256, status, created_at
				) VALUES ('active-media', 'public/a.png', 'a.png', 'article', 'image/png', 1, ?, 'active', ?)
			`).bind('a'.repeat(64), '2026-08-03T00:00:00.000Z'),
			testEnv.DB.prepare(`
				INSERT INTO media_objects (
					id, object_key, original_name, purpose, mime_type, size_bytes,
					sha256, status, created_at
				) VALUES ('trash-media', 'trash/b.png', 'b.png', 'article', 'image/png', 1, ?, 'trashed', ?)
			`).bind('b'.repeat(64), '2026-08-03T00:00:00.000Z'),
			testEnv.DB.prepare(`
				INSERT INTO publish_runs (
					id, kind, status, repository_ref, pull_number, created_at, updated_at
				) VALUES ('pr-1', 'pull_request', 'checks_pending', 'admin/test', 1, ?, ?)
			`).bind('2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
			testEnv.DB.prepare(`
				INSERT INTO publish_runs (
					id, kind, status, repository_ref, error_code, created_at, updated_at
				) VALUES ('failed-1', 'direct', 'failed', 'main', 'UPSTREAM_FAILED', ?, ?)
			`).bind('2026-08-03T01:00:00.000Z', '2026-08-03T01:00:00.000Z'),
		])

		const response = await overview(createApp({ articleCount: 2 }))
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			data: {
				counts: {
					articles: 2,
					activeMedia: 1,
					openPullRequests: 1,
					pendingPublishes: 1,
					failedPublishes: 1,
				},
				latestPublish: { id: 'failed-1', status: 'failed' },
				services: [
					{ service: 'github', status: 'ok', checkedAt: '2026-08-03T02:00:00.000Z' },
					{ service: 'd1', status: 'ok' },
					{ service: 'r2', status: 'ok' },
					{ service: 'pages', status: 'ok' },
				],
			},
		})
	})

	it('keeps the overview available when one dependency is down', async () => {
		const response = await overview(createApp({
			articleCount: 1,
			probes: {
				r2: async () => { throw new Error('R2 unavailable') },
			},
		}))
		expect(response.status).toBe(200)
		const body = await response.json() as {
			ok: boolean
			data: { counts: { articles: number }, services: Array<Record<string, unknown>> }
		}
		expect(body).toMatchObject({
			ok: true,
			data: {
				counts: { articles: 1 },
			},
		})
		expect(body.data.services.find(service => service.service === 'r2')).toMatchObject({
			service: 'r2',
			status: 'down',
			message: 'R2 unavailable',
		})
	})

	it('reports a stale Pages deployment as degraded', async () => {
		const response = await overview(createApp({
			probes: {
				pages: async () => ({
					service: 'pages',
					status: 'degraded',
					message: 'Latest successful deployment is stale',
				}),
			},
		}))
		const body = await response.json() as { data: { services: Array<Record<string, unknown>> } }
		expect(body.data.services.find(service => service.service === 'pages')).toMatchObject({
			service: 'pages',
			status: 'degraded',
			message: 'Latest successful deployment is stale',
		})
	})

	it('returns a truthful zero-content state', async () => {
		const response = await overview(createApp({ articleCount: 0 }))
		expect(await response.json()).toMatchObject({
			data: {
				counts: {
					articles: 0,
					activeMedia: 0,
					openPullRequests: 0,
					pendingPublishes: 0,
					failedPublishes: 0,
				},
				latestPublish: null,
			},
		})
	})

	it('reconciles closed pull requests before counting pending work', async () => {
		await testEnv.DB.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, pull_number, created_at, updated_at
			) VALUES ('closed-pr', 'pull_request', 'checks_pending', 'admin/test', 8, ?, ?)
		`).bind('2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z').run()

		const response = await overview(createApp({ pullRequestState: 'closed' }))
		expect(await response.json()).toMatchObject({
			data: {
				counts: {
					openPullRequests: 0,
					pendingPublishes: 0,
				},
				latestPublish: { id: 'closed-pr', status: 'closed' },
			},
		})
		expect(await testEnv.DB.prepare('SELECT status FROM publish_runs WHERE id = ?')
			.bind('closed-pr')
			.first<{ status: string }>()).toEqual({ status: 'closed' })
	})

	it('bounds a hanging upstream probe without failing other probes', async () => {
		const response = await overview(createApp({
			timeoutMs: 10,
			probes: {
				github: async () => new Promise(() => {}),
			},
		}))
		expect(response.status).toBe(200)
		const body = await response.json() as { data: { services: Array<Record<string, unknown>> } }
		expect(body.data.services.find(service => service.service === 'github')).toMatchObject({
			service: 'github',
			status: 'down',
			message: 'Timed out after 10ms',
		})
		expect(body.data.services.find(service => service.service === 'd1')).toMatchObject({
			service: 'd1',
			status: 'ok',
		})
	})
})
