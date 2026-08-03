import type { AdminSessionDto } from '../../../../../shared/admin/auth'
import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { ApiError, success } from '../../lib/api-error'
import {
	hashOpaqueToken,
	openOAuthState,
	randomToken,
	sealOAuthState,
	sha256Base64Url,
} from '../../lib/crypto'
import {
	authRateLimitKey,
	enforceRateLimit,
	requireCsrf,
	requireSession,
	resolveSession,
} from '../../middleware/session'
import { AuditRepository } from '../../repositories/audit-repository'
import { SessionRepository } from '../../repositories/session-repository'

const oauthCookieName = 'fly_admin_oauth'
const sessionCookieName = 'fly_admin_session'
const csrfCookieName = 'fly_admin_csrf'
const oauthMaxAge = 10 * 60
const sessionMaxAge = 12 * 60 * 60

interface GitHubTokenResponse {
	access_token?: string
	error?: string
}

interface GitHubUserResponse {
	id?: number
	login?: string
	avatar_url?: string
}

function callbackUrl(origin: string): string {
	return `${origin}/api/auth/callback`
}

function safeReturnTo(value: string | undefined): string {
	return value?.startsWith('/admin') ? value : '/admin'
}

export const authRoutes = new Hono<AppEnvironment>()

authRoutes.get('/login', async (c) => {
	return enforceRateLimit(c.env.AUTH_RATE_LIMITER, authRateLimitKey(c), async () => {
		const codeVerifier = randomToken(48)
		const stateToken = await sealOAuthState({
			nonce: randomToken(),
			codeVerifier,
			issuedAt: Math.floor(Date.now() / 1000),
			returnTo: safeReturnTo(c.req.query('returnTo')),
		}, c.env.SESSION_ENCRYPTION_KEY)
		const authorizeUrl = new URL('/login/oauth/authorize', c.env.GITHUB_OAUTH_BASE_URL)
		authorizeUrl.searchParams.set('client_id', c.env.GITHUB_CLIENT_ID)
		authorizeUrl.searchParams.set('redirect_uri', callbackUrl(c.env.PUBLIC_ORIGIN))
		authorizeUrl.searchParams.set('state', stateToken)
		authorizeUrl.searchParams.set('code_challenge', await sha256Base64Url(codeVerifier))
		authorizeUrl.searchParams.set('code_challenge_method', 'S256')
		authorizeUrl.searchParams.set('allow_signup', 'false')
		authorizeUrl.searchParams.set('prompt', 'select_account')
		setCookie(c, oauthCookieName, stateToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/api/auth/callback',
			maxAge: oauthMaxAge,
		})
		return c.redirect(authorizeUrl.toString(), 302)
	})
})

