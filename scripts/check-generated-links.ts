import { access, readdir, readFile, stat } from 'node:fs/promises'
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path'
import process from 'node:process'

const outputRoot = resolve('.output/public')
const hrefPattern = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/giu
const ignoredSchemes = /^(?:#|mailto:|tel:|sms:|data:|javascript:|blob:)/iu

async function walk(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true })
	const files = await Promise.all(entries.map(async (entry) => {
		const path = join(directory, entry.name)
		return entry.isDirectory() ? walk(path) : [path]
	}))
	return files.flat()
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path)
		return true
	}
	catch {
		return false
	}
}

function withoutQueryOrHash(value: string): string {
	const hashIndex = value.indexOf('#')
	const queryIndex = value.indexOf('?')
	const cutAt = [hashIndex, queryIndex].filter(index => index >= 0).sort((a, b) => a - b)[0]
	return cutAt === undefined ? value : value.slice(0, cutAt)
}

function insideOutputRoot(path: string): boolean {
	const target = normalize(path)
	return target === outputRoot || target.startsWith(`${outputRoot}${sep}`)
}

function candidateTargets(sourceFile: string, rawHref: string): string[] {
	const href = withoutQueryOrHash(rawHref.trim())
	if (!href)
		return []

	let decoded: string
	try {
		decoded = decodeURI(href)
	}
	catch {
		decoded = href
	}

	const sourceDirectory = dirname(sourceFile)
	const base = decoded.startsWith('/')
		? resolve(outputRoot, `.${decoded}`)
		: resolve(sourceDirectory, decoded)
	if (!insideOutputRoot(base))
		return []

	const candidates = new Set<string>([base])
	if (decoded.endsWith('/')) {
		candidates.add(join(base, 'index.html'))
	}
	else if (!extname(base)) {
		candidates.add(`${base}.html`)
		candidates.add(join(base, 'index.html'))
	}
	return [...candidates]
}

function shouldInspect(href: string): boolean {
	const value = href.trim()
	if (!value || ignoredSchemes.test(value) || value.startsWith('//'))
		return false
	try {
		const url = new URL(value)
		return !['http:', 'https:'].includes(url.protocol)
	}
	catch {
		return true
	}
}

async function main() {
	if (!await exists(outputRoot))
		throw new Error('Missing .output/public. Run pnpm generate first.')
	if (!(await stat(outputRoot)).isDirectory())
		throw new Error('.output/public is not a directory.')

	const htmlFiles = (await walk(outputRoot)).filter(file => file.endsWith('.html'))
	const failures: Array<{ source: string, href: string }> = []

	for (const sourceFile of htmlFiles) {
		const html = await readFile(sourceFile, 'utf8')
		for (const match of html.matchAll(hrefPattern)) {
			const href = match[1] ?? match[2] ?? ''
			if (!shouldInspect(href))
				continue
			const candidates = candidateTargets(sourceFile, href)
			const candidateResults = await Promise.all(candidates.map(exists))
			if (!candidateResults.some(Boolean))
				failures.push({ source: relative(outputRoot, sourceFile), href })
		}
	}

	if (failures.length) {
		console.error(`Found ${failures.length} broken generated link(s):`)
		for (const failure of failures)
			console.error(`- ${failure.source}: ${failure.href}`)
		process.exitCode = 1
		return
	}
	console.info(`Checked ${htmlFiles.length} generated HTML files: no broken internal href values.`)
}

await main()
