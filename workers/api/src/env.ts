import type { AdminUser } from '../../../shared/admin/auth'

export interface Env {
	DB: D1Database
	MEDIA: R2Bucket
	AUTH_RATE_LIMITER: RateLimit
	WRITE_RATE_LIMITER: RateLimit
	ANALYTICS_RATE_LIMITER?: RateLimit
	PUBLIC_ORIGIN: string
	PAGES_ORIGIN: string
	MEDIA_ORIGIN: string
	GITHUB_API_BASE_URL: string
	GITHUB_OAUTH_BASE_URL: string
	GITHUB_OWNER: string
	GITHUB_REPO: string
	GITHUB_DEFAULT_BRANCH: string
	GITHUB_APP_ID: string
	GITHUB_CLIENT_ID: string
	GITHUB_CLIENT_SECRET: string
	GITHUB_PRIVATE_KEY: string
	GITHUB_INSTALLATION_ID: string
	GITHUB_ALLOWED_LOGIN: string
	GITHUB_ALLOWED_USER_ID: string
	SESSION_ENCRYPTION_KEY: string
	VISITOR_HMAC_KEY?: string
	ANALYTICS_ENABLED?: string
	ANALYTICS_HASH_SECRET?: string
}

export interface Variables {
	requestId: string
	session?: AdminUser & {
		sessionId: string
		csrfHash: string
	}
}

export interface AppEnvironment {
	Bindings: Env
	Variables: Variables
}
