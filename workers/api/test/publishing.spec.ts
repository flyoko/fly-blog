import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { ArticleDocument } from '../../../shared/admin/articles'
import type { CheckSummaryDto, DeploymentDto, PullRequestDto, PullRequestFileDto } from '../../../shared/admin/publishing'
import type { AppEnvironment, Env } from '../src/env'
import type { PublishingRepositoryPort } from '../src/features/publishing/publishing-service'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serializeArticle } from '../src/features/articles/article-codec'
import {

	PublishingService,
} from '../src/features/publishing/publishing-service'
import { createPublishingRoutes } from '../src/features/publishing/routes'
import { ApiError, failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & {
	DB: D1Database
	TEST_MIGRATIONS: D1Migration[]
}

const categoryConfig = [
	{ name: '未分类', icon: 'tabler:circle-dashed' },
	{ name: '技术', icon: 'tabler:mouse', color: '#33aaff' },
]

class FakePublishingRepository implements PublishingRepositoryPort {
	baseHead = 'base-head'
	commitCounter = 0
	atomicCommitCalls = 0
	fileCommitInputs: Array<Parameters<PublishingRepositoryPort['createFileCommit']>[0]> = []
	commitChangeCount = 1
	pullCounter = 0
	mergeCalls = 0
	pullReadFailure = false
	branches = new Map<string, string>()
	committedPaths: string[] = []
	pulls = new Map<number, PullRequestDto>()
	checks: CheckSummaryDto = { status: 'pending', total: 1, successful: 0, failed: 0, pending: 1 }
	deployment: DeploymentDto | null = null
	checkRefs: string[] = []
	deploymentRefs: string[] = []
	files = new Map<string, { sha: string, content: string }>([
		['config/site/article.json', { sha: 'article-config-sha', content: JSON.stringify({ headerAds: [] }) }],
		['config/taxonomy/categories.json', { sha: 'category-sha', content: JSON.stringify(categoryConfig) }],
		['config/site/modules.json', {
			sha: 'modules-sha',
			content: JSON.stringify([
				{ id: 'articles', enabled: true, order: 0 },
				{ id: 'ai-news', enabled: true, order: 1 },
				{ id: 'moments', enabled: true, order: 2 },
				{ id: 'about', enabled: true, order: 3 },
				{ id: 'weather', enabled: true, order: 4 },
				{ id: 'music', enabled: true, order: 5 },
				{ id: 'links', enabled: true, order: 6 },
				{ id: 'archive', enabled: true, order: 7 },
			]),
		}],
		['content/posts/2026/existing.md', {
			sha: 'article-sha',
			content: '---\ntitle: Existing\ncategories:\n  - 技术\ntags: []\n---\n# Existing\n',
		}],
	])

	changedFiles: PullRequestFileDto[] = [{
		filename: 'config/taxonomy/categories.json',
		status: 'modified',
		additions: 2,
		deletions: 1,
		changes: 3,
		patch: '@@ -1 +1 @@\n-old\n+new',
	}]

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

	async getBranchHead(branch: string) {
		return this.branches.get(branch) ?? this.baseHead
	}

	async createBranch(input: { name: string, fromSha: string }) {
		if (this.branches.has(input.name))
			throw new ApiError('CONFLICT', 409, 'branch exists')
		this.branches.set(input.name, input.fromSha)
	}

	async createAtomicCommit(input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}) {
		this.atomicCommitCalls++
		if (this.branches.get(input.branch) !== input.expectedHeadSha)
			throw new ApiError('CONFLICT', 409, 'branch changed')
		this.commitCounter++
		const sha = `commit-${this.commitCounter}`
		this.branches.set(input.branch, sha)
		for (const file of input.files) {
			this.committedPaths.push(file.path)
			if (file.content !== null)
				this.files.set(file.path, { sha, content: file.content })
		}
		return { commitSha: sha }
	}

	async createFileCommit(input: Parameters<PublishingRepositoryPort['createFileCommit']>[0]) {
		this.fileCommitInputs.push(input)
		return this.createAtomicCommit({
			branch: input.branch,
			expectedHeadSha: input.expectedHeadSha,
			message: input.message,
			files: [{ path: input.path, content: input.content }],
		})
	}

	async createPullRequest(input: { head: string, base: string, title: string, body: string }) {
		this.pullCounter++
		const number = this.pullCounter
		this.pulls.set(number, {
			number,
			url: `https://github.test/pr/${number}`,
			title: input.title,
			state: 'open',
			headSha: this.branches.get(input.head)!,
			headBranch: input.head,
			baseBranch: input.base,
			mergeable: true,
			merged: false,
		})
		return { number, url: `https://github.test/pr/${number}` }
	}

	async getPullRequest(number: number) {
		if (this.pullReadFailure)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub unavailable')
		const pull = this.pulls.get(number)
		if (!pull)
			throw new ApiError('NOT_FOUND', 404, 'missing PR')
		return pull
	}

	async getPullRequestFiles() {
		return this.changedFiles
	}

	async getChecks(ref: string) {
		this.checkRefs.push(ref)
		return this.checks
	}

	async getCommitChangeCount() {
		return this.commitChangeCount
	}

	async getDeployment(ref: string) {
		this.deploymentRefs.push(ref)
		return this.deployment
	}

	async mergePullRequest(number: number, expectedHeadSha: string) {
		const pull = await this.getPullRequest(number)
		if (pull.headSha !== expectedHeadSha)
			throw new ApiError('CONFLICT', 409, 'stale head')
		this.mergeCalls++
		pull.merged = true
		pull.state = 'closed'
		return { merged: true, sha: `merged-${number}` }
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
		SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(6))),
	} as Env
}

