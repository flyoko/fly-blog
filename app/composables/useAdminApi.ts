import type { ApiEnvelope, ApiFailure } from '#shared/admin/api'

export type AdminFetchOptions = NonNullable<Parameters<typeof $fetch.raw>[1]>

export class AdminApiError extends Error {
	readonly code: ApiFailure['error']['code']
	readonly requestId: string
	readonly details?: unknown

	constructor(error: ApiFailure['error']) {
		super(error.message)
		this.name = 'AdminApiError'
		this.code = error.code
		this.requestId = error.requestId
		this.details = error.details
	}
}

export async function useAdminApi<T>(path: string, options: AdminFetchOptions = {}): Promise<T> {
	const csrf = useCookie<string | null>('fly_admin_csrf')
	const method = String(options.method ?? 'GET').toUpperCase()
	const headers = new Headers(options.headers)
	if (!['GET', 'HEAD'].includes(method))
		headers.set('x-csrf-token', csrf.value ?? '')

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
		throw new Error('后台接口返回了空响应')
	if (!envelope.ok)
		throw new AdminApiError(envelope.error)
	return envelope.data
}
