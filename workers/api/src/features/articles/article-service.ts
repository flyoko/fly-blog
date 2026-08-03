import type {
	ArticleDocument,
	ArticleSummary,
} from '../../../../../shared/admin/articles'
import type { Env } from '../../env'
import pLimit from 'p-limit'
import {
	articleDocumentSchema,
	encodeArticleId,
} from '../../../../../shared/admin/articles'
import { categoriesConfigSchema } from '../../../../../shared/admin/site-config'
import { ApiError } from '../../lib/api-error'
import { AuditRepository } from '../../repositories/audit-repository'
import { MediaRepository } from '../../repositories/media-repository'
import { PublishRepository } from '../../repositories/publish-repository'
import { parseArticle, serializeArticle } from './article-codec'

export interface ArticleRepositoryPort {
	listFiles: (prefix: string, ref: string) => Promise<Array<{ path: string, sha: string }>>
	getFile: (path: string, ref: string) => Promise<{ path: string, sha: string, content: string }>
	getBranchHead: (branch: string) => Promise<string>
	createAtomicCommit: (input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}) => Promise<{ commitSha: string }>
}

export interface ArticleActor {
	id: string
	login: string
	requestId: string
}

function asApiError(error: unknown): ApiError {
	if (error instanceof ApiError)
		return error
	return new ApiError('INTERNAL_ERROR', 500, 'Article operation failed')
}

function escapedRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function extractMediaUrls(value: string, origin: string): string[] {
	const base = origin.replace(/\/$/u, '')
	const matcher = new RegExp(`${escapedRegExp(base)}/[^\\s"'<>\\)\\]]+`, 'gu')
	return [...new Set(value.match(matcher)?.map(url => url.replace(/[.,;:!?]+$/u, '')) ?? [])]
}

export class ArticleService {
	private readonly publishRepository: PublishRepository
	private readonly auditRepository: AuditRepository
	private readonly mediaRepository: MediaRepository

	constructor(
		private readonly env: Env,
		private readonly repository: ArticleRepositoryPort,
	) {
		this.publishRepository = new PublishRepository(env.DB)
		this.auditRepository = new AuditRepository(env.DB)
		this.mediaRepository = new MediaRepository(env.DB)
	}

	async list(input: {
		page: number
		pageSize: number
		query?: string
		category?: string
		draft?: boolean
	}): Promise<{ page: number, pageSize: number, total: number, items: ArticleSummary[] }> {
		const page = Math.max(1, Math.trunc(input.page))
		const pageSize = Math.min(20, Math.max(1, Math.trunc(input.pageSize)))
		const files = await this.repository.listFiles('content/posts/', this.env.GITHUB_DEFAULT_BRANCH)
		const limit = pLimit(5)
		const articles = await Promise.all(files.map(file => limit(async () => {
			const value = await this.repository.getFile(file.path, this.env.GITHUB_DEFAULT_BRANCH)
			return parseArticle(value)
		})))
		const query = input.query?.trim().toLowerCase()
		const filtered = articles.filter((article) => {
			const frontmatter = article.frontmatter
			const categories = frontmatter.categories ?? []
			const tags = frontmatter.tags ?? []
			if (query) {
				const searchable = [frontmatter.title, frontmatter.description, article.path, ...categories, ...tags]
					.filter((value): value is string => typeof value === 'string')
					.join('\n')
					.toLowerCase()
				if (!searchable.includes(query))
					return false
			}
			if (input.category && !categories.includes(input.category))
				return false
			if (input.draft !== undefined && Boolean(frontmatter.draft) !== input.draft)
				return false
			return true
		})
			.sort((left, right) => {
				const leftDate = left.frontmatter.updated ?? left.frontmatter.date ?? ''
				const rightDate = right.frontmatter.updated ?? right.frontmatter.date ?? ''
				return rightDate.localeCompare(leftDate) || left.path.localeCompare(right.path)
			})
		const start = (page - 1) * pageSize
		return {
			page,
			pageSize,
			total: filtered.length,
			items: filtered.slice(start, start + pageSize).map(article => ({
				id: encodeArticleId(article.path),
				path: article.path,
				sha: article.sha ?? '',
				title: article.frontmatter.title ?? article.path.split('/').at(-1) ?? article.path,
				description: article.frontmatter.description,
				date: article.frontmatter.date,
				updated: article.frontmatter.updated,
				categories: article.frontmatter.categories ?? [],
				tags: article.frontmatter.tags ?? [],
				draft: Boolean(article.frontmatter.draft),
			})),
		}
	}

	async get(path: string): Promise<ArticleDocument> {
		return parseArticle(await this.repository.getFile(path, this.env.GITHUB_DEFAULT_BRANCH))
	}

	async validate(document: ArticleDocument): Promise<ArticleDocument> {
		let parsed: ArticleDocument
		try {
			parsed = articleDocumentSchema.parse({
				...document,
				frontmatter: {
					...document.frontmatter,
					categories: document.frontmatter.categories ?? [],
					tags: document.frontmatter.tags ?? [],
				},
			})
		}
		catch (error) {
			throw new ApiError('VALIDATION_FAILED', 400, 'Article document is invalid', error)
		}
		if (!parsed.frontmatter.title?.trim())
			throw new ApiError('VALIDATION_FAILED', 400, 'Article title is required')
		const categoryNames = await this.loadCategoryNames()
		const missing = (parsed.frontmatter.categories ?? []).filter(category => !categoryNames.has(category))
		if (missing.length)
			throw new ApiError('VALIDATION_FAILED', 400, `Unknown article category: ${missing.join(', ')}`)
		serializeArticle(parsed)
		return parsed
	}

	async publishDirect(input: {
		document: ArticleDocument
		expectedSha?: string | null
		actor: ArticleActor
	}): Promise<{ publishRunId: string, commitSha: string }> {
		const document = await this.validate(input.document)
		const current = await this.findOptionalFile(document.path)
		if (input.expectedSha === null || input.expectedSha === undefined) {
			if (current)
				throw new ApiError('CONFLICT', 409, 'Article already exists')
		}
		else if (!current || current.sha !== input.expectedSha) {
			throw new ApiError('CONFLICT', 409, 'Article changed since it was loaded')
		}

		const publishRunId = crypto.randomUUID()
		const now = new Date().toISOString()
		await this.publishRepository.createRun({
			id: publishRunId,
			kind: 'direct',
			status: 'created',
			repositoryRef: this.env.GITHUB_DEFAULT_BRANCH,
			createdAt: now,
		})
		try {
			const head = await this.repository.getBranchHead(this.env.GITHUB_DEFAULT_BRANCH)
			const serialized = serializeArticle(document)
			const result = await this.repository.createAtomicCommit({
				branch: this.env.GITHUB_DEFAULT_BRANCH,
				expectedHeadSha: head,
				message: `发布文章: ${document.frontmatter.title}`,
				files: [{ path: document.path, content: serialized }],
			})
			await this.publishRepository.updateRun(publishRunId, {
				status: 'commit_created',
				commitSha: result.commitSha,
				updatedAt: new Date().toISOString(),
			})
			await this.synchronizeMediaReferences(document.path, result.commitSha, serialized)
			await this.publishRepository.updateRun(publishRunId, {
				status: 'checks_pending',
				updatedAt: new Date().toISOString(),
			})
			await this.auditRepository.writeAudit({
				actorId: input.actor.id,
				actorLogin: input.actor.login,
				action: current ? 'article.update' : 'article.create',
				targetType: 'article',
				targetId: document.path,
				result: 'success',
				requestId: input.actor.requestId,
				metadata: { publishRunId, commitSha: result.commitSha },
			})
			return { publishRunId, commitSha: result.commitSha }
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
				action: current ? 'article.update' : 'article.create',
				targetType: 'article',
				targetId: document.path,
				result: 'failure',
				requestId: input.actor.requestId,
				metadata: { publishRunId, errorCode: apiError.code },
			}).catch(() => undefined)
			throw apiError
		}
	}

	private async loadCategoryNames(): Promise<Set<string>> {
		const file = await this.repository.getFile(
			'config/taxonomy/categories.json',
			this.env.GITHUB_DEFAULT_BRANCH,
		)
		try {
			return new Set(categoriesConfigSchema.parse(JSON.parse(file.content)).map(category => category.name))
		}
		catch (error) {
			throw new ApiError('UPSTREAM_FAILED', 502, 'Repository category configuration is invalid', error)
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

	private async synchronizeMediaReferences(path: string, commitSha: string, serialized: string) {
		const urls = extractMediaUrls(serialized, this.env.MEDIA_ORIGIN)
		const mediaIds = await this.mediaRepository.findIdsByPublicUrls(urls)
		await this.mediaRepository.replaceReferences(mediaIds, path, commitSha, new Date().toISOString())
	}
}
