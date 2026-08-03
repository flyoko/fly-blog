import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { AppEnvironment, Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { Hono } from 'hono'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publicMomentRoutes } from '../src/features/moments/public-routes'
import { adminMomentRoutes } from '../src/features/moments/routes'
import { failure, normalizeError } from '../src/lib/api-error'
import { sha256Base64Url } from '../src/lib/crypto'
import { contextMiddleware } from '../src/middleware/context'

const testEnv = env as typeof env & { DB: D1Database, TEST_MIGRATIONS: D1Migration[] }
const sessionToken = 'moment-session-token'
const csrfToken = 'moment-csrf-token'

function limiter(): RateLimit {
	return { limit: async () => ({ success: true }) } as RateLimit
}

function runtimeEnv(): Env {
	return {
		...testEnv,
		AUTH_RATE_LIMITER: limiter(),
		WRITE_RATE_LIMITER: limiter(),
		PUBLIC_ORIGIN: 'https://blog.example.test',
		PAGES_ORIGIN: 'https://pages.example.test',
		MEDIA_ORIGIN: 'https://blog.example.test/media',
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
		SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(8))),
		VISITOR_HMAC_KEY: 'visitor-test-secret',
	} as Env
}

function app() {
	const app = new Hono<AppEnvironment>()
	app.use('*', contextMiddleware)
	app.route('/api/admin/moments', adminMomentRoutes)
	app.route('/api/moments', publicMomentRoutes)
	app.onError((error, c) => failure(c, normalizeError(error)))
	return app
}

async function admin(path: string, init: RequestInit = {}) {
	const headers = new Headers(init.headers)
	headers.set('cookie', `fly_admin_session=${sessionToken}; fly_admin_csrf=${csrfToken}`)
	if (init.method && init.method !== 'GET') {
		headers.set('origin', 'https://blog.example.test')
		headers.set('x-csrf-token', csrfToken)
		headers.set('content-type', 'application/json')
	}
	return app().request(`https://blog.example.test${path}`, { ...init, headers }, runtimeEnv())
}

beforeAll(async () => applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS))
beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM moment_likes'),
		testEnv.DB.prepare('DELETE FROM moment_media'),
		testEnv.DB.prepare('DELETE FROM moments'),
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
		await sha256Base64Url(sessionToken),
		await sha256Base64Url(csrfToken),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
})

describe('moments API', () => {
	it('creates a draft, publishes it, and exposes it publicly', async () => {
		const create = await admin('/api/admin/moments', {
			method: 'POST',
			body: JSON.stringify({
				moment: { content: '今天开始记录瞬间。', status: 'draft', tags: ['生活'], city: 'Shanghai', mediaIds: [] },
				idempotencyKey: 'moment-create-0001',
			}),
		})
		expect(create.status).toBe(201)
		const created = (await create.json() as { data: { id: string, version: number } }).data

		const before = await app().request('https://blog.example.test/api/moments', {}, runtimeEnv())
		expect(await before.json()).toMatchObject({ data: { total: 0 } })

		const publish = await admin(`/api/admin/moments/${created.id}/publish`, {
			method: 'POST',
			body: JSON.stringify({ expectedVersion: created.version, idempotencyKey: 'moment-publish-0001' }),
		})
		expect(publish.status).toBe(200)
		expect(await publish.json()).toMatchObject({ data: { status: 'published', version: 2 } })

		const url = 'https://blog.example.test/api/moments?tag=%E7%94%9F%E6%B4%BB&year=2026'
		const after = await app().request(url, {}, runtimeEnv())
		expect(after.headers.get('x-fly-cache')).toBe('MISS')
		expect(await after.json()).toMatchObject({ data: { total: 1, items: [{ id: created.id, likeCount: 0 }] } })
		const cached = await app().request(url, {}, runtimeEnv())
		expect(cached.headers.get('x-fly-cache')).toBe('HIT')
	})

	it('sets an opaque visitor cookie and deduplicates likes', async () => {
		const created = (await (await admin('/api/admin/moments', {
			method: 'POST',
			body: JSON.stringify({ moment: { content: 'liked', status: 'published', tags: [], mediaIds: [] }, idempotencyKey: 'moment-create-0002' }),
		})).json() as { data: { id: string } }).data

		const first = await app().request(`https://blog.example.test/api/moments/${created.id}/likes`, {
			method: 'POST',
			headers: { origin: 'https://blog.example.test' },
		}, runtimeEnv())
		expect(first.status).toBe(200)
		expect(await first.clone().json()).toMatchObject({ data: { liked: true, likeCount: 1 } })
		const cookie = first.headers.get('set-cookie')!
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('Secure')

		const second = await app().request(`https://blog.example.test/api/moments/${created.id}/likes`, {
			method: 'POST',
			headers: { origin: 'https://blog.example.test', cookie: cookie.split(';')[0]! },
		}, runtimeEnv())
		expect(await second.json()).toMatchObject({ data: { liked: true, likeCount: 1 } })
	})

	it('enforces admin authentication, same-origin writes, and optimistic versions', async () => {
		const unauthorized = await app().request('https://blog.example.test/api/admin/moments', {}, runtimeEnv())
		expect(unauthorized.status).toBe(401)

		const badOrigin = await app().request('https://blog.example.test/api/admin/moments', {
			method: 'POST',
			headers: { 'cookie': `fly_admin_session=${sessionToken}`, 'origin': 'https://evil.test', 'x-csrf-token': csrfToken, 'content-type': 'application/json' },
			body: JSON.stringify({ moment: { content: 'bad', mediaIds: [] }, idempotencyKey: 'moment-create-0003' }),
		}, runtimeEnv())
		expect(badOrigin.status).toBe(403)

		const created = (await (await admin('/api/admin/moments', {
			method: 'POST',
			body: JSON.stringify({ moment: { content: 'v1', mediaIds: [] }, idempotencyKey: 'moment-create-0004' }),
		})).json() as { data: { id: string } }).data
		const updateBody = { moment: { content: 'v2', status: 'draft', tags: [], mediaIds: [] }, expectedVersion: 1, idempotencyKey: 'moment-update-0001' }
		expect((await admin(`/api/admin/moments/${created.id}`, { method: 'PUT', body: JSON.stringify(updateBody) })).status).toBe(200)
		const conflict = await admin(`/api/admin/moments/${created.id}`, { method: 'PUT', body: JSON.stringify({ ...updateBody, idempotencyKey: 'moment-update-0002' }) })
		expect(conflict.status).toBe(409)
	})
})
