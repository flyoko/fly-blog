import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const source = (path: string) => readFile(`${root}/${path}`, 'utf8')

describe('周期 6 后台韧性与写作体验', () => {
	it('在分块失效时立即恢复，并保留应用状态', async () => {
		const config = await source('nuxt.config.ts')
		const plugin = await source('app/plugins/admin-recovery.client.ts')

		expect(config).toContain('emitRouteChunkError: \'automatic-immediate\'')
		expect(config).toContain('restoreState: true')
		const headers = await source('public/_headers')
		expect(headers).toContain('Cache-Control: no-cache, no-store, must-revalidate')
		expect(headers).toContain('/200')
		expect(headers).toContain('/admin/*')
		expect(plugin).toContain('window.addEventListener(\'vite:preloadError\'')
		expect(plugin).toContain('preloadEvent.preventDefault()')
		expect(plugin).toContain('页面已恢复')
		expect(plugin).toContain('duration: 10_000')
		expect(plugin).toContain('showRecoveredNotice()')
		expect(plugin).not.toContain('nuxtApp.hook(\'app:mounted\'')
	})

	it('为后台提供全局弹出反馈和无技术栈页面兜底', async () => {
		const layout = await source('app/layouts/admin.vue')
		const toast = await source('app/components/admin/AdminToastCenter.vue')
		const fallback = await source('app/components/admin/AdminRouteFallback.vue')

		expect(layout).toContain('<AdminToastCenter')
		expect(layout).toContain('<NuxtErrorBoundary')
		expect(layout).toContain('<AdminRouteFallback')
		expect(toast).toContain('后台通知')
		expect(fallback).toContain('这个页面暂时没有加载完整')
		expect(fallback).not.toContain('error.message')
	})

	it('预览失败时隐藏底层错误，并支持专注写作和一键重试', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')

		expect(editor).toContain('专注写作')
		expect(editor).toContain('预览暂时没有更新')
		expect(editor).toContain('重新加载预览')
		expect(editor).not.toContain('error?.message')
		expect(editor).not.toContain('Markdown 预览失败：')
	})
})