authRoutes.get('/callback', async (c) => {
	return enforceRateLimit(c.env.AUTH_RATE_LIMITER, authRateLimitKey(c), async () => {
		const code = c.req.query('code')
		const stateToken = c.req.query('state')
		const cookieState = getCookie(c, oauthCookieName)
		if (!code || !stateToken || !cookieState || stateToken !== cookieState)
			throw new ApiError('VALIDATION_FAILED', 400, 'OAuth state is invalid')

		let oauthState
		try {
			oauthState = await openOAuthState(stateToken, c.env.SESSION_ENCRYPTION_KEY)
		}
		catch {
			throw new ApiError('VALIDATION_FAILED', 400, 'OAuth state could not be verified')
		}
		const nowSeconds = Math.floor(Date.now() / 1000)
		if (oauthState.issuedAt > nowSeconds + 60 || nowSeconds - oauthState.issuedAt > oauthMaxAge)
			throw new ApiError('VALIDATION_FAILED', 400, 'OAuth state has expired')

		const tokenResponse = await fetch(`${c.env.GITHUB_OAUTH_BASE_URL}/login/oauth/access_token`, {
			method: 'POST',
			headers: {
				'accept': 'application/json',
				'content-type': 'application/json',
				'user-agent': 'fly-living-admin',
			},
			body: JSON.stringify({
				client_id: c.env.GITHUB_CLIENT_ID,
				client_secret: c.env.GITHUB_CLIENT_SECRET,
				code,
				redirect_uri: callbackUrl(c.env.PUBLIC_ORIGIN),
				code_verifier: oauthState.codeVerifier,
			}),
		})
		if (!tokenResponse.ok)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub OAuth exchange failed')
		const tokenPayload = await tokenResponse.json<GitHubTokenResponse>()
		if (!tokenPayload.access_token)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub OAuth response did not include an access token')

		const userResponse = await fetch(`${c.env.GITHUB_API_BASE_URL}/user`, {
			headers: {
				'accept': 'application/vnd.github+json',
				'authorization': `Bearer ${tokenPayload.access_token}`,
				'user-agent': 'fly-living-admin',
				'x-github-api-version': '2022-11-28',
			},
		})
		if (!userResponse.ok)
			throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub user lookup failed')
		const githubUser = await userResponse.json<GitHubUserResponse>()
		const githubId = githubUser.id?.toString()
		if (
			!githubId
			|| !githubUser.login
			|| githubUser.login.toLowerCase() !== c.env.GITHUB_ALLOWED_LOGIN.toLowerCase()
			|| githubId !== c.env.GITHUB_ALLOWED_USER_ID
		) {
			throw new ApiError('FORBIDDEN', 403, 'This GitHub account is not allowed')
		}

		const sessionToken = randomToken()
		const csrfToken = randomToken()
		const now = new Date()
		const expiresAt = new Date(now.getTime() + sessionMaxAge * 1000)
		await new SessionRepository(c.env.DB).createSession({
			idHash: await hashOpaqueToken(sessionToken),
			githubUserId: githubId,
			githubLogin: githubUser.login,
			avatarUrl: githubUser.avatar_url ?? '',
			csrfHash: await hashOpaqueToken(csrfToken),
			createdAt: now.toISOString(),
			lastSeenAt: now.toISOString(),
			expiresAt: expiresAt.toISOString(),
		})
		await new AuditRepository(c.env.DB).writeAudit({
			actorId: githubId,
			actorLogin: githubUser.login,
			action: 'auth.login',
			targetType: 'session',
			result: 'success',
			requestId: c.get('requestId'),
			createdAt: now.toISOString(),
		})
		setCookie(c, sessionCookieName, sessionToken, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			maxAge: sessionMaxAge,
		})
		setCookie(c, csrfCookieName, csrfToken, {
			secure: true,
			sameSite: 'Strict',
			path: '/',
			maxAge: sessionMaxAge,
		})
		deleteCookie(c, oauthCookieName, { path: '/api/auth/callback' })
		return c.redirect(new URL(oauthState.returnTo, c.env.PUBLIC_ORIGIN).toString(), 302)
	})
})

authRoutes.get('/session', async (c) => {
	const session = await resolveSession(c)
	const payload: AdminSessionDto = session
		? {
				authenticated: true,
				user: { id: session.id, login: session.login, avatarUrl: session.avatarUrl },
			}
		: { authenticated: false }
	return success(c, payload)
})

authRoutes.post('/logout', requireSession, requireCsrf, async (c) => {
	const session = c.get('session')!
	const now = new Date().toISOString()
	await new SessionRepository(c.env.DB).revokeSession(session.sessionId, now)
	await new AuditRepository(c.env.DB).writeAudit({
		actorId: session.id,
		actorLogin: session.login,
		action: 'auth.logout',
		targetType: 'session',
		result: 'success',
		requestId: c.get('requestId'),
		createdAt: now,
	})
	deleteCookie(c, sessionCookieName, { path: '/' })
	deleteCookie(c, csrfCookieName, { path: '/' })
	return c.body(null, 204)
})
