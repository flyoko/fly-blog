import type { MiddlewareHandler } from 'hono'
import type { AppEnvironment } from '../env'
import { getCookie } from 'hono/cookie'
import { ApiError } from '../lib/api-error'
import { hashOpaqueToken } from '../lib/crypto'
import { SessionRepository } from '../repositories/session-repository'

const protectedMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function loadSession(c: Parameters<MiddlewareHandler<AppEnvironment>>[0]) {
	const token = getCookie(c, 'fly_admin_session')
	if (!token)
		return null
	const idHash = await hashOpaqueToken(token)
	const row = await new SessionRepository(c.env.DB).findActiveSession(idHash, new Date().toISOString())
	if (!row)
		return null
	const session = {
		id: row.githubUserId,
		login: row.githubLogin,
		avatarUrl: row.avatarUrl,
		sessionId: row.idHash,
		csrfHash: row.csrfHash,
	}
	c.set('session', session)
	return session
}

export const requireSession: MiddlewareHandler<AppEnvironment> = async (c, next) => {
	const session = c.get('session') ?? await loadSession(c)
	if (!session)
		throw new ApiError('UNAUTHENTICATED', 401, 'Authentication required')
	await next()
}

export const requireCsrf: MiddlewareHandler<AppEnvironment> = async (c, next) => {
	if (!protectedMethods.has(c.req.method)) {
		await next()
		return
	}
	const session = c.get('session') ?? await loadSession(c)
	if (!session)
		throw new ApiError('UNAUTHENTICATED', 401, 'Authentication required')
	if (c.req.header('origin') !== c.env.PUBLIC_ORIGIN)
		throw new ApiError('CSRF_INVALID', 403, 'Request origin is not allowed')
	const token = c.req.header('x-csrf-token')
	if (!token || await hashOpaqueToken(token) !== session.csrfHash)
		throw new ApiError('CSRF_INVALID', 403, 'CSRF token is invalid')
	await next()
}

export async function enforceRateLimit<T>(
	limiter: RateLimit,
	key: string,
	action: () => Promise<T>,
): Promise<T> {
	const result = await limiter.limit({ key })
	if (!result.success)
		throw new ApiError('RATE_LIMITED', 429, 'Too many requests')
	return action()
}

export function authRateLimitKey(c: Parameters<MiddlewareHandler<AppEnvironment>>[0]): string {
	const ip = c.req.header('cf-connecting-ip')
		?? c.req.header('x-forwarded-for')?.split(',')[0]
		?? 'unknown'
	return `${ip.trim().toLowerCase()}:${c.req.path}`
}

export async function resolveSession(c: Parameters<MiddlewareHandler<AppEnvironment>>[0]) {
	return c.get('session') ?? loadSession(c)
}
