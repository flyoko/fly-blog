import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('api worker core', () => {
	it('returns a request id and service status', async () => {
		const response = await exports.default.fetch('https://example.test/api/health')
		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			data: { service: 'fly-living-api', status: 'ok' },
		})
		expect(response.headers.get('x-request-id')).toBeTruthy()
	}, 30_000)

	it('uses the stable not-found envelope', async () => {
		const response = await exports.default.fetch('https://example.test/api/missing')
		expect(response.status).toBe(404)
		expect(await response.json()).toMatchObject({
			ok: false,
			error: { code: 'NOT_FOUND' },
		})
	})

	it('preserves a safe incoming request id', async () => {
		const response = await exports.default.fetch(new Request('https://example.test/api/health', {
			headers: { 'x-request-id': 'request-123' },
		}))
		expect(response.headers.get('x-request-id')).toBe('request-123')
	})
})
