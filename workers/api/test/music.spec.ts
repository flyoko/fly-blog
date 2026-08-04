import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { MusicRepositoryPort } from '../src/features/music/routes'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPublicMusicRoutes } from '../src/features/music/public-routes'
import { createMusicRoutes } from '../src/features/music/routes'
import { failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const playlist = {
	title: '随心听',
	description: '合法音频',
	tracks: [{
		id: 'sample-track',
		title: 'Sample',
		artist: 'flyoko',
		audioUrl: 'https://media.example.com/music/sample.mp3',
		coverUrl: null,
		duration: 120,
		enabled: true,
		order: 0,
	}],
}

class FakeMusicRepository implements MusicRepositoryPort {
	sha = 'playlist-sha'
	head = 'main-head'
	content = JSON.stringify(playlist)
	commits: Parameters<MusicRepositoryPort['createAtomicCommit']>[0][] = []

	async getFile(path: string) {
		return { path, sha: this.sha, content: this.content }
	}

	async getBranchHead() {
		return this.head
	}

	async createAtomicCommit(input: Parameters<MusicRepositoryPort['createAtomicCommit']>[0]) {
		this.commits.push(input)
		return { commitSha: 'music-commit' }
	}
}

function rateLimiter(): RateLimit {
	return { limit: async () => ({ success: true }) } as RateLimit
}

function runtimeEnv(): Env {
	return {
		...testEnv,
		AUTH_RATE_LIMITER: rateLimiter(),
		WRITE_RATE_LIMITER: rateLimiter(),
		PUBLIC_ORIGIN: 'https://blog.example.test',
		PAGES_ORIGIN: 'https://pages.example.test',
		MEDIA_ORIGIN: 'https://media.example.test',
		GITHUB_API_BASE_URL: 'https://api.github.test',
		GITHUB_OAUTH_BASE_URL: 'https://github.test',
		GITHUB_OWNER: 'flyoko',
		GITHUB_REPO: 'fly-blog',
		GITHUB_DEFAULT_BRANCH: 'main',
		GITHUB_APP_ID: '1',
		GITHUB_CLIENT_ID: 'client',
		GITHUB_CLIENT_SECRET: 'secret',
		GITHUB_PRIVATE_KEY: '',
		GITHUB_INSTALLATION_ID: '2',
		GITHUB_ALLOWED_LOGIN: 'flyoko',
		GITHUB_ALLOWED_USER_ID: '42',
		SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(6))),
	} as Env
}

function createApp(repository: FakeMusicRepository) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/music', createMusicRoutes({ repositoryFactory: () => repository }))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

