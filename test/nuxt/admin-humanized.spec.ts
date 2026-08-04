import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	reviewCheckMeta,
	reviewDeploymentMeta,
} from '../../app/types/admin'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

describe('cycle 5 humanized admin contracts', () => {
	it('offers a searchable quick-start palette from the top bar and keyboard', async () => {
		const layout = await source('app/layouts/admin.vue')
		const topbar = await source('app/components/admin/AdminTopbar.vue')
		const palette = await source('app/components/admin/AdminCommandPalette.vue')

		expect(layout).toContain('event.key.toLowerCase() !== \'k\'')
		expect(layout).toContain('<AdminCommandPalette')
		expect(topbar).toContain('快速开始')
		expect(topbar).toContain('emit(\'command\')')
		expect(palette).toContain('搜索要做的事')
		expect(palette).toContain('写一篇文章')
		expect(palette).toContain('上传和整理媒体')
	})

	it('turns repository configuration into visual, task-oriented editors', async () => {
		const settings = await source('app/pages/admin/settings.vue')

		expect(settings).toContain('导航菜单')
		expect(settings).toContain('页脚内容')
		expect(settings).toContain('添加导航项')
		expect(settings).toContain('添加页脚链接')
		expect(settings).toContain('前往模块管理')
		expect(settings).not.toContain('结构化 JSON')
		expect(settings).not.toContain('admin-json-editor')
	})

	it('makes article state, reading size, shortcuts, and draft safety visible', async () => {
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		const composable = await source('app/composables/useAdminArticleEditor.ts')

		expect(editor).toContain('保存草稿')
		expect(editor).toContain('发布文章')
		expect(editor).toContain('提交审核')
		expect(editor).toContain('约 {{ readingMinutes }} 分钟')
		expect(editor).toContain('event.key.toLowerCase() !== \'s\'')
		expect(composable).toContain('hasUnsavedChanges')
		expect(composable).toContain('localDraftFingerprint')
		expect(composable).toContain('flushPendingDraft')
		expect(composable).toContain('onBeforeRouteLeave(async () =>')
		expect(composable).toContain('const snapshot = cloneArticleDocument(document.value)')
		expect(composable).toContain('await persistLocalDraft()')
	})

	it('translates review infrastructure states into clear next steps', async () => {
		expect(reviewCheckMeta('success')).toEqual({ label: '检查通过', tone: 'positive' })
		expect(reviewCheckMeta('pending')).toEqual({ label: '检查进行中', tone: 'warning' })
		expect(reviewCheckMeta('failure')).toEqual({ label: '检查未通过', tone: 'danger' })
		expect(reviewDeploymentMeta('success')).toEqual({ label: '预览可用', tone: 'positive' })
		expect(reviewDeploymentMeta(null)).toEqual({ label: '等待预览', tone: 'neutral' })
	})

	it('keeps nested admin routes transition-safe and declares page language', async () => {
		const adminRoot = await source('app/pages/admin.vue')
		const nuxtConfig = await source('nuxt.config.ts')

		expect(adminRoot).toContain('<div class="admin-route-view">')
		expect(nuxtConfig).toContain('htmlAttrs: { lang: \'zh-CN\' }')
	})
})
