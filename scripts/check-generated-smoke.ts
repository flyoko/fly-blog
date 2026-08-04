import { access, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const outputRoot = resolve('.output/public')

async function fileExists(path: string) {
	try {
		await access(path)
		return true
	}
	catch {
		return false
	}
}

async function requireFile(relativePath: string) {
	const path = join(outputRoot, relativePath)
	await access(path)
	return path
}

async function requireOneOf(relativePaths: string[]) {
	for (const relativePath of relativePaths) {
		const path = join(outputRoot, relativePath)
		if (await fileExists(path))
			return path
	}
	throw new Error(`Generated output is missing all expected paths: ${relativePaths.join(', ')}`)
}

async function main() {
	const indexPath = await requireFile('index.html')
	const adminMediaPath = await requireOneOf(['admin/media/index.html', 'admin/media.html'])
	const [indexHtml, adminMediaHtml, assets] = await Promise.all([
		readFile(indexPath, 'utf8'),
		readFile(adminMediaPath, 'utf8'),
		readdir(join(outputRoot, '_nuxt')),
	])

	if (!indexHtml.includes('fly living'))
		throw new Error('Generated home page does not contain the site title.')
	if (!adminMediaHtml.includes('<html'))
		throw new Error('Generated admin media page is not valid HTML.')

	const qmcWorker = assets.find(name => /^qmc-decrypt\.worker-.*\.js$/u.test(name))
	const qmcWasm = assets.find(name => /^QmcWasmBundle-.*\.js$/u.test(name))
	if (!qmcWorker || !qmcWasm)
		throw new Error('Generated output is missing the QMC Worker or WASM bundle.')

	console.info(`Generated smoke passed: home, admin media, ${qmcWorker}, ${qmcWasm}.`)
}

await main()
