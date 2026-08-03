import type { AppEnvironment, Env } from './env'
import { Hono } from 'hono'
import { aboutRoutes } from './features/about/routes'
import { GitHubRepository } from './features/articles/github-repository'
import { createArticleRoutes } from './features/articles/routes'
import { authRoutes } from './features/auth/routes'
import { healthRoutes } from './features/health/routes'
import { publicMediaRoutes } from './features/media/public-routes'
import { mediaRoutes } from './features/media/routes'
import { momentBackupRoutes } from './features/moment-backups/routes'
import { MomentBackupService } from './features/moment-backups/service'
import { publicMomentRoutes } from './features/moments/public-routes'
import { adminMomentRoutes } from './features/moments/routes'
import { publicMusicRoutes } from './features/music/public-routes'
import { musicRoutes } from './features/music/routes'
import { adminNewsRoutes, publicNewsRoutes } from './features/news/routes'
import { NewsService } from './features/news/service'
import { overviewRoutes } from './features/overview/routes'
import { PublishingService } from './features/publishing/publishing-service'
import { publishingRoutes } from './features/publishing/routes'
import { adminWeatherRoutes, publicWeatherRoutes } from './features/weather/routes'
import { ApiError, failure, normalizeError } from './lib/api-error'
import { contextMiddleware } from './middleware/context'

export type ScheduledJob = 'news-sync' | 'moment-backup'

export interface ScheduledTaskServices {
	syncNews: () => Promise<unknown>
	backupMoments: () => Promise<unknown>
}

export function scheduledJobsFor(cron: string): ScheduledJob[] {
	switch (cron) {
		case '*/30 * * * *':
			return ['news-sync']
		case '17 19 * * *':
			return ['moment-backup', 'news-sync']
		default:
			return []
	}
}

export async function runScheduledTask(
	cron: string,
	env: Env,
	services: ScheduledTaskServices = {
		syncNews: () => new NewsService(env).sync(),
		backupMoments: () => new MomentBackupService(env).backup(),
	},
): Promise<void> {
	const runners: Record<ScheduledJob, () => Promise<unknown>> = {
		'news-sync': services.syncNews,
		'moment-backup': services.backupMoments,
	}
	await Promise.all(scheduledJobsFor(cron).map(job => runners[job]()))
}

const app = new Hono<AppEnvironment>()
const articleRoutes = createArticleRoutes({
	pullRequestPublisherFactory: env => new PublishingService(env, new GitHubRepository(env)),
})

app.use('*', contextMiddleware)
app.route('/api/admin/articles', articleRoutes)
app.route('/api/admin/about', aboutRoutes)
app.route('/api/admin/overview', overviewRoutes)
app.route('/api/admin/publishing', publishingRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/health', healthRoutes)
app.route('/api/admin/media', mediaRoutes)
app.route('/api/admin/music', musicRoutes)
app.route('/api/music', publicMusicRoutes)
app.route('/api/admin/moments', adminMomentRoutes)
app.route('/api/admin/moment-backups', momentBackupRoutes)
app.route('/api/moments', publicMomentRoutes)
app.route('/api/admin/news', adminNewsRoutes)
app.route('/api/news', publicNewsRoutes)
app.route('/api/admin/weather', adminWeatherRoutes)
app.route('/api/weather', publicWeatherRoutes)
app.route('/media', publicMediaRoutes)
app.notFound(c => failure(c, new ApiError('NOT_FOUND', 404, 'Route not found')))
app.onError((error, c) => failure(c, normalizeError(error)))

export { app }

export default {
	fetch(request, env, ctx) {
		return app.fetch(request, env, ctx)
	},
	scheduled(controller: ScheduledController, env: AppEnvironment['Bindings'], ctx: ExecutionContext) {
		ctx.waitUntil(runScheduledTask(controller.cron, env))
	},
} satisfies ExportedHandler<AppEnvironment['Bindings']>
