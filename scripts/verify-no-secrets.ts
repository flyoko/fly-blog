import type { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = resolve('.')
const outputRoot = resolve('.output/public')
const selfPath = 'scripts/verify-no-secrets.ts'
const maxFileBytes = 5 * 1024 * 1024

interface SecretPattern {
	name: string
	pattern: RegExp
}

const patterns: SecretPattern[] = [
	{ name: 'private-key-pem', pattern: /-{5}BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-{5}/u },
	{ name: 'github-classic-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/u },
	{ name: 'github-fine-grained-token', pattern: /\bgithub_pat_\w{40,}/u },
	{ name: 'cloudflare-api-token-value', pattern: /\bCLOUDFLARE_API_TOKEN[ \t]*[:=][ \t]*["']?(?!\$\{\{|<|REPLACE_|YOUR_)[\w-]{20,}/u },
	{ name: 'github-client-secret-value', pattern: /\bGITHUB_(?:CLIENT_SECRET|APP_PRIVATE_KEY)[ \t]*[:=][ \t]*["']?(?!\$\{\{|<|REPLACE_|YOUR_)[\w./+=-]{16,}/u },
	{ name: 'session-encryption-key-value', pattern: /\bSESSION_(?:SECRET|ENCRYPTION_KEY)[ \t]*[:=][ \t]*["']?(?!\$\{\{|<|REPLACE_|YOUR_)[\w./+=-]{24,}/u },
	{ name: 'oauth-client-secret-query', pattern: /\bclient_secret=[\w./+=-]{12,}/iu },
]

async function walk(directory: string): Promise<string[]> {
	try {
		const entries = await readdir(directory, { withFileTypes: true })
		const files = await Promise.all(entries.map(async (entry) => {
			const path = join(directory, entry.name)
			return entry.isDirectory() ? walk(path) : [path]
		}))
		return files.flat()
	}
	catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
			return []
		throw cause
	}
}

async function trackedFiles(): Promise<string[]> {
	const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
		cwd: root,
		encoding: 'buffer',
		maxBuffer: 20 * 1024 * 1024,
	})
	return stdout.toString('utf8').split('\0').filter(Boolean).map(path => resolve(root, path))
}

function isProbablyBinary(buffer: Buffer): boolean {
	const sample = buffer.subarray(0, Math.min(buffer.length, 8_192))
	return sample.includes(0)
}

async function inspectFile(path: string, failures: Array<{ path: string, pattern: string }>) {
	const relativePath = relative(root, path)
	if (relativePath === selfPath || relativePath.endsWith('pnpm-lock.yaml'))
		return
	let info
	try {
		info = await stat(path)
	}
	catch (cause) {
		if ((cause as NodeJS.ErrnoException).code === 'ENOENT')
			return
		throw cause
	}
	if (!info.isFile() || info.size > maxFileBytes)
		return
	const buffer = await readFile(path)
	if (isProbablyBinary(buffer))
		return
	const content = buffer.toString('utf8')
	for (const candidate of patterns) {
		candidate.pattern.lastIndex = 0
		if (candidate.pattern.test(content))
			failures.push({ path: relativePath, pattern: candidate.name })
	}
}

async function main() {
	const sourceFiles = await trackedFiles()
	const generatedFiles = await walk(outputRoot)
	const files = [...new Set([...sourceFiles, ...generatedFiles])]
	const failures: Array<{ path: string, pattern: string }> = []

	for (const file of files)
		await inspectFile(file, failures)

	if (failures.length) {
		console.error(`Secret scan failed with ${failures.length} finding(s):`)
		for (const failure of failures)
			console.error(`- ${failure.path}: ${failure.pattern}`)
		process.exitCode = 1
		return
	}
	console.info(`Scanned ${files.length} tracked/generated files: no secret patterns found.`)
}

await main()
