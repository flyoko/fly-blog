import { compactDecrypt, CompactEncrypt } from 'jose'

export interface OAuthState {
	nonce: string
	codeVerifier: string
	issuedAt: number
	returnTo: string
}

function encodeBase64Url(bytes: Uint8Array): string {
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function decodeBase64(value: string): Uint8Array {
	const normalized = value.replaceAll('-', '+').replaceAll('_', '/')
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
	const binary = atob(padded)
	return Uint8Array.from(binary, character => character.charCodeAt(0))
}

function encryptionKey(secret: string): Uint8Array {
	const key = decodeBase64(secret)
	if (key.byteLength !== 32)
		throw new Error('SESSION_ENCRYPTION_KEY must decode to 32 bytes')
	return key
}

export function randomToken(bytes = 32): string {
	const value = new Uint8Array(bytes)
	crypto.getRandomValues(value)
	return encodeBase64Url(value)
}

export async function sha256Base64Url(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
	return encodeBase64Url(new Uint8Array(digest))
}

export async function sealOAuthState(payload: OAuthState, secret: string): Promise<string> {
	return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
		.setProtectedHeader({ alg: 'dir', enc: 'A256GCM', typ: 'oauth-state+jwe' })
		.encrypt(encryptionKey(secret))
}

export async function openOAuthState(token: string, secret: string): Promise<OAuthState> {
	const { plaintext } = await compactDecrypt(token, encryptionKey(secret), {
		keyManagementAlgorithms: ['dir'],
		contentEncryptionAlgorithms: ['A256GCM'],
	})
	const value = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<OAuthState>
	if (
		typeof value.nonce !== 'string'
		|| typeof value.codeVerifier !== 'string'
		|| typeof value.issuedAt !== 'number'
		|| typeof value.returnTo !== 'string'
	) {
		throw new TypeError('Invalid OAuth state payload')
	}
	return value as OAuthState
}

export async function hashOpaqueToken(token: string): Promise<string> {
	return sha256Base64Url(token)
}
