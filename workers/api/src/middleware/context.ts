import type { AppEnvironment } from '../env'
import { createMiddleware } from 'hono/factory'

const requestIdPattern = /^[\w.:-]{1,128}$/u

function resolveRequestId(value: string | undefined) {
	return value && requestIdPattern.test(value) ? value : crypto.randomUUID()
}

export const contextMiddleware = createMiddleware<AppEnvironment>(async (c, next) => {
	const requestId = resolveRequestId(c.req.header('x-request-id'))
	c.set('requestId', requestId)
	try {
		await next()
	}
	finally {
		c.header('x-request-id', requestId)
	}
})