function createPublicApp(enabled: boolean) {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/music', createPublicMusicRoutes({ enabled, playlist }))
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

function headers() {
	return {
		'cookie': 'fly_admin_session=music-session',
		'origin': 'https://blog.example.test',
		'x-csrf-token': 'music-csrf',
		'content-type': 'application/json',
	}
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM publish_runs'),
		testEnv.DB.prepare('DELETE FROM idempotency_keys'),
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM media_references'),
		testEnv.DB.prepare('DELETE FROM media_objects'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
	`).bind(
		await sha256Base64Url('music-session'),
		await sha256Base64Url('music-csrf'),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
})

describe('music playlist routes', () => {
	it('reads a validated playlist and commits a minimal update', async () => {
		const repository = new FakeMusicRepository()
		const app = createApp(repository)
		const read = await app.request('https://blog.example.test/api/admin/music/playlist', { headers: headers() }, runtimeEnv())
		expect(await read.json()).toMatchObject({ ok: true, data: { sha: 'playlist-sha', playlist: { title: '随心听' } } })

		const update = await app.request('https://blog.example.test/api/admin/music/playlist', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ playlist, expectedSha: 'playlist-sha', idempotencyKey: 'music-update-one' }),
		}, runtimeEnv())
		expect(update.status).toBe(200)
		expect(await update.json()).toMatchObject({ ok: true, data: { commitSha: 'music-commit' } })
		expect(repository.commits).toHaveLength(1)
		expect(repository.commits[0]).toMatchObject({ branch: 'main', files: [{ path: 'content/playlists/default.json' }] })
		expect(repository.commits[0]!.files[0]!.content).toContain('sample-track')
	})

	it('allows the Pages backup origin to read the public playlist without opening admin CORS', async () => {
		const app = createPublicApp(true)
		const pagesResponse = await app.request('https://blog.example.test/api/music/playlist', {
			headers: { origin: 'https://pages.example.test' },
		}, runtimeEnv())
		expect(pagesResponse.status).toBe(200)
		expect(pagesResponse.headers.get('access-control-allow-origin')).toBe('https://pages.example.test')
		expect(pagesResponse.headers.get('vary')).toContain('Origin')

		const unrelatedResponse = await app.request('https://blog.example.test/api/music/playlist', {
			headers: { origin: 'https://unrelated.example.test' },
		}, runtimeEnv())
		expect(unrelatedResponse.headers.get('access-control-allow-origin')).toBeNull()
	})

	it('publishes only enabled tracks when the public module is enabled', async () => {
		const playlistWithPrivateMetadata = structuredClone(playlist)
		Object.assign(playlistWithPrivateMetadata.tracks[0]!, { internalNote: 'must not be public' })
		const app = new Hono<AppEnvironment>()
		app.use('*', contextMiddleware)
		app.route('/api/music', createPublicMusicRoutes({ enabled: true, playlist: playlistWithPrivateMetadata }))
		app.onError((error, c) => failure(c, normalizeError(error)))
		const response = await app.request('https://blog.example.test/api/music/playlist', {}, runtimeEnv())
		expect(response.status).toBe(200)
		const body = await response.json() as { data: { tracks: Array<Record<string, unknown>> } }
		expect(body).toMatchObject({
			ok: true,
			data: { enabled: true, title: '随心听', tracks: [{ id: 'sample-track' }] },
		})
		expect(body.data.tracks[0]).not.toHaveProperty('internalNote')

		const disabled = await createPublicApp(false).request('https://blog.example.test/api/music/playlist', {}, runtimeEnv())
		expect(await disabled.json()).toMatchObject({ ok: true, data: { enabled: false, tracks: [] } })
	})

	it('records R2 references for audio and cover URLs after commit', async () => {
		const mediaUrl = 'https://media.example.com/music/sample.mp3'
		await testEnv.DB.prepare(`
			INSERT INTO media_objects (
				id, object_key, original_name, purpose, mime_type, size_bytes,
				sha256, status, public_url, created_at
			) VALUES ('music-media', 'music/sample.mp3', 'sample.mp3', 'music', 'audio/mpeg', 2048,
				'sha', 'active', ?, '2026-08-03T00:00:00.000Z')
		`).bind(mediaUrl).run()
		const repository = new FakeMusicRepository()
		const app = createApp(repository)
		const referenced = structuredClone(playlist)
		referenced.tracks[0]!.audioUrl = mediaUrl
		const response = await app.request('https://blog.example.test/api/admin/music/playlist', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ playlist: referenced, expectedSha: 'playlist-sha', idempotencyKey: 'music-reference-one' }),
		}, { ...runtimeEnv(), MEDIA_ORIGIN: 'https://media.example.com' })
		expect(response.status).toBe(200)
		const row = await testEnv.DB.prepare('SELECT media_id, repository_path, repository_sha FROM media_references WHERE media_id = ?')
			.bind('music-media')
			.first<{ media_id: string, repository_path: string, repository_sha: string }>()
		expect(row).toEqual({ media_id: 'music-media', repository_path: 'content/playlists/default.json', repository_sha: 'music-commit' })
	})

	it('rejects stale SHAs and unsafe audio URLs before committing', async () => {
		const repository = new FakeMusicRepository()
		const app = createApp(repository)
		const conflict = await app.request('https://blog.example.test/api/admin/music/playlist', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ playlist, expectedSha: 'stale', idempotencyKey: 'music-update-two' }),
		}, runtimeEnv())
		expect(conflict.status).toBe(409)

		const unsafe = structuredClone(playlist)
		unsafe.tracks[0]!.audioUrl = 'http://127.0.0.1/private.mp3'
		const denied = await app.request('https://blog.example.test/api/admin/music/playlist', {
			method: 'PUT',
			headers: headers(),
			body: JSON.stringify({ playlist: unsafe, expectedSha: 'playlist-sha', idempotencyKey: 'music-update-three' }),
		}, runtimeEnv())
		expect(denied.status).toBe(400)
		expect(repository.commits).toHaveLength(0)
	})
})
