import type { AppEnvironment } from './env'
import { Hono } from 'hono'
import { GitHubRepository } from './features/articles/github-repository'
import { createArticleRoutes } from './features/articles/routes'
import { authRoutes } from './features/auth/routes'
import { healthRoutes } from './features/health/routes'
import { publicMediaRoutes } from './features/media/public-routes'
import { mediaRoutes } from './features/media/routes'
import { overviewRoutes } from './features/overview/routes'
import { PublishingService } from './features/publishing/publishing-service'
import { publishingRoutes } from './features/publishing/routes'
import { ApiError, failure, normalizeError } from './lib/api-error'
import { contextMiddleware } from './middleware/context'

const app = new Hono<AppEnvironment>()
const articleRoutes = createArticleRoutes({
	pullRequestPublisherFactory: env => new PublishingService(env, new GitHubRepository(env)),
})

app.use('*', contextMiddleware)
app.route('/api/admin/articles', articleRoutes)
app.route('/api/admin/overview', overviewRoutes)
app.route('/api/admin/publishing', publishingRoutes)
app.route('/api/auth', authRoutes)
app.route('/api/health', healthRoutes)
app.route('/api/admin/media', mediaRoutes)
app.route('/media', publicMediaRoutes)
app.notFound(c => failure(c, new ApiError('NOT_FOUND', 404, 'Route not found')))
app.onError((error, c) => failure(c, normalizeError(error)))

export { app }
export default app
