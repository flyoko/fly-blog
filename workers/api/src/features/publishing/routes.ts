import type { AppEnvironment, Env } from '../../env'
import type { PublishingRepositoryPort } from './publishing-service'
import { Hono } from 'hono'
import {
	configPullRequestSchema,
} from '../../../../../shared/admin/publishing'
import { ApiError, success } from '../../lib/api-error'
import {
	enforceRateLimit,
	requireCsrf,
	requireSession,
} from '../../middleware/session'
import { GitHubRepository } from '../articles/github-repository'
import {

	PublishingService,
} from './publishing-service'

export interface PublishingRoutesOptions {
	repositoryFactory?: (env: Env) => PublishingRepositoryPort
}

function parsePositiveInteger(value: string | undefined, fallback: number, maximum: number) {
	if (value === undefined || value === '')
		return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pagination value is invalid')
	return parsed
}

function parsePullNumber(value: string): number {
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed < 1)
		throw new ApiError('VALIDATION_FAILED', 400, 'Pull request number is invalid')
	return parsed
}

export function createPublishingRoutes(options: PublishingRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const repositoryFactory = options.repositoryFactory ?? (env => new GitHubRepository(env))

	routes.use('*', requireSession)

	routes.get('/runs', async (c) => {
		const data = await new PublishingService(c.env, repositoryFactory(c.env)).listRuns(
			parsePositiveInteger(c.req.query('page'), 1, 1_000_000),
			parsePositiveInteger(c.req.query('pageSize'), 30, 30),
		)
		return success(c, data)
	})

	routes.post('/pull-requests', requireCsrf, async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:publishing:create-pr`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			})
			const parsed = configPullRequestSchema.safeParse(raw)
			if (!parsed.success)
				throw new ApiError('VALIDATION_FAILED', 400, 'Pull Request input is invalid', parsed.error.flatten())
			const data = await new PublishingService(c.env, repositoryFactory(c.env)).publishConfig({
				...parsed.data,
				actor: {
					id: session.id,
					login: session.login,
					requestId: c.get('requestId'),
				},
			})
			return success(c, data, 201)
		})
	})

	routes.get('/pull-requests/:number', async (c) => {
		const data = await new PublishingService(c.env, repositoryFactory(c.env))
			.getPullRequestDetail(parsePullNumber(c.req.param('number')))
		return success(c, data)
	})

	routes.post('/pull-requests/:number/merge', requireCsrf, async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.id}:publishing:merge`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			}) as { expectedHeadSha?: unknown }
			if (typeof raw.expectedHeadSha !== 'string' || !raw.expectedHeadSha)
				throw new ApiError('VALIDATION_FAILED', 400, 'expectedHeadSha is required')
			const data = await new PublishingService(c.env, repositoryFactory(c.env)).mergePullRequest(
				parsePullNumber(c.req.param('number')),
				raw.expectedHeadSha,
				{
					id: session.id,
					login: session.login,
					requestId: c.get('requestId'),
				},
			)
			return success(c, data)
		})
	})

	return routes
}

export const publishingRoutes = createPublishingRoutes()
