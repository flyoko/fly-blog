import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const githubExpression = (value: string) => ['$', '{{ ', value, ' }}'].join('')

describe('mobile quality contracts', () => {
	it('exposes stable mobile quality commands', () => {
		const packageJson = JSON.parse(read('package.json')) as {
			scripts: Record<string, string>
		}

		expect(packageJson.scripts['test:e2e:mobile']).toBe('playwright test --project=mobile-chromium --grep-invert @visual')
		expect(packageJson.scripts['test:e2e:mobile:visual']).toBe('playwright test --project=mobile-chromium --grep @visual')
		expect(packageJson.scripts['check:mobile-performance']).toBe('unrun scripts/check-mobile-performance-budget.ts')
	})

	it('keeps screenshot output deterministic', () => {
		const config = read('playwright.config.ts')
		expect(config).toContain('snapshotPathTemplate: \'{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}\'')
		expect(config).toContain('animations: \'disabled\'')
		expect(config).toContain('caret: \'hide\'')
		expect(config).toContain('maxDiffPixelRatio: 0.002')
	})

	it('runs mobile quality on a fixed Linux runner and uploads failures', () => {
		const workflow = read('.github/workflows/quality.yml')
		const mobileJob = workflow.slice(workflow.indexOf('  mobile-quality:'))

		expect(workflow).toContain(`article-fast-path: ${githubExpression('steps.article-fast-path.outputs.eligible')}`)
		expect(mobileJob).toContain(`runs-on: ${githubExpression('vars.MOBILE_QUALITY_RUNNER || \'ubuntu-latest\'')}`)
		expect(mobileJob).toContain('test "$RUNNER_OS" = "Linux"')
		expect(mobileJob).toContain('needs: verify')
		expect(mobileJob).toContain(`if: ${githubExpression('needs.verify.outputs.article-fast-path != \'true\'')}`)
		expect(mobileJob).toContain('pnpm exec playwright install --with-deps chromium')
		expect(mobileJob).toContain('E2E_SERVER_COMMAND: python3 -m http.server 3000 --bind 127.0.0.1 --directory .output/public')
		expect(mobileJob).toContain('pnpm generate')
		expect(mobileJob).toContain('pnpm test:e2e:mobile')
		expect(mobileJob).toContain('pnpm test:e2e:mobile:visual')
		expect(mobileJob).toContain('pnpm check:mobile-performance')
		expect(mobileJob).toContain('uses: actions/upload-artifact@v4')
		expect(mobileJob).toContain(`if: ${githubExpression('failure()')}`)
		expect(mobileJob).toContain('playwright-report')
		expect(mobileJob).toContain('test-results')
		expect(mobileJob).not.toContain('vars.CI_RUNNER')
	})
})
