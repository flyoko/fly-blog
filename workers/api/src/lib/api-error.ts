import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ApiErrorCode, ApiFailure, ApiSuccess } from '../../../../shared/admin/api'
import type { AppEnvironment } from '../env'

export class ApiError extends Error {
	constructor(
		public readonly code: ApiErrorCode,
		public readonly status: ContentfulStatusCode,
		message: string,
		public readonly details?: unknown,
	) {
		super(message)
		this.name = 'ApiError'
	}
}

export function normalizeError(error: unknown): ApiError {
	if (error instanceof ApiError)
		return error
	return new ApiError('INTERNAL_ERROR', 500, 'Internal server error')
}

export function success<T>(c: Context<AppEnvironment>, data: T, status: ContentfulStatusCode = 200) {
	const requestId = c.get('requestId')
	const body: ApiSuccess<T> = { ok: true, data, requestId }
	c.header('x-request-id', requestId)
	return c.json(body, status)
}

export function failure(c: Context<AppEnvironment>, error: ApiError) {
	const requestId = c.get('requestId') || crypto.randomUUID()
	const body: ApiFailure = {
		ok: false,
		error: {
			code: error.code,
			message: error.message,
			requestId,
			...(error.details === undefined ? {} : { details: error.details }),
		},
	}
	c.header('x-request-id', requestId)
	return c.json(body, error.status)
}
