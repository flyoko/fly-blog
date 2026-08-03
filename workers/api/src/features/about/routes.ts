import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { aboutLinksSchema, aboutProfilePublishSchema, aboutTimelineSchema } from '../../../../../shared/admin/about'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { PublishRepository } from '../../repositories/publish-repository'
import { GitHubRepository } from '../articles/github-repository'
import { parseAboutProfile, serializeAboutProfile } from './codec'

const profilePath = 'content/about/profile.md'
const timelinePath = 'config/about/timeline.json'
const linksPath = 'config/about/links.json'

export const aboutRoutes = new Hono<AppEnvironment>()
aboutRoutes.use('*', requireSession)

aboutRoutes.get('/', async (c) => {
	const repository = new GitHubRepository(c.env)
	const [profileFile, timelineFile, linksFile] = await Promise.all([
		repository.getFile(profilePath, c.env.GITHUB_DEFAULT_BRANCH),
		repository.getFile(timelinePath, c.env.GITHUB_DEFAULT_BRANCH),
		repository.getFile(linksPath, c.env.GITHUB_DEFAULT_BRANCH),
	])
	let timeline
	let links
	try {
		timeline = aboutTimelineSchema.parse(JSON.parse(timelineFile.content))
		links = aboutLinksSchema.parse(JSON.parse(linksFile.content))
	}
	catch (error) {
		throw new ApiError('UPSTREAM_FAILED', 502, 'About structured content is invalid', error)
	}
	return success(c, {
		profile: parseAboutProfile(profileFile),
		timeline: { items: timeline, sha: timelineFile.sha },
		links: { items: links, sha: linksFile.sha },
	})
})

aboutRoutes.put('/profile', requireCsrf, async (c) => {
	const session = c.get('session')!
	return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:about:profile`, async () => {
		const raw = await c.req.json().catch(() => {
			throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
		})
		const parsed = aboutProfilePublishSchema.safeParse(raw)
		if (!parsed.success)
			throw new ApiError('VALIDATION_FAILED', 400, 'About profile input is invalid', parsed.error.flatten())
		const execution = await withIdempotency({
			db: c.env.DB,
			key: parsed.data.idempotencyKey,
			scope: `about.profile:${session.id}`,
			requestBody: parsed.data,
			execute: async () => {
				const repository = new GitHubRepository(c.env)
				const current = await repository.getFile(profilePath, c.env.GITHUB_DEFAULT_BRANCH)
				if (parsed.data.expectedSha && current.sha !== parsed.data.expectedSha)
					throw new ApiError('CONFLICT', 409, 'About profile changed since it was loaded')
				const publishRunId = crypto.randomUUID()
				const at = new Date().toISOString()
				const publishRepository = new PublishRepository(c.env.DB)
				await publishRepository.createRun({
					id: publishRunId,
					kind: 'direct',
					status: 'created',
					repositoryRef: c.env.GITHUB_DEFAULT_BRANCH,
					resourcePath: profilePath,
					createdAt: at,
				})
				try {
					const head = await repository.getBranchHead(c.env.GITHUB_DEFAULT_BRANCH)
					const result = await repository.createAtomicCommit({
						branch: c.env.GITHUB_DEFAULT_BRANCH,
						expectedHeadSha: head,
						message: '更新自述正文',
						files: [{ path: profilePath, content: serializeAboutProfile(parsed.data.profile) }],
					})
					await publishRepository.updateRun(publishRunId, {
						status: 'checks_pending',
						commitSha: result.commitSha,
						updatedAt: new Date().toISOString(),
					})
					await new AuditRepository(c.env.DB).writeAudit({
						actorId: session.id,
						actorLogin: session.login,
						action: 'about.profile.update',
						targetType: 'repository_file',
						targetId: profilePath,
						result: 'success',
						requestId: c.get('requestId'),
						metadata: { publishRunId, commitSha: result.commitSha },
					})
					return { status: 200, body: { publishRunId, commitSha: result.commitSha } }
				}
				catch (error) {
					await publishRepository.updateRun(publishRunId, {
						status: 'failed',
						errorCode: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
						errorMessage: error instanceof Error ? error.message : 'About profile update failed',
						updatedAt: new Date().toISOString(),
					})
					throw error
				}
			},
		})
		return success(c, execution.body)
	})
})
