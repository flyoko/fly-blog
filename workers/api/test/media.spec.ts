import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../src/env'
import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
	buildMediaKey,
	detectAllowedMedia,
	maxBytesFor,
} from '../src/features/media/file-signatures'
import { MediaService } from '../src/features/media/media-service'
import { prepareUploadedFiles } from '../src/features/media/upload-preflight'
import { app } from '../src/index'
import { sha256Base64Url } from '../src/lib/crypto'

const testEnv = env as typeof env & {
	DB: D1Database
	MEDIA: R2Bucket
	TEST_MIGRATIONS: D1Migration[]
}

const sessionKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)))

function rateLimiter(): RateLimit {
	return { limit: async () => ({ success: true }) } as RateLimit
}

function mediaEnv(): Env {
	return {
		...testEnv,
		AUTH_RATE_LIMITER: rateLimiter(),
		WRITE_RATE_LIMITER: rateLimiter(),
		PUBLIC_ORIGIN: 'https://blog.example.test',
		PAGES_ORIGIN: 'https://pages.example.test',
		MEDIA_ORIGIN: 'https://media.example.test',
		GITHUB_API_BASE_URL: 'https://api.github.test',
		GITHUB_OAUTH_BASE_URL: 'https://github.test',
		GITHUB_OWNER: 'flyoko',
		GITHUB_REPO: 'fly-blog',
		GITHUB_DEFAULT_BRANCH: 'setup/personalize',
		GITHUB_APP_ID: '1',
		GITHUB_CLIENT_ID: 'client',
		GITHUB_CLIENT_SECRET: 'secret',
		GITHUB_PRIVATE_KEY: '',
		GITHUB_INSTALLATION_ID: '2',
		GITHUB_ALLOWED_LOGIN: 'flyoko',
		GITHUB_ALLOWED_USER_ID: '42',
		SESSION_ENCRYPTION_KEY: sessionKey,
	} as Env
}

async function createAdminSession() {
	await testEnv.DB.prepare(`
		INSERT INTO admin_sessions (
			id_hash, github_user_id, github_login, avatar_url, csrf_hash,
			created_at, last_seen_at, expires_at
		) VALUES (?, '42', 'flyoko', '', ?, ?, ?, ?)
	`).bind(
		await sha256Base64Url('media-session-token'),
		await sha256Base64Url('media-csrf-token'),
		'2026-08-03T00:00:00.000Z',
		'2026-08-03T00:00:00.000Z',
		'2099-08-03T00:00:00.000Z',
	).run()
}

function authenticatedHeaders(extra: Record<string, string> = {}) {
	return {
		'cookie': 'fly_admin_session=media-session-token',
		'origin': 'https://blog.example.test',
		'x-csrf-token': 'media-csrf-token',
		...extra,
	}
}

const signatures = {
	png: new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]),
	jpeg: new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00]),
	webp: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
	gif: new TextEncoder().encode('GIF89a'),
	mp3: new TextEncoder().encode('ID3\u0004\u0000\u0000'),
	ogg: new TextEncoder().encode('OggS\u0000'),
	wav: new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]),
}

async function clearBucket(bucket: R2Bucket) {
	let cursor: string | undefined
	do {
		const listed = await bucket.list({ cursor })
		if (listed.objects.length)
			await bucket.delete(listed.objects.map(object => object.key))
		cursor = listed.truncated ? listed.cursor : undefined
	} while (cursor)
}

beforeAll(async () => {
	await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
})

beforeEach(async () => {
	await clearBucket(testEnv.MEDIA)
	await testEnv.DB.batch([
		testEnv.DB.prepare('DELETE FROM media_references'),
		testEnv.DB.prepare('DELETE FROM media_objects'),
		testEnv.DB.prepare('DELETE FROM idempotency_keys'),
		testEnv.DB.prepare('DELETE FROM audit_logs'),
		testEnv.DB.prepare('DELETE FROM admin_sessions'),
	])
})

