import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	buildConfigPullRequest,
	publishStatusMeta,
} from '../../app/types/admin'

const root = fileURLToPath(new URL('../..', import.meta.url))

async function source(path: string) {
	return readFile(`${root}/${path}`, 'utf8')
}

describe('admin management helpers', () => {
	it('builds fixed-kind configuration PR payloads without accepting arbitrary paths', () => {
		const payload = buildConfigPullRequest('categories', [{ name: '技术', icon: 'tabler:code' }], 'config-change-1')
		expect(payload).toEqual({
			kind: 'categories',
			content: [{ name: '技术', icon: 'tabler:code' }],
			idempotencyKey: 'config-change-1',
			title: '更新分类配置',
			body: '由 fly living 管理后台提交，等待预览与检查通过后合并。',
		})
		expect(payload).not.toHaveProperty('path')
	})

	it('maps publish states to user-facing status metadata', () => {
		expect(publishStatusMeta('checks_pending')).toEqual({ label: '检查中', tone: 'warning' })
		expect(publishStatusMeta('preview_ready')).toEqual({ label: '可审核', tone: 'positive' })
		expect(publishStatusMeta('failed')).toEqual({ label: '失败', tone: 'danger' })
		expect(publishStatusMeta('closed')).toEqual({ label: '已关闭', tone: 'neutral' })
	})
})

describe('admin management UI boundaries', () => {
	it('lets the about editor upload, insert, and preview profile images', async () => {
		const about = await source('app/pages/admin/about.vue')
		const picker = await source('app/components/admin/AdminMediaPicker.vue')

		expect(about).toContain('insertMarkdownImage')
		expect(about).toContain('renderAdminMarkdown')
		expect(about).toContain('插入图片')
		expect(about).toContain('实时预览')
		expect(about).toContain('upload-purpose="profile"')
		expect(picker).toContain('uploadPurpose')
		expect(picker).toContain('/api/admin/media')
		expect(picker).toContain('上传图片')
	})

	it('uses the public station-news label instead of exposing the upstream brand', async () => {
		const news = await source('app/pages/ai.news/index.vue')
		expect(news).toContain('{ id: \'rss\', label: \'站长资讯\' }')
		expect(news).not.toContain('在花资讯')
	})

	it('orders station news before AI selections and supports deleting admin items', async () => {
		const news = await source('app/pages/ai.news/index.vue')
		const admin = await source('app/pages/admin/ai-news.vue')
		const navigation = await source('config/site/navigation.json')

		expect(news.indexOf('{ id: \'rss\', label: \'站长资讯\' }')).toBeLessThan(news.indexOf('{ id: \'hot\', label: \'AI 精选\' }'))
		expect(admin).toContain('method: \'DELETE\'')
		expect(admin).toContain('/api/admin/news/items')
		expect(admin).toContain('item.readerPath || item.originalUrl || item.url')
		expect(admin).toContain('删除 AI 阅闻条目')
		expect(navigation).toContain('"text": "AI 阅闻"')
	})

	it('uses the approved compact internal-reading layout for public AI news', async () => {
		const news = await source('app/pages/ai.news/index.vue')

		expect(news).toContain('class="news-workbench"')
		expect(news).toContain('class="news-feed')
		expect(news).toContain('class="news-digest')
		expect(news).toContain('最新收录')
		expect(news).toContain('今日日报')
		expect(news).toContain('站内阅读')
		expect(news).toContain('item.readerPath')
		expect(news).not.toContain('news-feature')
		expect(news).not.toContain('<img')
	})

	it('shows per-file partial upload results and trash restoration', async () => {
		const media = await source('app/pages/admin/media.vue')
		expect(media).toContain('部分文件上传失败')
		expect(media).toContain('恢复媒体')
		expect(media).toContain('永久删除')
		expect(media).toContain('? \'DELETE\' : \'\'')
		expect(media).toContain('role="group"')
		expect(media).toContain(':aria-pressed="status === item.value"')
		expect(media).toContain('aria-label="选择要上传的媒体文件"')
	})

	it('requires a path-bound RESTORE confirmation after moment backup preview', async () => {
		const moments = await source('app/pages/admin/moments.vue')
		expect(moments).toContain('v-model.trim="restoreConfirmation"')
		expect(moments).toContain('backupPreview.value = { ...preview, path }')
		expect(moments).toContain('backupPreview.value.path !== backupPath.value')
		expect(moments).toContain('restoreConfirmation.value !== \'RESTORE\'')
		expect(moments).toContain('watch(backupPath')
	})

	it('submits settings through the controlled configuration PR endpoint', async () => {
		const settings = await source('app/pages/admin/settings.vue')
		expect(settings).toContain('/api/admin/publishing/pull-requests')
		expect(settings).toContain('创建配置 PR')
		expect(settings).not.toContain('repositoryPath')
	})

	it('only exposes merge when checks and preview permit it', async () => {
		const reviews = await source('app/pages/admin/reviews.vue')
		expect(reviews).toContain('canMerge')
		expect(reviews).toContain('检查与预览尚未通过')
		expect(reviews).toContain('变更文件')
		expect(reviews).toContain('Head SHA')
		expect(reviews).toContain('file.patch')
		expect(reviews).toContain('确认合并')
		expect(reviews).toContain('verification-text="MERGE"')
		expect(reviews).toContain(':show-actions="false"')
	})

	it('uses a reusable publish status component', async () => {
		const component = await source('app/components/admin/AdminPublishStatus.vue')
		expect(component).toContain('publishStatusMeta')
		expect(component).toContain('deploymentUrl')
		expect(component).toContain('showActions?: boolean')
		expect(component).toContain('v-if="showActions"')
	})

	it('keeps nested empty states below the page heading and status text readable', async () => {
		const emptyState = await source('app/components/admin/AdminEmptyState.vue')
		const fallbackPage = await source('app/pages/admin/[section].vue')
		const managementStyles = await source('app/assets/css/admin-management.scss')
		const news = await source('app/pages/admin/ai-news.vue')

		expect(emptyState).toContain('headingLevel?: 1 | 2 | 3')
		expect(emptyState).toContain('headingLevel: 2')
		expect(emptyState).toContain('<component :is="`h')
		expect(emptyState).toContain('headingLevel')
		expect(fallbackPage).toContain(':heading-level="1"')
		expect(managementStyles).toContain('color: var(--admin-text)')
		expect(news).toContain('color: var(--admin-accent-strong)')
	})
})
