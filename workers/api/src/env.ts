import type { AdminUser } from '../../../shared/admin/auth'
import type { ScheduledTaskMessage } from './scheduled-tasks'

export interface Env {
	DB: D1Database
	MEDIA: R2Bucket
	CONTENT_SYNC_QUEUE: Queue<ScheduledTaskMessage>
	AUTH_RATE_LIMITER: RateLimit
	WRITE_RATE_LIMITER: RateLimit
	MARKET_READ_RATE_LIMITER: RateLimit
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
	JIN10_MCP_TOKEN?: string
	SINA_INEWS_APP_KEY?: string
	SINA_INEWS_APP_SECRET?: string
	SINA_INEWS_TYPE_IDS?: string
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
