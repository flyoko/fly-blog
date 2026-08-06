import type { AddressInfo } from 'node:net'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStaticPreviewServer, resolveStaticPreviewFile } from '../../scripts/serve-static-e2e.mjs'

const roots: string[] = []

async function createRoot() {
	const root = await mkdtemp(join(tmpdir(), 'fly-blog-static-preview-'))
	roots.push(root)
	return root
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('static E2E preview server', () => {
	it('serves a flat route HTML instead of listing its payload-only directory', async () => {
		const root = await createRoot()
		await mkdir(join(root, 'comments'))
		await writeFile(join(root, 'comments', '_payload.json'), '{}')
		await writeFile(join(root, 'comments.html'), '<main id="main-content">comments</main>')

		const server = createStaticPreviewServer(root)
		await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
		try {
			const { port } = server.address() as AddressInfo
			const response = await fetch(`http://127.0.0.1:${port}/comments/`)
			expect(response.status).toBe(200)
			expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
			expect(await response.text()).toContain('id="main-content"')
		}
		finally {
			server.closeAllConnections()
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
		}
	})

	it('falls back to a generated subfolder index and serves exact assets', async () => {
		const root = await createRoot()
		await mkdir(join(root, 'me'))
		await mkdir(join(root, '_nuxt'))
		await writeFile(join(root, 'me', 'index.html'), '<main>about</main>')
		await writeFile(join(root, '_nuxt', 'entry.js'), 'export default true')

		expect(await resolveStaticPreviewFile(root, '/me')).toBe(join(root, 'me', 'index.html'))
		expect(await resolveStaticPreviewFile(root, '/_nuxt/entry.js?v=1')).toBe(join(root, '_nuxt', 'entry.js'))
	})

	it('does not resolve files outside the preview root', async () => {
		const root = await createRoot()
		expect(await resolveStaticPreviewFile(root, '/%2e%2e%2f%2e%2e%2fpackage.json')).toBeNull()
		expect(await resolveStaticPreviewFile(root, '/%E0%A4%A')).toBeNull()
	})
})
