import type { AppEnvironment } from '../../env'
import { getCookie, setCookie } from 'hono/cookie'
import { randomToken } from '../../lib/crypto'

const cookieName = 'fly_moment_visitor'

function encodeBase64Url(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export async function hashMomentVisitor(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	)
	const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
	return encodeBase64Url(new Uint8Array(digest))
}

export async function momentVisitor(c: Parameters<import('hono').Handler<AppEnvironment>>[0], create: boolean) {
	let token = getCookie(c, cookieName)
	if (!token && create) {
		token = randomToken(24)
		setCookie(c, cookieName, token, {
			httpOnly: true,
			secure: true,
			sameSite: 'Lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 365,
		})
	}
	if (!token)
		return null
	return hashMomentVisitor(token, c.env.VISITOR_HMAC_KEY || c.env.SESSION_ENCRYPTION_KEY)
}
