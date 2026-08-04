import type { AppEnvironment, Env } from '../../env'
import type { ArticleRepositoryPort } from '../articles/article-service'
import type { PublishingStatusRepositoryPort } from '../publishing/publishing-service'
import { Hono } from 'hono'
import { success } from '../../lib/api-error'
import { requireSession } from '../../middleware/session'
import { MediaRepository } from '../../repositories/media-repository'
import { PublishRepository } from '../../repositories/publish-repository'
import { GitHubRepository } from '../articles/github-repository'
import { reconcileActivePublishRuns } from '../publishing/publishing-service'

export type ServiceName = 'github' | 'd1' | 'r2' | 'pages'

export interface ServiceHealth {
	service: ServiceName
	status: 'ok' | 'degraded' | 'down'
	checkedAt: string
	message?: string
}

export interface OverviewProbeContext {
	env: Env
	articleRepository: ArticleRepositoryPort
}

export type OverviewProbe = (context: OverviewProbeContext) => Promise<{
	service: ServiceName
	status: ServiceHealth['status']
	message?: string
}>

export interface OverviewRoutesOptions {
	articleRepositoryFactory?: (env: Env) => ArticleRepositoryPort
	publishingRepositoryFactory?: (env: Env) => PublishingStatusRepositoryPort
	probes?: Partial<Record<ServiceName, OverviewProbe>>
	timeoutMs?: number
	now?: () => Date
	fetcher?: typeof fetch
}

function safeMessage(error: unknown): string {
	if (error instanceof Error && error.message)
		return error.message.slice(0, 240)
	return 'Dependency probe failed'
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
			}),
		])
	}
	finally {
		if (timer !== undefined)
			clearTimeout(timer)
	}
}

async function safeValue<T>(operation: () => Promise<T>): Promise<T | null> {
	try {
		return await operation()
	}
	catch {
		return null
	}
}

function defaultProbes(fetcher: typeof fetch): Record<ServiceName, OverviewProbe> {
	return {
		github: async ({ env, articleRepository }) => {
			await articleRepository.getBranchHead(env.GITHUB_DEFAULT_BRANCH)
			return { service: 'github', status: 'ok' }
		},
		d1: async ({ env }) => {
			await env.DB.prepare('SELECT 1 AS ok').first()
			return { service: 'd1', status: 'ok' }
		},
		r2: async ({ env }) => {
			await env.MEDIA.list({ limit: 1 })
			return { service: 'r2', status: 'ok' }
		},
		pages: async ({ env }) => {
			const response = await fetcher(env.PAGES_ORIGIN, {
				method: 'HEAD',
				redirect: 'manual',
			})
			if (response.status >= 200 && response.status < 300)
				return { service: 'pages', status: 'ok' }
			if (response.status >= 300 && response.status < 400) {
				return {
					service: 'pages',
					status: 'degraded',
					message: `Pages returned redirect status ${response.status}`,
				}
			}
			throw new Error(`Pages returned status ${response.status}`)
		},
	}
}

export function createOverviewRoutes(options: OverviewRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const articleRepositoryFactory = options.articleRepositoryFactory ?? (env => new GitHubRepository(env))
	const publishingRepositoryFactory = options.publishingRepositoryFactory ?? (env => new GitHubRepository(env))
	const timeoutMs = options.timeoutMs ?? 2_000
	const now = options.now ?? (() => new Date())
	const probes = { ...defaultProbes(options.fetcher ?? fetch), ...options.probes }

	routes.use('*', requireSession)

	routes.get('/', async (c) => {
		const articleRepository = articleRepositoryFactory(c.env)
		const mediaRepository = new MediaRepository(c.env.DB)
		const publishRepository = new PublishRepository(c.env.DB)
		await reconcileActivePublishRuns(c.env.DB, publishingRepositoryFactory(c.env)).catch(() => undefined)
		const [
			articles,
			activeMedia,
			publishedMoments,
			publishedNews,
			openPullRequests,
			pendingPublishes,
			failedPublishes,
			latestPublish,
			backupState,
		] = await Promise.all([
			safeValue(async () => (await articleRepository.listFiles('content/posts/', c.env.GITHUB_DEFAULT_BRANCH)).length),
			safeValue(() => mediaRepository.countByStatus('active')),
			safeValue(async () => (await c.env.DB.prepare('SELECT COUNT(*) AS count FROM moments WHERE status = \'published\'').first<{ count: number }>())?.count ?? 0),
			safeValue(async () => (await c.env.DB.prepare('SELECT COUNT(*) AS count FROM news_items WHERE selected = 1').first<{ count: number }>())?.count ?? 0),
			safeValue(() => publishRepository.countOpenPullRequests()),
			safeValue(() => publishRepository.countByStatuses(['created', 'commit_created', 'checks_pending'])),
			safeValue(() => publishRepository.countByStatuses(['failed', 'conflict'])),
			safeValue(() => publishRepository.latestRun()),
			safeValue(() => c.env.DB.prepare('SELECT last_success_at, last_backup_path, last_error FROM moment_backup_state WHERE singleton = 1').first()),
		])

		const checkedAt = now().toISOString()
		const services = await Promise.all((['github', 'd1', 'r2', 'pages'] as const).map(async (service) => {
			try {
				const result = await withTimeout(probes[service]({ env: c.env, articleRepository }), timeoutMs)
				return { ...result, service, checkedAt } satisfies ServiceHealth
			}
			catch (error) {
				return {
					service,
					status: 'down',
					checkedAt,
					message: safeMessage(error),
				} satisfies ServiceHealth
			}
		}))

		return success(c, {
			counts: {
				articles,
				activeMedia,
				publishedMoments,
				publishedNews,
				openPullRequests,
				pendingPublishes,
				failedPublishes,
			},
			latestPublish,
			backupState,
			services,
		})
	})

	return routes
}

export const overviewRoutes = createOverviewRoutes()
