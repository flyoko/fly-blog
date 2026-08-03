import type { z } from 'zod'
import type { ArticleDocument } from '../../../../../shared/admin/articles'
import type {
	CheckSummaryDto,
	DeploymentDto,
	PullRequestDto,
	PullRequestFileDto,
} from '../../../../../shared/admin/publishing'
import type { Env } from '../../env'
import type { PublishRunRow } from '../../repositories/publish-repository'
import type { ArticleActor, ArticleRepositoryPort } from '../articles/article-service'
import { aboutLinksSchema, aboutTimelineSchema } from '../../../../../shared/admin/about'
import {
	categoriesConfigSchema,
	footerConfigSchema,
	modulesConfigSchema,
	navigationConfigSchema,
	newsSourcesConfigSchema,
	weatherConfigSchema,
} from '../../../../../shared/admin/site-config'
import { ApiError } from '../../lib/api-error'
import { randomToken } from '../../lib/crypto'
import { withIdempotency } from '../../lib/idempotency'
import { AuditRepository } from '../../repositories/audit-repository'
import {
	PublishRepository,

} from '../../repositories/publish-repository'
import { serializeArticle } from '../articles/article-codec'
import {

	ArticleService,
} from '../articles/article-service'

const editableConfigFiles = {
	categories: { path: 'config/taxonomy/categories.json', schema: categoriesConfigSchema },
	navigation: { path: 'config/site/navigation.json', schema: navigationConfigSchema },
	footer: { path: 'config/site/footer.json', schema: footerConfigSchema },
	modules: { path: 'config/site/modules.json', schema: modulesConfigSchema },
	weather: { path: 'config/site/weather.json', schema: weatherConfigSchema },
	newsSources: { path: 'config/news/sources.json', schema: newsSourcesConfigSchema },
	aboutTimeline: { path: 'config/about/timeline.json', schema: aboutTimelineSchema },
	aboutLinks: { path: 'config/about/links.json', schema: aboutLinksSchema },
} as const

export type EditableConfigKind = keyof typeof editableConfigFiles

export interface PublishingRepositoryPort extends ArticleRepositoryPort {
	createBranch: (input: { name: string, fromSha: string }) => Promise<void>
	createPullRequest: (input: { head: string, base: string, title: string, body: string }) => Promise<{ number: number, url: string }>
	getPullRequest: (number: number) => Promise<PullRequestDto>
	getPullRequestFiles: (number: number) => Promise<PullRequestFileDto[]>
	getChecks: (ref: string) => Promise<CheckSummaryDto>
	getDeployment: (ref: string) => Promise<DeploymentDto | null>
	mergePullRequest: (number: number, expectedHeadSha: string) => Promise<{ merged: boolean, sha?: string }>
}

export interface PullRequestStatusRepositoryPort {
	getPullRequest: (number: number) => Promise<PullRequestDto>
}

export interface PullRequestPublishResult {
	publishRunId: string
	resourcePath: string
	branch: string
	commitSha: string
	pullRequestNumber: number
	pullRequestUrl: string
	headSha: string
}

export interface PullRequestDetail {
	run: PublishRunRow | null
	pullRequest: PullRequestDto
	files: PullRequestFileDto[]
	checks: CheckSummaryDto
	deployment: DeploymentDto | null
	canMerge: boolean
	reason?: MergeBlockReason
}

export type MergeBlockReason
	= | 'stale_head'
		| 'untracked_pull_request'
		| 'wrong_base_branch'
		| 'unexpected_files'
		| 'checks_missing'
		| 'checks_failed'
		| 'checks_pending'
		| 'preview_missing'
		| 'not_mergeable'
		| 'pull_request_closed'
		| 'merge_rejected'

const activePullRequestStatuses = new Set(['created', 'commit_created', 'checks_pending', 'preview_ready'])

async function reconcilePublishRun(
	publishRepository: PublishRepository,
	repository: PullRequestStatusRepositoryPort,
	run: PublishRunRow,
	pullRequest?: PullRequestDto,
): Promise<PublishRunRow> {
	if (
		run.kind !== 'pull_request'
		|| !run.pullNumber
		|| !activePullRequestStatuses.has(run.status)
	) {
		return run
	}

	const current = pullRequest ?? await repository.getPullRequest(run.pullNumber)
	const status = current.merged
		? 'merged'
		: current.state === 'closed'
			? 'closed'
			: null
	if (!status || status === run.status)
		return run

	const updatedAt = new Date().toISOString()
	await publishRepository.updateRun(run.id, { status, updatedAt })
	return { ...run, status, updatedAt }
}

export async function reconcileActivePublishRuns(
	db: D1Database,
	repository: PullRequestStatusRepositoryPort,
	pageSize = 30,
): Promise<PublishRunRow[]> {
	const publishRepository = new PublishRepository(db)
	const result = await publishRepository.listRuns(1, Math.min(30, Math.max(1, pageSize)))
	return Promise.all(result.items.map(async (run) => {
		try {
			return await reconcilePublishRun(publishRepository, repository, run)
		}
		catch {
			return run
		}
	}))
}

function asApiError(error: unknown): ApiError {
	return error instanceof ApiError
		? error
		: new ApiError('INTERNAL_ERROR', 500, 'Publishing operation failed')
}

function formatUtcTimestamp(now: Date): string {
	const year = now.getUTCFullYear()
	const month = String(now.getUTCMonth() + 1).padStart(2, '0')
	const day = String(now.getUTCDate()).padStart(2, '0')
	const hour = String(now.getUTCHours()).padStart(2, '0')
	const minute = String(now.getUTCMinutes()).padStart(2, '0')
	const second = String(now.getUTCSeconds()).padStart(2, '0')
	return `${year}${month}${day}-${hour}${minute}${second}`
}

function randomBranchSuffix(): string {
	return randomToken(6).toLowerCase().replace(/[^a-z0-9]/gu, '').padEnd(6, '0').slice(0, 6)
}

function branchName(kind: string, now = new Date()): string {
	return `admin/${kind}/${formatUtcTimestamp(now)}-${randomBranchSuffix()}`
}

function blockReason(
	pullRequest: PullRequestDto,
	files: PullRequestFileDto[],
	checks: CheckSummaryDto,
	deployment: DeploymentDto | null,
	run: PublishRunRow | null,
	defaultBranch: string,
): MergeBlockReason | undefined {
	if (
		!run
		|| run.kind !== 'pull_request'
		|| run.pullNumber !== pullRequest.number
		|| run.repositoryRef !== pullRequest.headBranch
		|| run.commitSha !== pullRequest.headSha
	) {
		return 'untracked_pull_request'
	}
	if (pullRequest.baseBranch !== defaultBranch)
		return 'wrong_base_branch'
	if (pullRequest.state !== 'open' || pullRequest.merged)
		return 'pull_request_closed'
	if (pullRequest.mergeable !== true)
		return 'not_mergeable'
	if (
		!run.resourcePath
		|| files.length !== 1
		|| files[0]!.filename !== run.resourcePath
		|| (files[0]!.status !== 'added' && files[0]!.status !== 'modified')
	) {
		return 'unexpected_files'
	}
	if (checks.total === 0)
		return 'checks_missing'
	if (checks.status === 'failure')
		return 'checks_failed'
	if (checks.status !== 'success')
		return 'checks_pending'
	if (!deployment || deployment.status !== 'success' || !deployment.url)
		return 'preview_missing'
	return undefined
}

export class PublishingService {
	private readonly publishRepository: PublishRepository
	private readonly auditRepository: AuditRepository

	constructor(
		private readonly env: Env,
		private readonly repository: PublishingRepositoryPort,
	) {
		this.publishRepository = new PublishRepository(env.DB)
		this.auditRepository = new AuditRepository(env.DB)
	}

