export const apiErrorCodes = [
	'UNAUTHENTICATED',
	'FORBIDDEN',
	'CSRF_INVALID',
	'VALIDATION_FAILED',
	'CONFLICT',
	'NOT_FOUND',
	'RATE_LIMITED',
	'UPSTREAM_FAILED',
	'DEPLOYMENT_FAILED',
	'INTERNAL_ERROR',
] as const

export type ApiErrorCode = typeof apiErrorCodes[number]

export interface ApiSuccess<T> {
	ok: true
	data: T
	requestId: string
}

export interface ApiFailure {
	ok: false
	error: {
		code: ApiErrorCode
		message: string
		requestId: string
		details?: unknown
	}
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure
