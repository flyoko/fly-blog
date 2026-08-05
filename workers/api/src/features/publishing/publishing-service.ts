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
	articlePresentationConfigSchema,
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
	article: { path: 'config/site/article.json', schema: articlePresentationConfigSchema },
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

export function isEditableConfigKind(value: string): value is EditableConfigKind {
	return Object.hasOwn(editableConfigFiles, value)
}

export interface PublishingRepositoryPort extends ArticleRepositoryPort {
	createBranch: (input: { name: string, fromSha: string }) => Promise<void>
	createPullRequest: (input: { head: string, base: string, title: string, body: string }) => Promise<{ number: number, url: string }>
	getPullRequest: (number: number) => Promise<PullRequestDto>
	getPullRequestFiles: (number: number) => Promise<PullRequestFileDto[]>
	getChecks: (ref: string, resourcePath?: string) => Promise<CheckSummaryDto>
	getCommitChangeCount: (ref: string) => Promise<number>
	getDeployment: (ref: string) => Promise<DeploymentDto | null>
	mergePullRequest: (number: number, expectedHeadSha: string) => Promise<{ merged: boolean, sha?: string }>
}

export interface PublishingStatusRepositoryPort {
	getPullRequest: (number: number) => Promise<PullRequestDto>
	getChecks: (ref: string, resourcePath?: string) => Promise<CheckSummaryDto>
	getCommitChangeCount: (ref: string) => Promise<number>
	getDeployment: (ref: string) => Promise<DeploymentDto | null>
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

const activePullRequestStatuses = new Set(['created', 'commit_created', 'checks_pending', 'preview_ready', 'failed'])
const activeDirectStatuses = new Set(['created', 'commit_created', 'checks_pending', 'failed'])

function checksFailureMessage(checks: CheckSummaryDto): string {
	const diagnostic = checks.diagnostics?.[0]
	if (!diagnostic)
		return 'Repository checks failed'
	return `${diagnostic.message}${diagnostic.bodyLine ? `（第 ${diagnostic.bodyLine} 行${diagnostic.bodyColumn ? `，第 ${diagnostic.bodyColumn} 列` : ''}）` : ''}`
}

async function updateReconciledRun(
	publishRepository: PublishRepository,
	run: PublishRunRow,
	input: {
		status: string
		deploymentUrl?: string | null
		errorCode?: string | null
		errorMessage?: string | null
	},
): Promise<PublishRunRow> {
	const deploymentUrl = 'deploymentUrl' in input ? input.deploymentUrl ?? null : run.deploymentUrl
	const errorCode = 'errorCode' in input ? input.errorCode ?? null : run.errorCode
	const errorMessage = 'errorMessage' in input ? input.errorMessage ?? null : run.errorMessage
	if (
		run.status === input.status
		&& run.deploymentUrl === deploymentUrl
		&& run.errorCode === errorCode
		&& run.errorMessage === errorMessage
	) {
		return run
	}
	const updatedAt = new Date().toISOString()
	await publishRepository.updateRun(run.id, {
		status: input.status,
		deploymentUrl,
		errorCode,
		errorMessage,
		updatedAt,
	})
	return { ...run, ...input, deploymentUrl, errorCode, errorMessage, updatedAt }
}

async function reconcileDirectPublishRun(
	publishRepository: PublishRepository,
	repository: PublishingStatusRepositoryPort,
	run: PublishRunRow,
): Promise<PublishRunRow> {
	if (run.kind !== 'direct' || !run.commitSha || !activeDirectStatuses.has(run.status))
		return run

	const [checks, deployment] = await Promise.all([
		repository.getChecks(run.commitSha, run.resourcePath ?? undefined),
		repository.getDeployment(run.commitSha),
	])
	if (deployment?.status === 'success') {
		return updateReconciledRun(publishRepository, run, {
			status: 'published',
			deploymentUrl: deployment.url,
			errorCode: null,
			errorMessage: null,
		})
	}
	if (deployment?.status === 'failure') {
		return updateReconciledRun(publishRepository, run, {
			status: 'failed',
			deploymentUrl: deployment.url,
			errorCode: 'DEPLOYMENT_FAILED',
			errorMessage: 'Production deployment failed',
		})
	}
	if (checks.status === 'failure') {
		return updateReconciledRun(publishRepository, run, {
			status: 'failed',
			deploymentUrl: deployment?.url ?? run.deploymentUrl,
			errorCode: 'CHECKS_FAILED',
			errorMessage: checksFailureMessage(checks),
		})
	}
	if (checks.total === 0 && !deployment) {
		const changeCount = await repository.getCommitChangeCount(run.commitSha)
		if (changeCount === 0) {
			return updateReconciledRun(publishRepository, run, {
				status: 'published',
				deploymentUrl: null,
				errorCode: null,
				errorMessage: null,
			})
		}
	}
	return updateReconciledRun(publishRepository, run, {
		status: 'checks_pending',
		errorCode: null,
		errorMessage: null,
	})
}

async function reconcilePullRequestRun(
	publishRepository: PublishRepository,
	repository: PublishingStatusRepositoryPort,
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
	if (current.merged)
		return updateReconciledRun(publishRepository, run, { status: 'merged' })
	if (current.state === 'closed')
		return updateReconciledRun(publishRepository, run, { status: 'closed' })

	const [checks, deployment] = await Promise.all([
		repository.getChecks(current.headSha, run.resourcePath ?? undefined),
		repository.getDeployment(run.repositoryRef),
	])
	if (checks.status === 'failure') {
		return updateReconciledRun(publishRepository, run, {
			status: 'failed',
			deploymentUrl: deployment?.url ?? run.deploymentUrl,
			errorCode: 'CHECKS_FAILED',
			errorMessage: checksFailureMessage(checks),
		})
	}
	if (deployment?.status === 'failure') {
		return updateReconciledRun(publishRepository, run, {
			status: 'failed',
			deploymentUrl: deployment.url,
			errorCode: 'PREVIEW_FAILED',
			errorMessage: 'Preview deployment failed',
		})
	}
	if (checks.status === 'success' && checks.total > 0 && deployment?.status === 'success') {
		return updateReconciledRun(publishRepository, run, {
			status: 'preview_ready',
			deploymentUrl: deployment.url,
			errorCode: null,
			errorMessage: null,
		})
	}
	return updateReconciledRun(publishRepository, run, {
		status: 'checks_pending',
		deploymentUrl: deployment?.url ?? run.deploymentUrl,
		errorCode: null,
		errorMessage: null,
	})
}

async function reconcilePublishRun(
	publishRepository: PublishRepository,
	repository: PublishingStatusRepositoryPort,
	run: PublishRunRow,
	pullRequest?: PullRequestDto,
): Promise<PublishRunRow> {
	if (run.kind === 'direct')
		return reconcileDirectPublishRun(publishRepository, repository, run)
	return reconcilePullRequestRun(publishRepository, repository, run, pullRequest)
}

export async function reconcileActivePublishRuns(
	db: D1Database,
	repository: PublishingStatusRepositoryPort,
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

	async getConfig(kind: EditableConfigKind): Promise<{
		kind: EditableConfigKind
		path: string
		sha: string
		content: unknown
	}> {
		const definition = editableConfigFiles[kind]
		const file = await this.repository.getFile(definition.path, this.env.GITHUB_DEFAULT_BRANCH)
		let raw: unknown
		try {
			raw = JSON.parse(file.content)
		}
		catch {
			throw new ApiError('UPSTREAM_FAILED', 502, 'Repository config is not valid JSON')
		}
		const content = (definition.schema as z.ZodType).safeParse(raw)
		if (!content.success)
			throw new ApiError('UPSTREAM_FAILED', 502, 'Repository config failed validation')
		return { kind, path: file.path, sha: file.sha, content: content.data }
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
					commitMode: 'atomic',
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
		if (current?.content === serializeArticle(document))
			throw new ApiError('VALIDATION_FAILED', 400, '文章内容没有变化，无需重复发布')
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
					commitMode: 'file',
					fileSha: current?.sha,
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
		const run = await this.publishRepository.findByPullNumber(number)
		const [files, checks, deployment] = await Promise.all([
			this.repository.getPullRequestFiles(number),
			this.repository.getChecks(pullRequest.headSha, run?.resourcePath ?? undefined),
			this.repository.getDeployment(pullRequest.headBranch),
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
		commitMode: 'atomic' | 'file'
		fileSha?: string
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
			const commit = input.commitMode === 'file'
				? await this.repository.createFileCommit({
						branch,
						expectedHeadSha: baseHead,
						path: input.resourcePath,
						content: input.content,
						...(input.fileSha ? { fileSha: input.fileSha } : {}),
						message: input.title,
					})
				: await this.repository.createAtomicCommit({
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
