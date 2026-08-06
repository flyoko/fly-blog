import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

export interface AssetSize {
	bytes: number
	path: string
}

export interface MobileAssetMetrics {
	assetCount: number
	largestJs: AssetSize
	largestCss: AssetSize
	homeReferencedBytes: number
	homeReferencedAssets: number
	hasQmcWorker: boolean
	hasQmcWasmBundle: boolean
}

export interface MobileAssetBudget {
	maxAssetCount: number
	maxLargestJsBytes: number
	maxLargestCssBytes: number
	maxHomeReferencedBytes: number
}

export type BudgetMetric
	= | 'asset-count'
		| 'home-referenced-bytes'
		| 'largest-css'
		| 'largest-js'
		| 'qmc-wasm-bundle'
		| 'qmc-worker'

export interface BudgetViolation {
	metric: BudgetMetric
	actual: number
	limit: number
	comparison: 'max' | 'min'
	detail?: string
}

export const mobileAssetBudget: MobileAssetBudget = {
	maxAssetCount: 225,
	maxLargestJsBytes: 850_000,
	maxLargestCssBytes: 115_000,
	maxHomeReferencedBytes: 1_300_000,
}

function portablePath(path: string) {
	return path.split(sep).join('/')
}

async function listFiles(root: string): Promise<string[]> {
	const entries = await readdir(root, { withFileTypes: true })
	const nested = await Promise.all(entries.map(async (entry) => {
		const path = join(root, entry.name)
		return entry.isDirectory() ? listFiles(path) : [path]
	}))
	return nested.flat()
}

function largest(files: AssetSize[], extension: string): AssetSize {
	return files
		.filter(file => file.path.endsWith(extension))
		.sort((left, right) => right.bytes - left.bytes || left.path.localeCompare(right.path))[0]
		?? { bytes: 0, path: '' }
}

function homeAssetPaths(html: string) {
	const paths = new Set<string>()
	const pattern = /(?:src|href)=["']([^"']*\/_nuxt\/[^"']+)["']/gu
	for (const match of html.matchAll(pattern)) {
		const raw = match[1]
		if (!raw)
			continue
		const pathname = new URL(raw, 'https://local.invalid').pathname
		if (pathname.startsWith('/_nuxt/'))
			paths.add(pathname.slice(1))
	}
	return [...paths].sort()
}

export async function collectMobileAssetMetrics(outputRoot = resolve('.output/public')): Promise<MobileAssetMetrics> {
	const assetsRoot = join(outputRoot, '_nuxt')
	const assetPaths = await listFiles(assetsRoot)
	const assets = await Promise.all(assetPaths.map(async path => ({
		bytes: (await stat(path)).size,
		path: portablePath(relative(outputRoot, path)),
	})))
	const homeHtml = await readFile(join(outputRoot, 'index.html'), 'utf8')
	const referencedPaths = homeAssetPaths(homeHtml)
	const assetSizes = new Map(assets.map(asset => [asset.path, asset.bytes]))
	const homeReferencedBytes = referencedPaths.reduce((total, path) => total + (assetSizes.get(path) ?? 0), 0)

	return {
		assetCount: assets.length,
		largestJs: largest(assets, '.js'),
		largestCss: largest(assets, '.css'),
		homeReferencedBytes,
		homeReferencedAssets: referencedPaths.length,
		hasQmcWorker: assets.some(asset => /(?:^|\/)qmc-decrypt\.worker-.*\.js$/u.test(asset.path)),
		hasQmcWasmBundle: assets.some(asset => /(?:^|\/)QmcWasmBundle-.*\.js$/u.test(asset.path)),
	}
}

export function evaluateMobileAssetBudget(metrics: MobileAssetMetrics, budget: MobileAssetBudget): BudgetViolation[] {
	const violations: BudgetViolation[] = []
	const maximums: Array<[BudgetMetric, number, number, string | undefined]> = [
		['asset-count', metrics.assetCount, budget.maxAssetCount, undefined],
		['largest-css', metrics.largestCss.bytes, budget.maxLargestCssBytes, metrics.largestCss.path],
		['largest-js', metrics.largestJs.bytes, budget.maxLargestJsBytes, metrics.largestJs.path],
		['home-referenced-bytes', metrics.homeReferencedBytes, budget.maxHomeReferencedBytes, `${metrics.homeReferencedAssets} assets`],
	]
	for (const [metric, actual, limit, detail] of maximums) {
		if (actual > limit)
			violations.push({ metric, actual, limit, comparison: 'max', detail })
	}
	if (!metrics.hasQmcWasmBundle)
		violations.push({ metric: 'qmc-wasm-bundle', actual: 0, limit: 1, comparison: 'min' })
	if (!metrics.hasQmcWorker)
		violations.push({ metric: 'qmc-worker', actual: 0, limit: 1, comparison: 'min' })
	return violations.sort((left, right) => left.metric.localeCompare(right.metric))
}

export function formatBudgetViolations(violations: BudgetViolation[]) {
	return violations.map((violation) => {
		const operator = violation.comparison === 'max' ? '>' : '<'
		const detail = violation.detail ? ` · ${violation.detail}` : ''
		return `${violation.metric}: ${violation.actual} ${operator} ${violation.limit}${detail}`
	}).join('\n')
}

export function formatMobileAssetMetrics(metrics: MobileAssetMetrics) {
	return [
		`assets=${metrics.assetCount}`,
		`largest-js=${metrics.largestJs.bytes} (${metrics.largestJs.path})`,
		`largest-css=${metrics.largestCss.bytes} (${metrics.largestCss.path})`,
		`home-referenced=${metrics.homeReferencedBytes} (${metrics.homeReferencedAssets} assets)`,
		`qmc-worker=${metrics.hasQmcWorker}`,
		`qmc-wasm-bundle=${metrics.hasQmcWasmBundle}`,
	].join(' · ')
}
