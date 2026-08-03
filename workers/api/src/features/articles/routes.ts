import type { ArticleDocument } from '../../../../../shared/admin/articles'
import type { AppEnvironment, Env } from '../../env'
import type { ArticleActor, ArticleRepositoryPort } from './article-service'
import { Hono } from 'hono'
import {
	articleDocumentSchema,
	articleSaveRequestSchema,
	decodeArticleId,
} from '../../../../../shared/admin/articles'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import {
	enforceRateLimit,
	requireCsrf,
	requireSession,
} from '../../middleware/session'
import {

	ArticleService,
} from './article-service'
import { GitHubRepository } from './github-repository'

export type { ArticleRepositoryPort } from './article-service'

export interface ArticlePullRequestPublisher {
	publishArticle: (input: {
		document: ArticleDocument
		expectedSha?: string | null
		idempotencyKey: string
		actor: ArticleActor
	}) => Promise<unknown>
}

export interface ArticleRoutesOptions {
	repositoryFactory?: (env: Env) => ArticleRepositoryPort
	pullRequestPublisherFactory?: (env: Env) => ArticlePullRequestPublisher
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number) {
	if (value === undefined || value === '')
		return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

function parseDraft(value: string | undefined): boolean | undefined {
	if (value === undefined || value === '')
		return undefined
	if (value === 'true')
		return true
	if (value === 'false')
		return false
	throw new ApiError('VALIDATION_FAILED', 400, 'Draft filter is invalid')
}

function parseArticleId(value: string): string {
	try {
		return decodeArticleId(value)
	}
	catch {
		throw new ApiError('VALIDATION_FAILED', 400, 'Article id is invalid')
	}
}

export function createArticleRoutes(options: ArticleRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const repositoryFactory = options.repositoryFactory ?? (env => new GitHubRepository(env))

	routes.use('*', requireSession)

	routes.get('/', async (c) => {
		const data = await new ArticleService(c.env, repositoryFactory(c.env)).list({
			page: parsePositiveInteger(c.req.query('page'), 1, 1_000_000),
			pageSize: parsePositiveInteger(c.req.query('pageSize'), 20, 20),
			query: c.req.query('query'),
			category: c.req.query('category'),
			draft: parseDraft(c.req.query('draft')),
		})
		return success(c, data)
	})

	routes.post('/validate', requireCsrf, async (c) => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = articleDocumentSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'Article document is invalid', parsed.error.flatten())
		const document = await new ArticleService(c.env, repositoryFactory(c.env)).validate(parsed.data)
		return success(c, { valid: true, document })
	})

	routes.post('/', requireCsrf, async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:article:create`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			})
			const parsed = articleSaveRequestSchema.safeParse(raw)
			if (!parsed.success)
				throw new ApiError('VALIDATION_FAILED', 400, 'Article publish request is invalid', parsed.error.flatten())
			const actor: ArticleActor = {
				id: session.id,
				login: session.login,
				requestId: c.get('requestId'),
			}
			if (parsed.data.mode === 'pull_request') {
				const publisher = options.pullRequestPublisherFactory?.(c.env)
				if (!publisher)
					throw new ApiError('VALIDATION_FAILED', 400, 'Article Pull Request publishing is not available yet')
				const data = await publisher.publishArticle({
					document: parsed.data.document,
					expectedSha: parsed.data.expectedSha,
					idempotencyKey: parsed.data.idempotencyKey,
					actor,
				})
				return success(c, data, 201)
			}
			const execution = await withIdempotency({
				db: c.env.DB,
				key: parsed.data.idempotencyKey,
				scope: `article.create:${session.id}`,
				requestBody: parsed.data,
				execute: async () => ({
					status: 201,
					body: await new ArticleService(c.env, repositoryFactory(c.env)).publishDirect({
						document: parsed.data.document,
						expectedSha: parsed.data.expectedSha,
						actor,
					}),
				}),
			})
			return success(c, execution.body, 201)
		})
	})

	routes.get('/:id', async (c) => {
		const data = await new ArticleService(c.env, repositoryFactory(c.env)).get(parseArticleId(c.req.param('id')))
		return success(c, data)
	})

	routes.put('/:id', requireCsrf, async (c) => {
		const session = c.get('session')!
		const path = parseArticleId(c.req.param('id'))
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:article:update`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			})
			const parsed = articleSaveRequestSchema.safeParse(raw)
			if (!parsed.success)
				throw new ApiError('VALIDATION_FAILED', 400, 'Article publish request is invalid', parsed.error.flatten())
			if (parsed.data.document.path !== path)
				throw new ApiError('VALIDATION_FAILED', 400, 'Article path does not match the route id')
			const actor: ArticleActor = {
				id: session.id,
				login: session.login,
				requestId: c.get('requestId'),
			}
			if (parsed.data.mode === 'pull_request') {
				const publisher = options.pullRequestPublisherFactory?.(c.env)
				if (!publisher)
					throw new ApiError('VALIDATION_FAILED', 400, 'Article Pull Request publishing is not available yet')
				const data = await publisher.publishArticle({
					document: parsed.data.document,
					expectedSha: parsed.data.expectedSha,
					idempotencyKey: parsed.data.idempotencyKey,
					actor,
				})
				return success(c, data)
			}
			const execution = await withIdempotency({
				db: c.env.DB,
				key: parsed.data.idempotencyKey,
				scope: `article.update:${session.id}:${path}`,
				requestBody: parsed.data,
				execute: async () => ({
					status: 200,
					body: await new ArticleService(c.env, repositoryFactory(c.env)).publishDirect({
						document: parsed.data.document,
						expectedSha: parsed.data.expectedSha,
						actor,
					}),
				}),
			})
			return success(c, execution.body)
		})
	})

	return routes
}

export const articleRoutes = createArticleRoutes()
