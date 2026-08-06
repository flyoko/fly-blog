import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
	collectMobileAssetMetrics,
	evaluateMobileAssetBudget,
	formatBudgetViolations,
} from '../../scripts/mobile-performance-budget'

const temporaryDirectories: string[] = []

afterEach(async () => {
	await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('mobile performance budget', () => {
	it('accepts metrics at their exact limits', () => {
		const violations = evaluateMobileAssetBudget({
			assetCount: 200,
			largestJs: { bytes: 800_000, path: '_nuxt/app.js' },
			largestCss: { bytes: 120_000, path: '_nuxt/app.css' },
			homeReferencedBytes: 1_500_000,
			homeReferencedAssets: 12,
			hasQmcWorker: true,
			hasQmcWasmBundle: true,
		}, {
			maxAssetCount: 200,
			maxLargestJsBytes: 800_000,
			maxLargestCssBytes: 120_000,
			maxHomeReferencedBytes: 1_500_000,
		})

		expect(violations).toEqual([])
	})

	it('reports every exceeded or missing requirement in a stable order', () => {
		const violations = evaluateMobileAssetBudget({
			assetCount: 240,
			largestJs: { bytes: 900_000, path: '_nuxt/large.js' },
			largestCss: { bytes: 150_000, path: '_nuxt/large.css' },
			homeReferencedBytes: 2_000_000,
			homeReferencedAssets: 18,
			hasQmcWorker: false,
			hasQmcWasmBundle: false,
		}, {
			maxAssetCount: 200,
			maxLargestJsBytes: 800_000,
			maxLargestCssBytes: 120_000,
			maxHomeReferencedBytes: 1_500_000,
		})

		expect(violations.map(violation => violation.metric)).toEqual([
			'asset-count',
			'home-referenced-bytes',
			'largest-css',
			'largest-js',
			'qmc-wasm-bundle',
			'qmc-worker',
		])
		const report = formatBudgetViolations(violations)
		expect(report).toContain('largest-js: 900000 > 800000 · _nuxt/large.js')
		expect(report).toContain('qmc-worker: 0 < 1')
	})

	it('collects unique home assets and key bundles from generated output', async () => {
		const root = await mkdtemp(join(tmpdir(), 'fly-mobile-budget-'))
		temporaryDirectories.push(root)
		const assets = join(root, '_nuxt')
		await mkdir(assets)
		await Promise.all([
			writeFile(join(assets, 'entry.js'), 'j'.repeat(100)),
			writeFile(join(assets, 'page.js'), 'p'.repeat(250)),
			writeFile(join(assets, 'entry.css'), 'c'.repeat(80)),
			writeFile(join(assets, 'qmc-decrypt.worker-hash.js'), 'w'.repeat(30)),
			writeFile(join(assets, 'QmcWasmBundle-hash.js'), 'q'.repeat(40)),
			writeFile(join(root, 'index.html'), [
				'<script src="/_nuxt/entry.js"></script>',
				'<script src="/_nuxt/entry.js?duplicate=1"></script>',
				'<link rel="stylesheet" href="/_nuxt/entry.css">',
			].join('\n')),
		])

		await expect(collectMobileAssetMetrics(root)).resolves.toEqual({
			assetCount: 5,
			largestJs: { bytes: 250, path: '_nuxt/page.js' },
			largestCss: { bytes: 80, path: '_nuxt/entry.css' },
			homeReferencedBytes: 180,
			homeReferencedAssets: 2,
			hasQmcWorker: true,
			hasQmcWasmBundle: true,
		})
	})
})