describe('file signatures and keys', () => {
	it.each([
		['png', signatures.png, { extension: 'png', mime: 'image/png', kind: 'image' }],
		['jpeg', signatures.jpeg, { extension: 'jpg', mime: 'image/jpeg', kind: 'image' }],
		['webp', signatures.webp, { extension: 'webp', mime: 'image/webp', kind: 'image' }],
		['gif', signatures.gif, { extension: 'gif', mime: 'image/gif', kind: 'image' }],
		['mp3', signatures.mp3, { extension: 'mp3', mime: 'audio/mpeg', kind: 'audio' }],
		['ogg', signatures.ogg, { extension: 'ogg', mime: 'audio/ogg', kind: 'audio' }],
		['wav', signatures.wav, { extension: 'wav', mime: 'audio/wav', kind: 'audio' }],
	])('detects %s from bytes', (_name, bytes, expected) => {
		expect(detectAllowedMedia(bytes)).toEqual(expected)
	})

	it('rejects unknown bytes and exposes strict size limits', () => {
		expect(detectAllowedMedia(new Uint8Array([1, 2, 3, 4]))).toBeNull()
		expect(maxBytesFor('image')).toBe(20 * 1024 * 1024)
		expect(maxBytesFor('audio')).toBe(80 * 1024 * 1024)
	})

	it('rejects oversized and excessive files before reading full file bodies', async () => {
		let fullReads = 0
		const fakeFile = (name: string, size: number, signature = signatures.png) => ({
			name,
			size,
			slice: () => new Blob([signature]),
			arrayBuffer: async () => {
				fullReads++
				throw new Error('full body should not be read')
			},
		}) as unknown as File

		await expect(prepareUploadedFiles([
			fakeFile('too-large.png', maxBytesFor('image') + 1),
		], 'article')).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 })
		expect(fullReads).toBe(0)

		await expect(prepareUploadedFiles(
			Array.from({ length: 21 }, (_, index) => fakeFile(`${index}.png`, signatures.png.byteLength)),
			'article',
		)).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 })
		expect(fullReads).toBe(0)
	})

	it('builds stable keys without original filenames', () => {
		const now = new Date('2026-08-03T00:00:00.000Z')
		expect(buildMediaKey({ purpose: 'article', extension: 'png', now, id: 'media-id' }))
			.toBe('public/articles/2026/08/media-id.png')
		expect(buildMediaKey({ purpose: 'music', extension: 'mp3', now, id: 'audio-id' }))
			.toBe('public/music/audio/audio-id.mp3')
		expect(buildMediaKey({ purpose: 'music', extension: 'webp', now, id: 'cover-id' }))
			.toBe('public/music/covers/cover-id.webp')
		expect(buildMediaKey({ purpose: 'profile', extension: 'jpg', now, id: 'avatar-id' }))
			.toBe('public/profile/avatar-id.jpg')
	})
})

describe('media service', () => {
	it('keeps successful uploads when another multipart item fails and ignores spoofed extensions', async () => {
		const service = new MediaService(mediaEnv())
		const results = await service.uploadMany({
			purpose: 'article',
			files: [
				{ name: 'spoofed.mp3', bytes: signatures.png },
				{ name: 'invalid.png', bytes: new Uint8Array([1, 2, 3]) },
			],
			now: new Date('2026-08-03T00:00:00.000Z'),
		})
		expect(results).toHaveLength(2)
		expect(results[0]).toMatchObject({ ok: true, name: 'spoofed.mp3', media: { mime: 'image/png', kind: 'image' } })
		expect(results[1]).toMatchObject({ ok: false, name: 'invalid.png', error: { code: 'VALIDATION_FAILED' } })
		const listed = await testEnv.MEDIA.list({ prefix: 'public/articles/2026/08/' })
		expect(listed.objects).toHaveLength(1)
		expect(listed.objects[0]!.key).toMatch(/\.png$/u)
		const count = await testEnv.DB.prepare('SELECT COUNT(*) AS count FROM media_objects').first<{ count: number }>()
		expect(count?.count).toBe(1)
	})

	it('rejects an image over 20 MiB before writing R2', async () => {
		const service = new MediaService(mediaEnv())
		const bytes = new Uint8Array(maxBytesFor('image') + 1)
		bytes.set(signatures.png)
		const [result] = await service.uploadMany({
			purpose: 'article',
			files: [{ name: 'large.png', bytes }],
			now: new Date('2026-08-03T00:00:00.000Z'),
		})
		expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
		expect((await testEnv.MEDIA.list()).objects).toHaveLength(0)
	})

	it('paginates and filters media metadata', async () => {
		const service = new MediaService(mediaEnv())
		for (const name of ['alpha.png', 'beta.png', 'gamma.png']) {
			await service.uploadMany({
				purpose: 'article',
				files: [{ name, bytes: signatures.png }],
				now: new Date(`2026-08-03T00:00:0${name.length % 3}.000Z`),
			})
		}
		const page = await service.list({ page: 2, pageSize: 1, query: 'a', status: 'active' })
		expect(page.page).toBe(2)
		expect(page.pageSize).toBe(1)
		expect(page.total).toBe(3)
		expect(page.items).toHaveLength(1)
	})

	it('moves media to trash and restores the original stable key', async () => {
		const service = new MediaService(mediaEnv())
		const [uploaded] = await service.uploadMany({
			purpose: 'article',
			files: [{ name: 'image.png', bytes: signatures.png }],
			now: new Date('2026-08-03T00:00:00.000Z'),
		})
		if (!uploaded?.ok)
			throw new Error('upload failed')
		const originalKey = uploaded.media.key
		await service.trash(uploaded.media.id, new Date('2026-08-03T01:00:00.000Z'))
		const trashed = await service.get(uploaded.media.id)
		expect(trashed.status).toBe('trashed')
		expect(trashed.key).toMatch(new RegExp(`^trash/${uploaded.media.id}/`))
		expect(await testEnv.MEDIA.head(originalKey)).toBeNull()
		expect(await testEnv.MEDIA.head(trashed.key)).not.toBeNull()

		await service.restore(uploaded.media.id)
		const restored = await service.get(uploaded.media.id)
		expect(restored.status).toBe('active')
		expect(restored.key).toBe(originalKey)
		expect(await testEnv.MEDIA.head(originalKey)).not.toBeNull()
	})

	it('requires a five-minute confirmation token before deleting referenced media permanently', async () => {
		const service = new MediaService(mediaEnv())
		const [uploaded] = await service.uploadMany({
			purpose: 'article',
			files: [{ name: 'referenced.png', bytes: signatures.png }],
			now: new Date('2026-08-03T00:00:00.000Z'),
		})
		if (!uploaded?.ok)
			throw new Error('upload failed')
		await testEnv.DB.prepare(`
			INSERT INTO media_references (media_id, repository_path, repository_sha, created_at)
			VALUES (?, 'content/posts/2026/hello.md', 'sha', '2026-08-03T00:00:00.000Z')
		`).bind(uploaded.media.id).run()
		await service.trash(uploaded.media.id, new Date('2026-08-03T01:00:00.000Z'))

		let token = ''
		try {
			await service.deletePermanently(uploaded.media.id)
		}
		catch (error) {
			expect(error).toMatchObject({ code: 'CONFLICT', details: { referenceCount: 1 } })
			token = (error as { details: { confirmationToken: string } }).details.confirmationToken
		}
		expect(token).toBeTruthy()
		await service.deletePermanently(uploaded.media.id, token)
		expect((await service.get(uploaded.media.id)).status).toBe('deleted')
	})
})

