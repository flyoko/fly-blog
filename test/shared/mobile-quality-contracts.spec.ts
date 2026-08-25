import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const githubExpression = (value: string) => ['$', '{{ ', value, ' }}'].join('')

describe('mobile quality contracts', () => {
	it('exposes stable mobile quality commands', () => {
		const packageJson = JSON.parse(read('package.json')) as {
			scripts: Record<string, string>
		}

		expect(packageJson.scripts['preview:e2e:static']).toBe('node scripts/serve-static-e2e.mjs')
		expect(packageJson.scripts['test:e2e:mobile']).toBe('playwright test e2e/mobile-experience.spec.ts e2e/mobile-navigation-layering.spec.ts e2e/mobile-performance-budget.spec.ts e2e/mobile-player-performance.spec.ts --project=mobile-chromium --workers=1 --retries=0')
		expect(packageJson.scripts['test:e2e:mobile:visual']).toBe('playwright test e2e/mobile-visual.spec.ts --project=mobile-chromium --workers=1 --retries=0')
		expect(packageJson.scripts['check:mobile-performance']).toBe('unrun scripts/check-mobile-performance-budget.ts')
	})

	it('keeps screenshot output deterministic', () => {
		const config = read('playwright.config.ts')
		expect(config).toContain(['? `E2E_PORT=', '$', '{e2ePort} pnpm preview:e2e:static`'].join(''))
		expect(config).toContain('snapshotPathTemplate: \'{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}\'')
		expect(config).toContain('animations: \'disabled\'')
		expect(config).toContain('caret: \'hide\'')
		expect(config).toContain('maxDiffPixelRatio: 0.002')
	})

	it('runs mobile quality on a fixed Linux runner and uploads failures', () => {
		const workflow = read('.github/workflows/quality.yml')
		const mobileJob = workflow.slice(workflow.indexOf('  mobile-quality:'))

		expect(workflow).toContain(`eligible: ${githubExpression('steps.detect.outputs.eligible || \'false\'')}`)
		expect(mobileJob).toContain('runs-on: ubuntu-latest')
		expect(mobileJob).toContain('test "$RUNNER_OS" = "Linux"')
		expect(mobileJob).toContain('needs: article_fast_path')
		expect(mobileJob).toContain(`if: ${githubExpression('needs.article_fast_path.outputs.eligible != \'true\'')}`)
		expect(mobileJob).toContain('pnpm exec playwright install --with-deps chromium')
		expect(mobileJob).toContain('E2E_SERVER_COMMAND: pnpm preview:e2e:static')
		expect(mobileJob).toContain('pnpm generate')
		expect(mobileJob).toContain('pnpm test:e2e:mobile')
		expect(mobileJob).toContain('pnpm test:e2e:mobile:visual')
		expect(mobileJob).toContain('pnpm check:mobile-performance')
		expect(mobileJob).toContain('uses: actions/upload-artifact@v6')
		expect(mobileJob).toContain(`if: ${githubExpression('failure()')}`)
		expect(mobileJob).toContain('playwright-report')
		expect(mobileJob).toContain('test-results')
		expect(mobileJob).not.toContain('vars.CI_RUNNER')
		expect(mobileJob).not.toContain('vars.MOBILE_QUALITY_RUNNER')
	})
})
