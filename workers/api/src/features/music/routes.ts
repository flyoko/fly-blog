import type { AppEnvironment, Env } from '../../env'
import { Hono } from 'hono'
import { musicPlaylistPublishSchema, musicPlaylistSchema } from '../../../../../shared/admin/music'
import { ApiError, success } from '../../lib/api-error'
import { withIdempotency } from '../../lib/idempotency'
import { enforceRateLimit, requireCsrf, requireSession } from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { PublishRepository } from '../../repositories/publish-repository'
import { GitHubRepository } from '../articles/github-repository'

const playlistPath = 'content/playlists/default.json'

export interface MusicRepositoryPort {
	getFile: (path: string, ref: string) => Promise<{ path: string, sha: string, content: string }>
	getBranchHead: (branch: string) => Promise<string>
	createAtomicCommit: (input: {
		branch: string
		expectedHeadSha: string
		message: string
		files: Array<{ path: string, content: string | null }>
	}) => Promise<{ commitSha: string }>
}

export interface MusicRoutesOptions {
	repositoryFactory?: (env: Env) => MusicRepositoryPort
}

function parsePlaylist(content: string) {
	try {
		return musicPlaylistSchema.parse(JSON.parse(content))
	}
	catch (error) {
		throw new ApiError('UPSTREAM_FAILED', 502, 'Music playlist is invalid', error)
	}
}

export function createMusicRoutes(options: MusicRoutesOptions = {}) {
	const routes = new Hono<AppEnvironment>()
	const repositoryFactory = options.repositoryFactory ?? (env => new GitHubRepository(env))
	routes.use('*', requireSession)

	routes.get('/playlist', async (c) => {
		const file = await repositoryFactory(c.env).getFile(playlistPath, c.env.GITHUB_DEFAULT_BRANCH)
		return success(c, { playlist: parsePlaylist(file.content), sha: file.sha })
	})

	routes.put('/playlist', requireCsrf, async (c) => {
		const session = c.get('session')!
		return enforceRateLimit(c.env.WRITE_RATE_LIMITER, `${session.sessionId}:music-playlist`, async () => {
			const raw = await c.req.json().catch(() => {
				throw new ApiError('VALIDATION_FAILED', 400, 'Request body must be valid JSON')
			})
			const parsed = musicPlaylistPublishSchema.safeParse(raw)
			if (!parsed.success)
				throw new ApiError('VALIDATION_FAILED', 400, 'Music playlist input is invalid', parsed.error.flatten())
			const execution = await withIdempotency({
				db: c.env.DB,
				key: parsed.data.idempotencyKey,
				scope: `music.playlist:${session.id}`,
				requestBody: parsed.data,
				execute: async () => {
					const repository = repositoryFactory(c.env)
					const current = await repository.getFile(playlistPath, c.env.GITHUB_DEFAULT_BRANCH)
					if (current.sha !== parsed.data.expectedSha)
						throw new ApiError('CONFLICT', 409, 'Music playlist changed since it was loaded')
					const publishRepository = new PublishRepository(c.env.DB)
					const publishRunId = crypto.randomUUID()
					const createdAt = new Date().toISOString()
					await publishRepository.createRun({
						id: publishRunId,
						kind: 'direct',
						status: 'created',
						repositoryRef: c.env.GITHUB_DEFAULT_BRANCH,
						resourcePath: playlistPath,
						createdAt,
					})
					try {
						const head = await repository.getBranchHead(c.env.GITHUB_DEFAULT_BRANCH)
						const result = await repository.createAtomicCommit({
							branch: c.env.GITHUB_DEFAULT_BRANCH,
							expectedHeadSha: head,
							message: '更新随心听歌单',
							files: [{ path: playlistPath, content: `${JSON.stringify(parsed.data.playlist, null, 2)}\n` }],
						})
						await publishRepository.updateRun(publishRunId, {
							status: 'checks_pending',
							commitSha: result.commitSha,
							updatedAt: new Date().toISOString(),
						})
						await new AuditRepository(c.env.DB).writeAudit({
							actorId: session.id,
							actorLogin: session.login,
							action: 'music.playlist.update',
							targetType: 'repository_file',
							targetId: playlistPath,
							result: 'success',
							requestId: c.get('requestId'),
							metadata: { publishRunId, commitSha: result.commitSha },
						})
						return { status: 200, body: { publishRunId, commitSha: result.commitSha } }
					}
					catch (error) {
						await publishRepository.updateRun(publishRunId, {
							status: error instanceof ApiError && error.code === 'CONFLICT' ? 'conflict' : 'failed',
							errorCode: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
							errorMessage: error instanceof Error ? error.message : 'Music playlist update failed',
							updatedAt: new Date().toISOString(),
						})
						throw error
					}
				},
			})
			return success(c, execution.body)
		})
	})

	return routes
}

export const musicRoutes = createMusicRoutes()
