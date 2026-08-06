import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

const CONTENT_TYPES = {
	'.css': 'text/css; charset=utf-8',
	'.gif': 'image/gif',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
	'.wasm': 'application/wasm',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.xml': 'application/xml; charset=utf-8',
}

function safePath(root, relativePath) {
	const absoluteRoot = resolve(root)
	const candidate = resolve(absoluteRoot, relativePath)
	return candidate === absoluteRoot || candidate.startsWith(`${absoluteRoot}${sep}`)
		? candidate
		: null
}

export async function resolveStaticPreviewFile(root, requestPath) {
	let pathname
	try {
		pathname = decodeURIComponent(new URL(requestPath, 'http://127.0.0.1').pathname)
	}
	catch {
		return null
	}

	const cleanPath = pathname.replace(/^\/+|\/+$/g, '')
	const candidates = cleanPath
		? [cleanPath, `${cleanPath}.html`, `${cleanPath}/index.html`]
		: ['index.html']

	for (const relativePath of candidates) {
		const candidate = safePath(root, relativePath)
		if (!candidate)
			continue
		try {
			if ((await stat(candidate)).isFile())
				return candidate
		}
		catch {
			// Continue through clean-route fallbacks.
		}
	}
	return null
}

export function createStaticPreviewServer(root) {
	return createServer(async (request, response) => {
		if (!request.url || !['GET', 'HEAD'].includes(request.method || '')) {
			response.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
			response.end('Method not allowed')
			return
		}

		const filePath = await resolveStaticPreviewFile(root, request.url)
		if (!filePath) {
			response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
			response.end('Not found')
			return
		}

		const fileStat = await stat(filePath)
		response.writeHead(200, {
			'cache-control': 'no-store',
			'content-length': fileStat.size,
			'content-type': CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
		})
		if (request.method === 'HEAD') {
			response.end()
			return
		}
		createReadStream(filePath).pipe(response)
	})
}

export function startStaticPreviewServer() {
	const host = process.env.HOST || '127.0.0.1'
	const port = Number.parseInt(process.env.E2E_PORT || process.env.PORT || '3000', 10)
	const root = resolve(process.env.E2E_STATIC_ROOT || '.output/public')
	const server = createStaticPreviewServer(root)

	server.listen(port, host, () => {
		console.log(`[e2e-static-preview] Serving ${root} at http://${host}:${port}`)
	})
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.once(signal, () => server.close(() => process.exit(0)))
	return server
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (import.meta.url === entryUrl)
	startStaticPreviewServer()
