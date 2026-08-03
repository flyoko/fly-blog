import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import type { MusicRepositoryPort } from '../src/features/music/routes'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
