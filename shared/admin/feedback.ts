export type AdminNoticeTone = 'info' | 'success' | 'warning' | 'danger'

export interface AdminNoticeInput {
	tone: AdminNoticeTone
	title: string
	message?: string
	duration?: number
}

interface ErrorLike {
	code?: unknown
	message?: unknown
	name?: unknown
}

const chunkErrorPattern = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \d+ failed|Unable to preload CSS|dynamically imported module/iu
const transportErrorPattern = /Failed to fetch|NetworkError|Load failed|ERR_(?:NETWORK|CONNECTION|INTERNET)|fetch failed/iu
const technicalErrorPattern = /https?:\/\/|\/_nuxt\/|(?:Type|Reference|Syntax|Range)Error|Error:\s|\bat\s+[A-Z_$]|\.(?:m?js|ts):\d+|\b(?:GET|POST|PUT|PATCH|DELETE)\s+\//iu
const chinesePattern = /[\u3400-\u9FFF]/u

const codeMessages: Record<string, string> = {
	AUTHENTICATION_REQUIRED: '登录状态已失效，请重新登录。',
	CONFLICT: '线上内容已经更新，请重新载入后再继续。',
	FORBIDDEN: '当前账号没有权限执行这个操作。',
	RATE_LIMITED: '操作有些频繁，请稍等片刻再试。',
	UNAUTHENTICATED: '登录状态已失效，请重新登录。',
	UPSTREAM_UNAVAILABLE: '依赖服务暂时不可用，请稍后重试。',
}

function errorLike(cause: unknown): ErrorLike {
	return cause && typeof cause === 'object' ? cause as ErrorLike : {}
}

export function errorText(cause: unknown) {
	if (typeof cause === 'string')
		return cause
	const value = errorLike(cause).message
	return typeof value === 'string' ? value : ''
}

export function isChunkLoadError(cause: unknown) {
	return chunkErrorPattern.test(errorText(cause))
}

export function toAdminUserMessage(cause: unknown, fallback = '操作没有完成，请稍后重试。') {
	const value = errorLike(cause)
	const code = typeof value.code === 'string' ? value.code : ''
	if (code && codeMessages[code])
		return codeMessages[code]

	const message = errorText(cause).trim()
	if (!message)
		return fallback
	if (isChunkLoadError(cause))
		return '页面资源刚刚更新，系统正在恢复，请稍候。'
	if (transportErrorPattern.test(message))
		return '网络连接不稳定，请检查网络后重试。'
	if (technicalErrorPattern.test(message))
		return fallback
	if (chinesePattern.test(message) && message.length <= 180)
		return message
	return fallback
}
