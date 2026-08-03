import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import { applyD1Migrations, env } from 'cloudflare:test'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/index'
import { openOAuthState, sha256Base64Url } from '../src/lib/crypto'
import { enforceRateLimit } from '../src/middleware/session'

const testEnv = env as typeof env & {
	DB: D1Database
	TEST_MIGRATIONS: D1Migration[]
}

const sessionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

function rateLimiter(success = true): RateLimit {
	return {
		limit: async () => ({ success }),
	} as RateLimit
}

function authEnv(overrides: Partial<import('../src/env').Env> = {}): import('../src/env').Env {
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
		GITHUB_DEFAULT_BRANCH: 'setup/personalize',
		GITHUB_APP_ID: '1',
		GITHUB_CLIENT_ID: 'client-id',
		GITHUB_CLIENT_SECRET: 'client-secret',
		GITHUB_PRIVATE_KEY: '',
		GITHUB_INSTALLATION_ID: '2',
		GITHUB_ALLOWED_LOGIN: 'flyoko',
		GITHUB_ALLOWED_USER_ID: '42',
		SESSION_ENCRYPTION_KEY: sessionKey,
		...overrides,
	}
}

function firstCookie(response: Response, name: string): string {
	const cookies = response.headers.get('set-cookie') ?? ''
	const match = cookies.match(new RegExp(`${name}=([^;,]+)`))
	if (!match)
		throw new Error(`Cookie ${name} was not found: ${cookies}`)
	return `${name}=${match[1]}`
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('oauth login', () => {
	it('creates sealed state and a PKCE S256 GitHub redirect', async () => {
		const response = await app.request('https://blog.example.test/api/auth/login', {}, authEnv())
		expect(response.status).toBe(302)
		const location = new URL(response.headers.get('location')!)
		expect(location.origin).toBe('https://github.test')
		expect(location.pathname).toBe('/login/oauth/authorize')
		expect(location.searchParams.get('client_id')).toBe('client-id')
		expect(location.searchParams.get('code_challenge_method')).toBe('S256')
		expect(location.searchParams.get('allow_signup')).toBe('false')
		expect(location.searchParams.get('prompt')).toBe('select_account')

		const stateToken = location.searchParams.get('state')!
		const state = await openOAuthState(stateToken, sessionKey)
		expect(location.searchParams.get('code_challenge')).toBe(await sha256Base64Url(state.codeVerifier))
		const cookie = response.headers.get('set-cookie') ?? ''
		expect(cookie).toContain(`fly_admin_oauth=${stateToken}`)
		expect(cookie).toContain('HttpOnly')
		expect(cookie).toContain('Max-Age=600')
	})

	it('rejects a state-cookie mismatch before calling GitHub', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch')
		const response = await app.request(
			'https://blog.example.test/api/auth/callback?code=abc&state=wrong',
			{ headers: { cookie: 'fly_admin_oauth=different' } },
			authEnv(),
		)
		expect(response.status).toBe(400)
		expect(fetchSpy).not.toHaveBeenCalled()
	})
})

