import type { ApiEnvelope, ApiFailure } from '#shared/admin/api'
import { toAdminUserMessage } from '#shared/admin/feedback'

export type AdminFetchOptions = NonNullable<Parameters<typeof $fetch.raw>[1]>

export class AdminApiError extends Error {
	readonly code: ApiFailure['error']['code']
	readonly requestId: string
	readonly details?: unknown
	readonly technicalMessage: string

	constructor(error: ApiFailure['error']) {
		super(toAdminUserMessage(error, '操作没有完成，请稍后重试。'))
		this.name = 'AdminApiError'
		this.code = error.code
		this.requestId = error.requestId
		this.details = error.details
		this.technicalMessage = error.message
	}
}

export async function useAdminApi<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
	const csrf = useCookie<string | null>('fly_admin_csrf')
	const notifications = useAdminNotifications()
	const method = String(options.method ?? 'GET').toUpperCase()
	const headers = new Headers(options.headers)
	if (!['GET', 'HEAD'].includes(method))
		headers.set('x-csrf-token', csrf.value ?? '')

	try {
		const response = await $fetch.raw<ApiEnvelope<T>>(path, {
			...options,
			headers,
			credentials: 'include',
			ignoreResponseError: true,
		})
		if (response.status === 204)
			return undefined as T
		const envelope = response._data
		if (!envelope)
			throw new Error('后台暂时没有返回结果，请重新尝试。')
		if (!envelope.ok)
			throw new AdminApiError(envelope.error)
		return envelope.data
	}
	catch (cause) {
		const error = cause instanceof AdminApiError
			? cause
			: new Error(toAdminUserMessage(cause, '网络请求没有完成，请稍后重试。'))
		notifications.error(error)
		throw error
	}
}
