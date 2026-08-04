import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('module management runtime integration', () => {
	it('applies committed module state to navigation and direct route access', () => {
		const appConfig = read('app/app.config.ts')
		const middleware = read('app/middleware/module-availability.global.ts')
		const home = read('app/pages/index.vue')
		const sidebar = read('app/components/blog/BlogSidebar.vue')
		const momentsApi = read('workers/api/src/features/moments/public-routes.ts')
		const newsApi = read('workers/api/src/features/news/routes.ts')
		const nuxtConfig = read('nuxt.config.ts')

		expect(appConfig).toContain('filterAndSortModuleItems')
		expect(appConfig).toContain('featureModules')
		expect(middleware).toContain('moduleIdForPublicPath')
		expect(middleware).toContain('isModuleEnabled')
		expect(middleware).toContain('statusCode: 404')
		expect(home).toContain('articlesEnabled')
		expect(home).toContain('文章模块已停用')
		expect(sidebar).toContain('v-if="searchEnabled"')
		expect(momentsApi).toContain('isModuleEnabled(configuredModules, \'moments\')')
		expect(newsApi).toContain('isModuleEnabled(configuredModules, \'ai-news\')')
		expect(nuxtConfig).toContain('ignore: disabledModulePrerenderPaths')
	})

	it('explains fixed utility positions and deployment timing', () => {
		const admin = read('app/components/admin/settings/AdminModuleWorkbench.vue')
		expect(admin).toContain('保存后先生成预览，不会直接影响线上')
		expect(admin).toContain('固定位置')
		expect(admin).toContain('isNavigationModuleId')
	})

	it('reloads module state from the production branch instead of stale bundled data', () => {
		const admin = read('app/components/admin/settings/AdminModuleWorkbench.vue')
		expect(admin).toContain('/api/admin/publishing/configs/modules')
		expect(admin).toContain('loadDeployedModules')
		expect(admin).toContain('重新读取线上配置')
	})

	it('bundles every dynamic weather icon used by module cards and forecasts', () => {
		const nuxtConfig = read('nuxt.config.ts')
		for (const icon of [
			'ri:sun-cloudy-line',
			'tabler:cloud-question',
			'tabler:cloud-storm',
			'tabler:mist',
		]) {
			expect(nuxtConfig).toContain(icon)
		}
	})
})