describe('oauth callback and session', () => {
	it('allows only the configured login and immutable GitHub user id', async () => {
		const runtimeEnv = authEnv()
		const login = await app.request('https://blog.example.test/api/auth/login', {}, runtimeEnv)
		const location = new URL(login.headers.get('location')!)
		const state = location.searchParams.get('state')!
		const oauthCookie = firstCookie(login, 'fly_admin_oauth')

		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = typeof input === 'string'
				? input
				: input instanceof Request
					? input.url
					: input.toString()
			if (url === 'https://github.test/login/oauth/access_token')
				return Response.json({ access_token: 'temporary-user-token', token_type: 'bearer' })
			if (url === 'https://api.github.test/user')
				return Response.json({ id: 42, login: 'flyoko', avatar_url: 'https://example.test/avatar.png' })
			return new Response('unexpected', { status: 500 })
		})

		const callback = await app.request(
			`https://blog.example.test/api/auth/callback?code=abc&state=${encodeURIComponent(state)}`,
			{ headers: { cookie: oauthCookie } },
			runtimeEnv,
		)
		expect(callback.status).toBe(302)
		expect(callback.headers.get('location')).toBe('https://blog.example.test/admin')
		const cookies = callback.headers.get('set-cookie') ?? ''
		expect(cookies).toContain('fly_admin_session=')
		expect(cookies).toContain('HttpOnly')
		expect(cookies).toContain('Secure')
		expect(cookies).toContain('SameSite=Lax')
		expect(cookies).toContain('fly_admin_csrf=')
		expect(cookies).toContain('SameSite=Strict')
		expect(cookies).toContain('Max-Age=43200')

		const sessionCookie = firstCookie(callback, 'fly_admin_session')
		const session = await app.request(
			'https://blog.example.test/api/auth/session',
			{ headers: { cookie: sessionCookie } },
			runtimeEnv,
		)
		expect(await session.json()).toMatchObject({
			ok: true,
			data: { authenticated: true, user: { id: '42', login: 'flyoko' } },
		})
	})

	it('rejects a matching username with a different immutable id', async () => {
		const runtimeEnv = authEnv()
		const login = await app.request('https://blog.example.test/api/auth/login', {}, runtimeEnv)
		const state = new URL(login.headers.get('location')!).searchParams.get('state')!
		vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ access_token: 'token' })).mockResolvedValueOnce(Response.json({ id: 99, login: 'flyoko', avatar_url: '' }))

		const callback = await app.request(
			`https://blog.example.test/api/auth/callback?code=abc&state=${encodeURIComponent(state)}`,
			{ headers: { cookie: firstCookie(login, 'fly_admin_oauth') } },
			runtimeEnv,
		)
		expect(callback.status).toBe(403)
		const count = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM admin_sessions').first<{ count: number }>()
		expect(count?.count).toBe(0)
	})
})

describe('csrf, logout, expiry, and limiting', () => {
	it('rejects a logout with missing CSRF and revokes a valid session', async () => {
		const runtimeEnv = authEnv()
		await testEnv.DB.prepare(`
			INSERT INTO admin_sessions (
				id_hash, github_user_id, github_login, avatar_url, csrf_hash,
				created_at, last_seen_at, expires_at
			) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
		`).bind(
			await sha256Base64Url('session-token'),
			await sha256Base64Url('csrf-token'),
			'2026-08-03T00:00:00.000Z',
			'2026-08-03T00:00:00.000Z',
			'2099-08-03T12:00:00.000Z',
		).run()

		const denied = await app.request('https://blog.example.test/api/auth/logout', {
			method: 'POST',
			headers: { cookie: 'fly_admin_session=session-token', origin: runtimeEnv.PUBLIC_ORIGIN },
		}, runtimeEnv)
		expect(denied.status).toBe(403)

		const logout = await app.request('https://blog.example.test/api/auth/logout', {
			method: 'POST',
			headers: {
				'cookie': 'fly_admin_session=session-token',
				'origin': runtimeEnv.PUBLIC_ORIGIN,
				'x-csrf-token': 'csrf-token',
			},
		}, runtimeEnv)
		expect(logout.status).toBe(204)
		const row = await testEnv.DB.prepare('SELECT revoked_at FROM admin_sessions').first<{ revoked_at: string | null }>()
		expect(row?.revoked_at).toBeTruthy()
	})

	it('does not authenticate an expired session', async () => {
		const runtimeEnv = authEnv()
		await testEnv.DB.prepare(`
			INSERT INTO admin_sessions (
				id_hash, github_user_id, github_login, avatar_url, csrf_hash,
				created_at, last_seen_at, expires_at
			) VALUES (?, '42', 'flyoko', '', 'csrf', ?, ?, ?)
		`).bind(
			await sha256Base64Url('expired-token'),
			'2020-01-01T00:00:00.000Z',
			'2020-01-01T00:00:00.000Z',
			'2020-01-01T01:00:00.000Z',
		).run()
		const response = await app.request(
			'https://blog.example.test/api/auth/session',
			{ headers: { cookie: 'fly_admin_session=expired-token' } },
			runtimeEnv,
		)
		expect(await response.json()).toMatchObject({ ok: true, data: { authenticated: false } })
	})

	it('returns RATE_LIMITED without running a blocked action', async () => {
		let actionCalls = 0
		await expect(enforceRateLimit(rateLimiter(false), 'ip:route', async () => {
			actionCalls++
		})).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
		expect(actionCalls).toBe(0)
	})
})
