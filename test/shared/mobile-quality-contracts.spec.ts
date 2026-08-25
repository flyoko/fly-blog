import { spawnSync } from 'node:child_process'
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
		expect(workflow).toContain(`config_visual_exempt: ${githubExpression('steps.config_detect.outputs.eligible || \'false\'')}`)
		expect(workflow).toContain('startsWith(github.head_ref, \'admin/config/\')')
		expect(workflow).toContain('bash scripts/is-admin-config-fast-path.sh "$GITHUB_HEAD_REF" "$changed_path"')
		expect(mobileJob).toContain('runs-on: ubuntu-latest')
		expect(mobileJob).toContain('test "$RUNNER_OS" = "Linux"')
		expect(mobileJob).toContain('needs: article_fast_path')
		expect(mobileJob).toContain(`if: ${githubExpression('needs.article_fast_path.outputs.eligible != \'true\'')}`)
		expect(mobileJob).toContain(`- run: pnpm test:e2e:mobile:visual\n        if: ${githubExpression('needs.article_fast_path.outputs.config_visual_exempt != \'true\'')}`)
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

	it('gates production visual checks only for changes that can affect rendered UI', () => {
		const script = 'scripts/requires-mobile-quality.sh'
		const classify = (path: string) => spawnSync('bash', [script, path], { encoding: 'utf8' }).status

		expect(classify('content/posts/2026/hello-world.md')).toBe(1)
		expect(classify('config/about/timeline.json')).toBe(1)
		expect(classify('config/about/links.json')).toBe(1)
		expect(classify('app/assets/css/main.scss')).toBe(0)
		expect(classify('app/components/blog/BlogHeader.global.vue')).toBe(0)
		expect(classify('config/site/navigation.json')).toBe(0)
		expect(classify('nuxt.config.ts')).toBe(0)
		expect(classify('package.json')).toBe(0)
	})
})