	async publishConfig(input: {
		kind: EditableConfigKind
		content: unknown
		expectedHeadSha?: string
		title?: string
		body?: string
		idempotencyKey: string
		actor: ArticleActor
	}): Promise<PullRequestPublishResult> {
		const definition = editableConfigFiles[input.kind]
		if (!definition)
			throw new ApiError('VALIDATION_FAILED', 400, 'Configuration kind is not editable')
		let content: z.infer<typeof definition.schema>
		try {
			content = definition.schema.parse(input.content)
		}
		catch (error) {
			throw new ApiError('VALIDATION_FAILED', 400, 'Configuration content is invalid', error)
		}
		return withIdempotency({
			db: this.env.DB,
			key: input.idempotencyKey,
			scope: `publishing.config:${input.actor.id}:${input.kind}`,
			requestBody: {
				kind: input.kind,
				content,
				expectedHeadSha: input.expectedHeadSha,
				title: input.title,
				body: input.body,
			},
			execute: async () => ({
				status: 201,
				body: await this.createPullRequestRun({
					branchKind: input.kind,
					resourcePath: definition.path,
					content: `${JSON.stringify(content, null, 2)}\n`,
					expectedHeadSha: input.expectedHeadSha,
					title: input.title ?? `更新${input.kind}配置`,
					body: input.body ?? '由 fly living 管理后台创建。',
					actor: input.actor,
				}),
			}),
		}).then(result => result.body)
	}

	async publishArticle(input: {
		document: ArticleDocument
		expectedSha?: string | null
		idempotencyKey: string
		actor: ArticleActor
	}): Promise<PullRequestPublishResult> {
		const document = await new ArticleService(this.env, this.repository).validate(input.document)
		const current = await this.findOptionalFile(document.path)
		if (input.expectedSha === null || input.expectedSha === undefined) {
			if (current)
				throw new ApiError('CONFLICT', 409, 'Article already exists')
		}
		else if (!current || current.sha !== input.expectedSha) {
			throw new ApiError('CONFLICT', 409, 'Article changed since it was loaded')
		}
		return withIdempotency({
			db: this.env.DB,
			key: input.idempotencyKey,
			scope: `publishing.article:${input.actor.id}:${document.path}`,
			requestBody: { document, expectedSha: input.expectedSha },
			execute: async () => ({
				status: 201,
				body: await this.createPullRequestRun({
					branchKind: 'article',
					resourcePath: document.path,
					content: serializeArticle(document),
					title: `发布文章: ${document.frontmatter.title}`,
					body: '文章内容变更，等待预览与检查通过后合并。',
					actor: input.actor,
				}),
			}),
		}).then(result => result.body)
	}

	async listRuns(page: number, pageSize: number) {
		const normalizedPage = Math.max(1, Math.trunc(page))
		const normalizedPageSize = Math.min(30, Math.max(1, Math.trunc(pageSize)))
		const result = await this.publishRepository.listRuns(normalizedPage, normalizedPageSize)
		const items = await Promise.all(result.items.map(async (run) => {
			try {
				return await reconcilePublishRun(this.publishRepository, this.repository, run)
			}
			catch {
				return run
			}
		}))
		return { page: normalizedPage, pageSize: normalizedPageSize, ...result, items }
	}

	async getPullRequestDetail(number: number): Promise<PullRequestDetail> {
		const pullRequest = await this.repository.getPullRequest(number)
		const [files, checks, deployment, run] = await Promise.all([
			this.repository.getPullRequestFiles(number),
			this.repository.getChecks(pullRequest.headSha),
			this.repository.getDeployment(pullRequest.headBranch),
			this.publishRepository.findByPullNumber(number),
		])
		const reason = blockReason(pullRequest, files, checks, deployment, run, this.env.GITHUB_DEFAULT_BRANCH)
		let reconciledRun = run
		if (run && reason === 'pull_request_closed') {
			reconciledRun = await reconcilePublishRun(this.publishRepository, this.repository, run, pullRequest)
		}
		else if (!reason && run && run.status !== 'merged') {
			const updatedAt = new Date().toISOString()
			await this.publishRepository.updateRun(run.id, {
				status: 'preview_ready',
				deploymentUrl: deployment?.url ?? null,
				updatedAt,
			})
			reconciledRun = {
				...run,
				status: 'preview_ready',
				deploymentUrl: deployment?.url ?? null,
				updatedAt,
			}
		}
		return {
			run: reconciledRun,
			pullRequest,
			files,
			checks,
			deployment,
			canMerge: reason === undefined,
			...(reason ? { reason } : {}),
		}
	}

