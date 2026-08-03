import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { ArticleDocument } from '../../../shared/admin/articles'
import type { CheckSummaryDto, DeploymentDto, PullRequestDto, PullRequestFileDto } from '../../../shared/admin/publishing'
import type { AppEnvironment, Env } from '../src/env'
import type { PublishingRepositoryPort } from '../src/features/publishing/publishing-service'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
	pullCounter = 0
	mergeCalls = 0
	pullReadFailure = false
	branches = new Map<string, string>()
	committedPaths: string[] = []
	pulls = new Map<number, PullRequestDto>()
	checks: CheckSummaryDto = { status: 'pending', total: 1, successful: 0, failed: 0, pending: 1 }
	deployment: DeploymentDto | null = null
	deploymentRefs: string[] = []
	files = new Map<string, { sha: string, content: string }>([
		['config/taxonomy/categories.json', { sha: 'category-sha', content: JSON.stringify(categoryConfig) }],
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

	async getChecks() {
		return this.checks
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
		expect(result.pullRequestNumber).toBe(1)
	})
})
