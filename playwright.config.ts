import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const e2ePort = process.env.E2E_PORT || '3000'
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`
const e2eServerCommand = process.env.E2E_SERVER_COMMAND || (process.env.E2E_REUSE_OUTPUT === '1'
	? `E2E_PORT=${e2ePort} pnpm preview:e2e:static`
	: `HOST=127.0.0.1 PORT=${e2ePort} pnpm preview:e2e`)

export default defineConfig({
	testDir: './e2e',
	snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
	expect: {
		toHaveScreenshot: {
			animations: 'disabled',
			caret: 'hide',
			maxDiffPixelRatio: 0.002,
		},
	},
	use: {
		baseURL: e2eBaseUrl,
		trace: 'retain-on-failure',
	},
	webServer: {
		command: e2eServerCommand,
		url: e2eBaseUrl,
		reuseExistingServer: !process.env.CI,
		timeout: 600_000,
	},
	projects: [
		{ name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
	],
})
