import type { AppEnvironment } from './env'
import type { ScheduledTaskMessage } from './scheduled-tasks'
import { Hono } from 'hono'
import { aboutRoutes } from './features/about/routes'
import { adminAnalyticsRoutes, internalAnalyticsRoutes, publicAnalyticsRoutes } from './features/analytics/routes'
import { GitHubRepository } from './features/articles/github-repository'
import { createArticleRoutes } from './features/articles/routes'
import { authRoutes } from './features/auth/routes'
import { adminFinanceRoutes, publicFinanceRoutes } from './features/finance/routes'
import { healthRoutes } from './features/health/routes'
import { publicMarketRoutes } from './features/market/routes'
import { publicMediaRoutes } from './features/media/public-routes'
import { mediaRoutes } from './features/media/routes'
import { momentBackupRoutes } from './features/moment-backups/routes'
import { publicMomentRoutes } from './features/moments/public-routes'
import { adminMomentRoutes } from './features/moments/routes'
import { publicMusicRoutes } from './features/music/public-routes'
import { musicRoutes } from './features/music/routes'
import { adminNewsRoutes, publicNewsRoutes } from './features/news/routes'
import { overviewRoutes } from './features/overview/routes'
import { PublishingService } from './features/publishing/publishing-service'
import { publishingRoutes } from './features/publishing/routes'
import { adminWeatherRoutes, publicWeatherRoutes } from './features/weather/routes'
import { ApiError, failure, normalizeError } from './lib/api-error'
import { contextMiddleware } from './middleware/context'
import { enqueueScheduledTask, processScheduledBatch } from './scheduled-tasks'

const app = new Hono<AppEnvironment>()
const articleRoutes = createArticleRoutes({
	pullRequestPublisherFactory: env => new PublishingService(env, new GitHubRepository(env)),
})

app.use('*', contextMiddleware)
app.route('/internal/analytics', internalAnalyticsRoutes)
app.route('/api/analytics', publicAnalyticsRoutes)
app.route('/api/admin/analytics', adminAnalyticsRoutes)
app.route('/api/admin/articles', articleRoutes)
app.route('/api/admin/about', aboutRoutes)
app.route('/api/admin/overview', overviewRoutes)
app.route('/api/admin/publishing', publishingRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/health', healthRoutes)
app.route('/api/admin/finance', adminFinanceRoutes)
app.route('/api/finance', publicFinanceRoutes)
app.route('/api/market', publicMarketRoutes)
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
		ctx.waitUntil(enqueueScheduledTask(controller.cron, controller.scheduledTime, env))
	},
	async queue(batch: MessageBatch<ScheduledTaskMessage>, env: AppEnvironment['Bindings']) {
		await processScheduledBatch(batch, env)
	},
} satisfies ExportedHandler<AppEnvironment['Bindings'], ScheduledTaskMessage>