describe('public media routes', () => {
	it('serves public R2 objects from the same-origin media path', async () => {
		const key = 'public/articles/2026/08/public-route.png'
		await testEnv.MEDIA.put(key, signatures.png, {
			httpMetadata: { contentType: 'image/png' },
		})
		const response = await app.request(`https://blog.example.test/media/${key}`, {}, mediaEnv())
		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('image/png')
		expect(response.headers.get('cache-control')).toContain('immutable')
		expect(response.headers.get('accept-ranges')).toBe('bytes')
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(signatures.png)
	})

	it('supports byte ranges and rejects private or invalid object paths', async () => {
		const key = 'public/music/audio/range.mp3'
		await testEnv.MEDIA.put(key, signatures.mp3, {
			httpMetadata: { contentType: 'audio/mpeg' },
		})
		const range = await app.request(`https://blog.example.test/media/${key}`, {
			headers: { range: 'bytes=0-2' },
		}, mediaEnv())
		expect(range.status).toBe(206)
		expect(range.headers.get('content-range')).toBe(`bytes 0-2/${signatures.mp3.byteLength}`)
		expect(new Uint8Array(await range.arrayBuffer())).toEqual(signatures.mp3.slice(0, 3))

		const privatePath = await app.request('https://blog.example.test/media/trash/private.png', {}, mediaEnv())
		expect(privatePath.status).toBe(404)
		const traversal = await app.request('https://blog.example.test/media/public/../trash/private.png', {}, mediaEnv())
		expect(traversal.status).toBe(404)
	})
})

describe('media routes', () => {
	it('publishes multipart results once for a duplicate idempotency key and lists them', async () => {
		await createAdminSession()
		const requestUpload = async () => {
			const form = new FormData()
			form.set('purpose', 'article')
			form.append('files', new File([signatures.png], 'route.png', { type: 'audio/mpeg' }))
			return app.request('https://blog.example.test/api/admin/media', {
				method: 'POST',
				headers: authenticatedHeaders({ 'x-idempotency-key': 'media-upload-route-1' }),
				body: form,
			}, mediaEnv())
		}

		const first = await requestUpload()
		expect(first.status).toBe(201)
		const firstBody = await first.json() as { ok: boolean, data: unknown }
		const second = await requestUpload()
		expect(second.status).toBe(201)
		const secondBody = await second.json() as { ok: boolean, data: unknown }
		expect(secondBody.data).toEqual(firstBody.data)
		expect((await testEnv.MEDIA.list({ prefix: 'public/articles/' })).objects).toHaveLength(1)

		const list = await app.request(
			'https://blog.example.test/api/admin/media?page=1&pageSize=1&status=active',
			{ headers: authenticatedHeaders() },
			mediaEnv(),
		)
		expect(list.status).toBe(200)
		expect(await list.json()).toMatchObject({
			ok: true,
			data: { page: 1, pageSize: 1, total: 1, items: [{ originalName: 'route.png' }] },
		})
	})
})
