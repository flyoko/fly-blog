import type { Env } from '../env'
import { importPKCS8, SignJWT } from 'jose'
import { ApiError } from './api-error'

interface InstallationTokenCache {
	token: string
	expiresAt: string
}

let cachedInstallationToken: InstallationTokenCache | undefined

function normalizePrivateKey(value: string): string {
	return value.replaceAll('\\n', '\n').trim()
}

export async function createAppJwt(env: Env): Promise<string> {
	const privateKey = await importPKCS8(normalizePrivateKey(env.GITHUB_PRIVATE_KEY), 'RS256')
	const now = Math.floor(Date.now() / 1000)
	return new SignJWT({})
		.setProtectedHeader({ alg: 'RS256' })
		.setIssuer(env.GITHUB_APP_ID)
		.setIssuedAt(now - 30)
		.setExpirationTime(now + 9 * 60)
		.sign(privateKey)
}

export async function getInstallationToken(env: Env): Promise<{ token: string, expiresAt: string }> {
	const refreshBefore = Date.now() + 5 * 60 * 1000
	if (cachedInstallationToken && Date.parse(cachedInstallationToken.expiresAt) > refreshBefore)
		return { ...cachedInstallationToken }

	const response = await fetch(`${env.GITHUB_API_BASE_URL}/app/installations/${encodeURIComponent(env.GITHUB_INSTALLATION_ID)}/access_tokens`, {
		method: 'POST',
		headers: {
			'accept': 'application/vnd.github+json',
			'authorization': `Bearer ${await createAppJwt(env)}`,
			'content-type': 'application/json',
			'user-agent': 'fly-living-admin',
			'x-github-api-version': '2022-11-28',
		},
		body: JSON.stringify({ repositories: [env.GITHUB_REPO] }),
	})
	if (!response.ok)
		throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub installation token request failed')
	const payload = await response.json<{ token?: string, expires_at?: string }>()
	if (!payload.token || !payload.expires_at)
		throw new ApiError('UPSTREAM_FAILED', 502, 'GitHub returned an invalid installation token')
	cachedInstallationToken = { token: payload.token, expiresAt: payload.expires_at }
	return { ...cachedInstallationToken }
}