	async mergePullRequest(number: number, expectedHeadSha: string, actor: ArticleActor) {
		const detail = await this.getPullRequestDetail(number)
		if (detail.pullRequest.headSha !== expectedHeadSha)
			return { merged: false as const, reason: 'stale_head' as const }
		if (detail.reason)
			return { merged: false as const, reason: detail.reason }
		const result = await this.repository.mergePullRequest(number, expectedHeadSha)
		if (!result.merged)
			return { merged: false as const, reason: 'merge_rejected' as const }
		if (detail.run) {
			await this.publishRepository.updateRun(detail.run.id, {
				status: 'merged',
				commitSha: result.sha ?? detail.run.commitSha,
				deploymentUrl: detail.deployment?.url ?? detail.run.deploymentUrl,
				updatedAt: new Date().toISOString(),
			})
		}
		await this.auditRepository.writeAudit({
			actorId: actor.id,
			actorLogin: actor.login,
			action: 'publishing.merge',
			targetType: 'pull_request',
			targetId: number.toString(),
			result: 'success',
			requestId: actor.requestId,
			metadata: { headSha: expectedHeadSha, mergeSha: result.sha },
		})
		return { merged: true as const, ...(result.sha ? { sha: result.sha } : {}) }
	}

	private async createPullRequestRun(input: {
		branchKind: string
		resourcePath: string
		content: string
		expectedHeadSha?: string
		title: string
		body: string
		actor: ArticleActor
	}): Promise<PullRequestPublishResult> {
		const baseHead = await this.repository.getBranchHead(this.env.GITHUB_DEFAULT_BRANCH)
		if (input.expectedHeadSha && input.expectedHeadSha !== baseHead)
			throw new ApiError('CONFLICT', 409, 'Repository branch changed since it was loaded')
		const branch = branchName(input.branchKind)
		const publishRunId = crypto.randomUUID()
		const now = new Date().toISOString()
		await this.publishRepository.createRun({
			id: publishRunId,
			kind: 'pull_request',
			status: 'created',
			repositoryRef: branch,
			resourcePath: input.resourcePath,
			createdAt: now,
		})
		try {
			await this.repository.createBranch({ name: branch, fromSha: baseHead })
			const commit = await this.repository.createAtomicCommit({
				branch,
				expectedHeadSha: baseHead,
				message: input.title,
				files: [{ path: input.resourcePath, content: input.content }],
			})
			await this.publishRepository.updateRun(publishRunId, {
				status: 'commit_created',
				commitSha: commit.commitSha,
				updatedAt: new Date().toISOString(),
			})
			const pullRequest = await this.repository.createPullRequest({
				head: branch,
				base: this.env.GITHUB_DEFAULT_BRANCH,
				title: input.title,
				body: input.body,
			})
			await this.publishRepository.updateRun(publishRunId, {
				status: 'checks_pending',
				pullNumber: pullRequest.number,
				pullRequestUrl: pullRequest.url,
				updatedAt: new Date().toISOString(),
			})
			await this.auditRepository.writeAudit({
				actorId: input.actor.id,
				actorLogin: input.actor.login,
				action: 'publishing.pull-request.create',
				targetType: 'pull_request',
				targetId: pullRequest.number.toString(),
				result: 'success',
				requestId: input.actor.requestId,
				metadata: { publishRunId, resourcePath: input.resourcePath, commitSha: commit.commitSha },
			})
			return {
				publishRunId,
				resourcePath: input.resourcePath,
				branch,
				commitSha: commit.commitSha,
				pullRequestNumber: pullRequest.number,
				pullRequestUrl: pullRequest.url,
				headSha: commit.commitSha,
			}
		}
		catch (error) {
			const apiError = asApiError(error)
			await this.publishRepository.updateRun(publishRunId, {
				status: apiError.code === 'CONFLICT' ? 'conflict' : 'failed',
				errorCode: apiError.code,
				errorMessage: apiError.message,
				updatedAt: new Date().toISOString(),
			})
			await this.auditRepository.writeAudit({
				actorId: input.actor.id,
				actorLogin: input.actor.login,
				action: 'publishing.pull-request.create',
				targetType: 'repository_file',
				targetId: input.resourcePath,
				result: 'failure',
				requestId: input.actor.requestId,
				metadata: { publishRunId, errorCode: apiError.code },
			}).catch(() => undefined)
			throw apiError
		}
	}

	private async findOptionalFile(path: string) {
		try {
			return await this.repository.getFile(path, this.env.GITHUB_DEFAULT_BRANCH)
		}
		catch (error) {
			if (error instanceof ApiError && error.code === 'NOT_FOUND')
				return null
			throw error
		}
	}
}