async function createSession() {
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
	`).bind(
		await sha256Base64Url('publishing-session'),
		await sha256Base64Url('publishing-csrf'),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
}

function headers() {
	return {
		'cookie': 'fly_admin_session=publishing-session',
		'origin': 'https://blog.example.test',
		'x-csrf-token': 'publishing-csrf',
		'content-type': 'application/json',
	}
}

function createApp(repository: FakePublishingRepository) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/publishing', createPublishingRoutes({ repositoryFactory: () => repository }))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM publish_runs'),
		testEnv.DB.prepare('DELETE FROM idempotency_keys'),
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
	await createSession()
})

describe('configuration pull requests', () => {
	it('reads the production-branch module config for admin refresh', async () => {
		const repository = new FakePublishingRepository()
		const response = await createApp(repository).request('https://blog.example.test/api/admin/publishing/configs/modules', {
			headers: { cookie: 'fly_admin_session=publishing-session' },
		}, runtimeEnv())

		expect(response.status).toBe(200)
		const payload = await response.json() as {
			ok: boolean
			data: { kind: string, path: string, sha: string, content: unknown[] }
		}
		expect(payload).toMatchObject({
			ok: true,
			data: {
				kind: 'modules',
				path: 'config/site/modules.json',
				sha: 'modules-sha',
			},
		})
		expect(payload.data.content.slice(0, 2)).toEqual([
			{ id: 'articles', enabled: true, order: 0 },
			{ id: 'ai-news', enabled: true, order: 1 },
		])
	})

	it('reads and writes article header ads through the fixed repository path', async () => {
		const repository = new FakePublishingRepository()
		const app = createApp(repository)
		const read = await app.request('https://blog.example.test/api/admin/publishing/configs/article', {
			headers: { cookie: 'fly_admin_session=publishing-session' },
		}, runtimeEnv())
		expect(read.status).toBe(200)
		expect(await read.json()).toMatchObject({
			ok: true,
			data: { kind: 'article', path: 'config/site/article.json', content: { headerAds: [] } },
		})

		const write = await app.request('https://blog.example.test/api/admin/publishing/pull-requests', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({
				kind: 'article',
				content: { headerAds: [{ id: 'promo', enabled: true, label: '广告', title: '推荐服务', description: '', image: '', href: 'https://example.com' }] },
				expectedHeadSha: 'base-head',
				idempotencyKey: 'article-config-pr-one',
			}),
		}, runtimeEnv())
		expect(write.status).toBe(201)
		expect(await write.json()).toMatchObject({
			ok: true,
			data: { resourcePath: 'config/site/article.json' },
		})
		expect(repository.committedPaths).toEqual(['config/site/article.json'])
		expect(repository.fileCommitInputs).toEqual([])
		expect(repository.atomicCommitCalls).toBe(1)
	})

	it('maps allowed config keys to fixed paths, creates unique branches, and replays duplicates', async () => {
		const repository = new FakePublishingRepository()
		const app = createApp(repository)
		const create = (key: string) => app.request('https://blog.example.test/api/admin/publishing/pull-requests', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({
				kind: 'categories',
				content: categoryConfig,
				expectedHeadSha: 'base-head',
				title: '更新分类',
				body: '后台配置变更',
				idempotencyKey: key,
			}),
		}, runtimeEnv())

		const first = await create('config-pr-one')
		expect(first.status).toBe(201)
		const firstData = (await first.json() as { data: { branch: string, resourcePath: string } }).data
		expect(firstData.resourcePath).toBe('config/taxonomy/categories.json')
		expect(firstData.branch).toMatch(/^admin\/categories\/\d{8}-\d{6}-[a-z0-9]{6}$/u)
		const replay = await create('config-pr-one')
		expect((await replay.json() as { data: unknown }).data).toEqual(firstData)
		expect(repository.pullCounter).toBe(1)

		const second = await create('config-pr-two')
		const secondData = (await second.json() as { data: { branch: string } }).data
		expect(secondData.branch).not.toBe(firstData.branch)
		expect(repository.committedPaths).toEqual([
			'config/taxonomy/categories.json',
			'config/taxonomy/categories.json',
		])
	})

	it('rejects arbitrary config paths and invalid content before GitHub mutation', async () => {
		const repository = new FakePublishingRepository()
		const response = await createApp(repository).request('https://blog.example.test/api/admin/publishing/pull-requests', {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({
				kind: '../../secret',
				path: 'secrets.txt',
				content: {},
				idempotencyKey: 'config-pr-invalid',
			}),
		}, runtimeEnv())
		expect(response.status).toBe(400)
		expect(repository.commitCounter).toBe(0)
	})
})

describe('pull request status and merge guard', () => {
	async function createRun(repository: FakePublishingRepository) {
		const service = new PublishingService(runtimeEnv(), repository)
		return service.publishConfig({
			kind: 'categories',
			content: categoryConfig,
			expectedHeadSha: 'base-head',
			title: '更新分类',
			body: '',
			idempotencyKey: `run-${crypto.randomUUID()}`,
			actor: { id: '42', login: 'flyoko', requestId: 'request-1' },
		})
	}

	it('returns checks and missing-preview state without merging', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.checks = { status: 'failure', total: 1, successful: 0, failed: 1, pending: 0 }
		const app = createApp(repository)
		const detail = await app.request(`https://blog.example.test/api/admin/publishing/pull-requests/${run.pullRequestNumber}`, {
			headers: { cookie: 'fly_admin_session=publishing-session' },
		}, runtimeEnv())
		expect(await detail.json()).toMatchObject({
			ok: true,
			data: {
				files: [{
					filename: 'config/taxonomy/categories.json',
					status: 'modified',
					additions: 2,
					deletions: 1,
					patch: '@@ -1 +1 @@\n-old\n+new',
				}],
				checks: { status: 'failure' },
				deployment: null,
				canMerge: false,
			},
		})
		const merge = await app.request(`https://blog.example.test/api/admin/publishing/pull-requests/${run.pullRequestNumber}/merge`, {
			method: 'POST',
			headers: headers(),
			body: JSON.stringify({ expectedHeadSha: run.headSha }),
		}, runtimeEnv())
		expect(await merge.json()).toMatchObject({ ok: true, data: { merged: false, reason: 'checks_failed' } })
		expect(repository.mergeCalls).toBe(0)
	})

	it('marks an open pull request failed when repository checks fail', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.checks = {
			status: 'failure',
			total: 1,
			successful: 0,
			failed: 1,
			pending: 0,
			diagnostics: [{ checkName: 'deploy-preview', message: 'Markdown 格式错误', bodyLine: 7, bodyColumn: 16 }],
		}

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)

		expect(list.items[0]).toMatchObject({
			id: run.publishRunId,
			status: 'failed',
			errorCode: 'CHECKS_FAILED',
			errorMessage: 'Markdown 格式错误（第 7 行，第 16 列）',
		})
		expect(repository.checkRefs).toEqual([run.headSha])
		expect(repository.deploymentRefs).toEqual([run.branch])
	})

	it('marks an open pull request ready when checks and preview succeed', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		repository.deployment = {
			id: 'preview-deployment',
			ref: run.branch,
			environment: 'Preview',
			url: 'https://preview.example.test/run',
			status: 'success',
			updatedAt: '2026-08-05T12:00:00.000Z',
		}

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)

		expect(list.items[0]).toMatchObject({
			id: run.publishRunId,
			status: 'preview_ready',
			deploymentUrl: 'https://preview.example.test/run',
			errorCode: null,
			errorMessage: null,
		})
	})

	it('recovers a failed pull request after checks and preview succeed', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.checks = { status: 'failure', total: 1, successful: 0, failed: 1, pending: 0 }
		const service = new PublishingService(runtimeEnv(), repository)
		await service.listRuns(1, 30)

		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		repository.deployment = {
			id: 'preview-recovered',
			ref: run.branch,
			environment: 'Preview',
			url: 'https://preview.example.test/recovered',
			status: 'success',
			updatedAt: '2026-08-05T12:05:00.000Z',
		}

		const recovered = await service.listRuns(1, 30)

		expect(recovered.items[0]).toMatchObject({
			id: run.publishRunId,
			status: 'preview_ready',
			deploymentUrl: 'https://preview.example.test/recovered',
			errorCode: null,
			errorMessage: null,
		})
	})

	it('reconciles a closed pull request in list and detail responses', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		const pull = repository.pulls.get(run.pullRequestNumber)!
		pull.state = 'closed'
		pull.mergeable = false

		const service = new PublishingService(runtimeEnv(), repository)
		const list = await service.listRuns(1, 30)
		expect(list.items[0]).toMatchObject({
			id: run.publishRunId,
			status: 'closed',
		})
		const detail = await service.getPullRequestDetail(run.pullRequestNumber)
		expect(detail).toMatchObject({
			run: { status: 'closed' },
			canMerge: false,
			reason: 'pull_request_closed',
		})
		expect(await testEnv.DB.prepare('SELECT status FROM publish_runs WHERE id = ?')
			.bind(run.publishRunId)
			.first<{ status: string }>()).toEqual({ status: 'closed' })
	})

	it('reconciles successful direct publishes using checks and the exact commit deployment', async () => {
		const repository = new FakePublishingRepository()
		const commitSha = 'd'.repeat(40)
		await testEnv.DB.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, resource_path, commit_sha, created_at, updated_at
			) VALUES ('direct-success', 'direct', 'checks_pending', 'main', 'content/about/profile.md', ?, ?, ?)
		`).bind(commitSha, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:01.000Z').run()
		repository.checks = { status: 'failure', total: 2, successful: 1, failed: 1, pending: 0 }
		repository.deployment = {
			id: 'production-deployment',
			ref: 'main',
			environment: 'production',
			url: 'https://production.example.test',
			status: 'success',
			updatedAt: '2026-08-03T00:05:00.000Z',
		}

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)
		expect(list.items[0]).toMatchObject({
			id: 'direct-success',
			status: 'published',
			deploymentUrl: 'https://production.example.test',
		})
		expect(repository.checkRefs).toEqual([commitSha])
		expect(repository.deploymentRefs).toEqual([commitSha])
		expect(await testEnv.DB.prepare('SELECT status, deployment_url, error_code FROM publish_runs WHERE id = ?')
			.bind('direct-success')
			.first()).toEqual({
			status: 'published',
			deployment_url: 'https://production.example.test',
			error_code: null,
		})
	})

	it('recovers a direct publish that was marked failed before its deployment succeeded', async () => {
		const repository = new FakePublishingRepository()
		const commitSha = 'c'.repeat(40)
		await testEnv.DB.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, resource_path, commit_sha,
				deployment_url, error_code, error_message, created_at, updated_at
			) VALUES (
				'direct-recovered', 'direct', 'failed', 'main', 'content/about/profile.md', ?,
				'https://github.test/failed-job', 'CHECKS_FAILED', 'Repository checks failed', ?, ?
			)
		`).bind(commitSha, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:01.000Z').run()
		repository.checks = { status: 'pending', total: 2, successful: 1, failed: 0, pending: 1 }
		repository.deployment = {
			id: 'production-deployment',
			ref: 'main',
			environment: 'production',
			url: 'https://production.example.test',
			status: 'success',
			updatedAt: '2026-08-03T00:05:00.000Z',
		}

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)
		expect(list.items[0]).toMatchObject({
			id: 'direct-recovered',
			status: 'published',
			deploymentUrl: 'https://production.example.test',
			errorCode: null,
			errorMessage: null,
		})
		expect(await testEnv.DB.prepare('SELECT status, deployment_url, error_code, error_message FROM publish_runs WHERE id = ?')
			.bind('direct-recovered')
			.first()).toEqual({
			status: 'published',
			deployment_url: 'https://production.example.test',
			error_code: null,
			error_message: null,
		})
	})

	it('treats a no-change direct commit as complete when no workflows are triggered', async () => {
		const repository = new FakePublishingRepository()
		const commitSha = 'f'.repeat(40)
		await testEnv.DB.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, resource_path, commit_sha, created_at, updated_at
			) VALUES ('direct-no-change', 'direct', 'checks_pending', 'main', 'content/playlists/default.json', ?, ?, ?)
		`).bind(commitSha, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:01.000Z').run()
		repository.checks = { status: 'success', total: 0, successful: 0, failed: 0, pending: 0 }
		repository.commitChangeCount = 0

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)
		expect(list.items[0]).toMatchObject({ id: 'direct-no-change', status: 'published', deploymentUrl: null })
	})

	it('marks a direct publish failed when repository checks fail', async () => {
		const repository = new FakePublishingRepository()
		const commitSha = 'e'.repeat(40)
		await testEnv.DB.prepare(`
			INSERT INTO publish_runs (
				id, kind, status, repository_ref, resource_path, commit_sha, created_at, updated_at
			) VALUES ('direct-failed', 'direct', 'checks_pending', 'main', 'content/playlists/default.json', ?, ?, ?)
		`).bind(commitSha, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:01.000Z').run()
		repository.checks = { status: 'failure', total: 2, successful: 1, failed: 1, pending: 0 }

		const list = await new PublishingService(runtimeEnv(), repository).listRuns(1, 30)
		expect(list.items[0]).toMatchObject({
			id: 'direct-failed',
			status: 'failed',
			errorCode: 'CHECKS_FAILED',
		})
		expect(await testEnv.DB.prepare('SELECT status, error_code, error_message FROM publish_runs WHERE id = ?')
			.bind('direct-failed')
			.first()).toEqual({
			status: 'failed',
			error_code: 'CHECKS_FAILED',
			error_message: 'Repository checks failed',
		})
	})

	it('keeps the run list available when GitHub status refresh fails', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.pullReadFailure = true

		await expect(new PublishingService(runtimeEnv(), repository).listRuns(1, 30)).resolves.toMatchObject({
			items: [{ id: run.publishRunId, status: 'checks_pending' }],
		})
	})

	it('blocks merge when a PR contains an extra file', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.changedFiles.push({
			filename: 'content/unexpected.md',
			status: 'added',
			additions: 1,
			deletions: 0,
			changes: 1,
			patch: '+unexpected',
		})
		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		repository.deployment = {
			id: 'deployment-extra-file',
			ref: run.headSha,
			environment: 'Preview',
			url: 'https://preview.example.test/extra-file',
			status: 'success',
			updatedAt: '2026-08-03T01:00:00.000Z',
		}

		await expect(new PublishingService(runtimeEnv(), repository).mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-extra-file',
		})).resolves.toEqual({ merged: false, reason: 'unexpected_files' })
		expect(repository.mergeCalls).toBe(0)
	})

	it('blocks merge when the only changed file does not match the run resource path', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.changedFiles[0] = { ...repository.changedFiles[0]!, filename: 'config/site/footer.json' }
		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		repository.deployment = {
			id: 'deployment-mismatched-file',
			ref: run.headSha,
			environment: 'Preview',
			url: 'https://preview.example.test/mismatched-file',
			status: 'success',
			updatedAt: '2026-08-03T01:00:00.000Z',
		}

		await expect(new PublishingService(runtimeEnv(), repository).mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-mismatched-file',
		})).resolves.toEqual({ merged: false, reason: 'unexpected_files' })
		expect(repository.mergeCalls).toBe(0)
	})

	it('blocks untracked, wrong-base, wrong-head-branch, and missing-check pull requests', async () => {
		const repository = new FakePublishingRepository()
		const service = new PublishingService(runtimeEnv(), repository)
		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		repository.deployment = {
			id: 'deployment-guard',
			ref: 'untracked-head',
			environment: 'Preview',
			url: 'https://preview.example.test/untracked',
			status: 'success',
			updatedAt: '2026-08-03T01:00:00.000Z',
		}
		repository.pulls.set(99, {
			number: 99,
			url: 'https://github.test/pr/99',
			title: 'Untracked',
			state: 'open',
			headSha: 'untracked-head',
			headBranch: 'feature/untracked',
			baseBranch: 'main',
			mergeable: true,
			merged: false,
		})
		await expect(service.mergePullRequest(99, 'untracked-head', {
			id: '42',
			login: 'flyoko',
			requestId: 'request-untracked',
		})).resolves.toEqual({ merged: false, reason: 'untracked_pull_request' })

		const run = await createRun(repository)
		const pull = repository.pulls.get(run.pullRequestNumber)!
		pull.baseBranch = 'other'
		await expect(service.mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-base',
		})).resolves.toEqual({ merged: false, reason: 'wrong_base_branch' })

		pull.baseBranch = 'main'
		pull.headBranch = 'feature/not-admin-run'
		await expect(service.mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-branch',
		})).resolves.toEqual({ merged: false, reason: 'untracked_pull_request' })

		pull.headBranch = run.branch
		repository.checks = { status: 'success', total: 0, successful: 0, failed: 0, pending: 0 }
		await expect(service.mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-checks',
		})).resolves.toEqual({ merged: false, reason: 'checks_missing' })
		expect(repository.mergeCalls).toBe(0)
	})

	it('blocks stale heads and missing previews, then links a successful merge to the run', async () => {
		const repository = new FakePublishingRepository()
		const run = await createRun(repository)
		repository.checks = { status: 'success', total: 1, successful: 1, failed: 0, pending: 0 }
		const service = new PublishingService(runtimeEnv(), repository)
		await expect(service.mergePullRequest(run.pullRequestNumber, 'stale-head', {
			id: '42',
			login: 'flyoko',
			requestId: 'request-2',
		})).resolves.toEqual({ merged: false, reason: 'stale_head' })
		await expect(service.mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-3',
		})).resolves.toEqual({ merged: false, reason: 'preview_missing' })
		expect(repository.deploymentRefs.at(-1)).toBe(run.branch)

		repository.deployment = {
			id: 'deployment-1',
			ref: run.headSha,
			environment: 'Preview',
			url: 'https://preview.example.test',
			status: 'success',
			updatedAt: '2026-08-03T01:00:00.000Z',
		}
		await expect(service.mergePullRequest(run.pullRequestNumber, run.headSha, {
			id: '42',
			login: 'flyoko',
			requestId: 'request-4',
		})).resolves.toMatchObject({ merged: true, sha: `merged-${run.pullRequestNumber}` })
		expect(repository.mergeCalls).toBe(1)
		const stored = await testEnv.DB.prepare('SELECT status, deployment_url FROM publish_runs WHERE pull_number = ?')
			.bind(run.pullRequestNumber)
			.first<{ status: string, deployment_url: string }>()
		expect(stored).toEqual({ status: 'merged', deployment_url: 'https://preview.example.test' })
	})
})

describe('article pull requests', () => {
	it('uses the same controlled PR service for article mode', async () => {
		const repository = new FakePublishingRepository()
		const service = new PublishingService(runtimeEnv(), repository)
		const document: ArticleDocument = {
			path: 'content/posts/2026/new-pr.md',
			sha: null,
			body: '# New PR',
			frontmatter: { title: 'New PR', categories: ['技术'], tags: [] },
		}
		const result = await service.publishArticle({
			document,
			expectedSha: null,
			idempotencyKey: 'article-pr-one',
			actor: { id: '42', login: 'flyoko', requestId: 'request-article' },
		})
		expect(result.resourcePath).toBe(document.path)
		expect(repository.committedPaths).toContain(document.path)
		expect(repository.fileCommitInputs).toHaveLength(1)
		expect(repository.fileCommitInputs[0]).not.toHaveProperty('fileSha')
		expect(result.pullRequestNumber).toBe(1)
	})

	it('passes the existing article blob SHA to the PR commit', async () => {
		const repository = new FakePublishingRepository()
		const service = new PublishingService(runtimeEnv(), repository)
		const document: ArticleDocument = {
			path: 'content/posts/2026/existing.md',
			sha: 'article-sha',
			body: '# Changed',
			frontmatter: { title: 'Changed', categories: ['技术'], tags: [] },
		}

		await service.publishArticle({
			document,
			expectedSha: 'article-sha',
			idempotencyKey: 'article-pr-existing',
			actor: { id: '42', login: 'flyoko', requestId: 'request-article-existing' },
		})

		expect(repository.fileCommitInputs).toHaveLength(1)
		expect(repository.fileCommitInputs[0]).toMatchObject({
			path: document.path,
			fileSha: 'article-sha',
		})
	})

	it('rejects an unchanged article before creating a branch, run, or PR', async () => {
		const repository = new FakePublishingRepository()
		const service = new PublishingService(runtimeEnv(), repository)
		const document: ArticleDocument = {
			path: 'content/posts/2026/existing.md',
			sha: 'article-sha',
			body: '# Existing',
			frontmatter: { title: 'Existing', categories: ['技术'], tags: [] },
		}
		repository.files.set(document.path, {
			sha: 'article-sha',
			content: serializeArticle(document),
		})

		await expect(service.publishArticle({
			document,
			expectedSha: 'article-sha',
			idempotencyKey: 'article-pr-no-changes',
			actor: { id: '42', login: 'flyoko', requestId: 'request-article-no-changes' },
		})).rejects.toMatchObject({
			code: 'VALIDATION_FAILED',
			status: 400,
			message: '文章内容没有变化，无需重复发布',
		})

		expect(repository.branches.size).toBe(0)
		expect(repository.commitCounter).toBe(0)
		expect(repository.pullCounter).toBe(0)
		const count = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM publish_runs').first<{ count: number }>()
		expect(count?.count).toBe(0)
	})
})
