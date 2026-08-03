import type { AppEnvironment } from '../../env'
import { Hono } from 'hono'

function publicObjectKey(requestUrl: string): string | null {
	const pathname = new URL(requestUrl).pathname
	const prefix = '/media/'
	if (!pathname.startsWith(prefix))
		return null
	const encoded = pathname.slice(prefix.length)
	if (!encoded)
		return null
	try {
		const segments = encoded.split('/').map(segment => decodeURIComponent(segment))
		if (
			segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\') || segment.includes('\0'))
			|| segments[0] !== 'public'
		) {
			return null
		}
		return segments.join('/')
	}
	catch {
		return null
	}
}

interface ParsedRange {
	request: R2Range
	start: number
	end: number
}

function parseRange(value: string, size: number): ParsedRange | null {
	const match = /^bytes=(\d*)-(\d*)$/u.exec(value.trim())
	if (!match || (!match[1] && !match[2]) || size <= 0)
		return null
	if (!match[1]) {
		const suffix = Number(match[2])
		if (!Number.isSafeInteger(suffix) || suffix <= 0)
			return null
		const length = Math.min(size, suffix)
		return { request: { suffix: length }, start: size - length, end: size - 1 }
	}
	const start = Number(match[1])
	if (!Number.isSafeInteger(start) || start < 0 || start >= size)
		return null
	const requestedEnd = match[2] ? Number(match[2]) : size - 1
	if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start)
		return null
	const end = Math.min(size - 1, requestedEnd)
	return { request: { offset: start, length: end - start + 1 }, start, end }
}

function responseHeaders(object: R2Object, totalSize: number, range?: ParsedRange): Headers {
	const headers = new Headers()
	object.writeHttpMetadata(headers)
	headers.set('etag', object.httpEtag)
	headers.set('accept-ranges', 'bytes')
	headers.set('x-content-type-options', 'nosniff')
	headers.set('cache-control', 'public, max-age=31536000, immutable')
	if (range) {
		headers.set('content-range', `bytes ${range.start}-${range.end}/${totalSize}`)
		headers.set('content-length', String(range.end - range.start + 1))
	}
	else {
		headers.set('content-length', String(totalSize))
	}
	return headers
}

export const publicMediaRoutes = new Hono<AppEnvironment>()

publicMediaRoutes.on(['GET', 'HEAD'], '/*', async (c) => {
	const key = publicObjectKey(c.req.url)
	if (!key)
		return c.body(null, 404)

	const metadata = await c.env.MEDIA.head(key)
	if (!metadata)
		return c.body(null, 404)
	if (c.req.method === 'HEAD') {
		return new Response(null, {
			status: 200,
			headers: responseHeaders(metadata, metadata.size),
		})
	}

	const rangeHeader = c.req.header('range')
	let range: ParsedRange | undefined
	if (rangeHeader) {
		const parsed = parseRange(rangeHeader, metadata.size)
		if (!parsed) {
			return c.body(null, 416, {
				'accept-ranges': 'bytes',
				'content-range': `bytes */${metadata.size}`,
			})
		}
		range = parsed
	}
	const object = await c.env.MEDIA.get(key, range ? { range: range.request } : undefined)
	if (!object)
		return c.body(null, 404)
	return new Response(object.body, {
		status: range ? 206 : 200,
		headers: responseHeaders(object, metadata.size, range),
	})
})
