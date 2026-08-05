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

	it('builds the fixed article presentation configuration payload', () => {
		const payload = buildConfigPullRequest('article', { headerAds: [] }, 'article-config-1')
		expect(payload).toMatchObject({
			kind: 'article',
			content: { headerAds: [] },
			title: '更新文章展示配置',
		})
	})

	it('maps publish states to user-facing status metadata', () => {
		expect(publishStatusMeta('checks_pending')).toEqual({ label: '检查中', tone: 'warning' })
		expect(publishStatusMeta('preview_ready')).toEqual({ label: '可审核', tone: 'positive' })
		expect(publishStatusMeta('failed')).toEqual({ label: '失败', tone: 'danger' })
		expect(publishStatusMeta('closed')).toEqual({ label: '已关闭', tone: 'neutral' })
	})
})

describe('admin management UI boundaries', () => {
	it('lets the about editor upload animated avatars, insert body images, and preview safely', async () => {
		const about = await source('app/pages/admin/about.vue')
		const me = await source('app/pages/me.vue')
		const header = await source('app/components/blog/BlogHeader.global.vue')
		const scene = await source('app/components/blog/BlogShinchanScene.vue')
		const picker = await source('app/components/admin/AdminMediaPicker.vue')

		expect(about).toContain('insertMarkdownImage')
		expect(about).toContain('renderAdminMarkdown')
		expect(about).toContain('openMediaPicker(\'body\')')
		expect(about).toContain('openMediaPicker(\'avatar\')')
		expect(about).toContain('profile.avatar = media.url')
		expect(about).toContain('上传或选择头像')
		expect(about).toContain('GIF 会保留原始动画')
		expect(about).toContain('实时预览')
		expect(about).toContain('upload-purpose="profile"')
		expect(about).toContain('@select="selectMedia"')
		expect(about).toContain('aboutTimelineSchema.parse(payload.timeline.items)')
		expect(about).toContain('aboutLinksSchema.parse(payload.links.items)')
		expect(about).not.toContain('structuredClone(')
		expect(me).toContain('profileAvatar')
		expect(me).toContain(':character-src="profileAvatar || undefined"')
		expect(scene).toContain('characterSrc?: string')
		expect(scene).toContain('scene-profile-avatar')
		expect(header).toContain('about:header-avatar')
		expect(header).toContain(':src="headerLogo"')
		expect(picker).toContain('uploadPurpose')
		expect(picker).toContain('/api/admin/media')
		expect(picker).toContain('image/png,image/jpeg,image/webp,image/gif')
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
		const inbox = await source('app/components/admin/news/AdminNewsInbox.vue')
		const navigation = await source('config/site/navigation.json')

		expect(news.indexOf('{ id: \'rss\', label: \'站长资讯\' }')).toBeLessThan(news.indexOf('{ id: \'hot\', label: \'AI 精选\' }'))
		expect(admin).toContain('method: \'DELETE\'')
		expect(admin).toContain('/api/admin/news/items')
		expect(inbox).toContain('item.readerPath || item.originalUrl || item.url')
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
		expect(news).toContain('item.coverImage')
		expect(news).toContain('class="news-row-image"')
		expect(news).toContain('loading="lazy"')
		expect(news).toContain('@error="hideBrokenImage(item.coverImage.url)"')
		expect(news).toContain('class="news-owned-cover"')
		expect(news).toContain('news-owned-cover-brand">fly living')
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
		expect(settings).toContain('预览任务已创建')
		expect(settings).not.toContain('repositoryPath')
	})

	it('only exposes merge when checks and preview permit it', async () => {
		const reviews = await source('app/pages/admin/reviews.vue')
		const checklist = await source('app/components/admin/reviews/AdminReleaseChecklist.vue')
		const technical = await source('app/components/admin/reviews/AdminReleaseTechnicalDetails.vue')

		expect(reviews).toContain('visibleDetail.canMerge')
		expect(reviews).toContain('expectedHeadSha')
		expect(checklist).toContain('等待检查和预览全部通过')
		expect(technical).toContain('变更文件')
		expect(technical).toContain('Head SHA')
		expect(technical).toContain('file.patch')
		expect(reviews).toContain('确认上线')
		expect(reviews).toContain('selectedDirect')
		expect(reviews).toContain('正在核对这个提交的自动检查和正式部署')
		expect(reviews).toContain('打开部署结果')
		expect(reviews).toContain('title="确认上线"')
		expect(reviews).not.toContain('verification-text="MERGE"')
	})

	it('prevalidates article Markdown and links failed checks back to the editor location', async () => {
		const composable = await source('app/composables/useAdminArticleEditor.ts')
		const editor = await source('app/components/admin/AdminArticleEditor.vue')
		const existingPage = await source('app/pages/admin/articles/[id].vue')
		const newPage = await source('app/pages/admin/articles/new.vue')
		const checklist = await source('app/components/admin/reviews/AdminReleaseChecklist.vue')

		const saveSource = composable.slice(
			composable.indexOf('async function save'),
			composable.indexOf('async function reloadRemote'),
		)
		expect(saveSource).toContain('validateArticleMarkdown(document.value.body)')
		expect(saveSource.indexOf('validateArticleMarkdown(document.value.body)')).toBeLessThan(saveSource.indexOf('await useAdminApi'))
		expect(composable).toContain('error.value = \'文章正文存在格式问题，请先修正。\'')
		expect(editor).toContain('focusDiagnostic')
		expect(editor).toContain('setSelectionRange(position, position)')
		expect(existingPage).toContain(':initial-diagnostic="initialDiagnostic"')
		expect(existingPage).toContain('router.replace({ query })')
		expect(newPage).toContain(':diagnostics="editor.diagnostics.value"')
		expect(checklist).toContain('encodeArticleId(run.resourcePath)')
		expect(checklist).toContain('run.resourcePath === diagnostic.path && diagnostic.bodyLine')
		expect(checklist).toContain('?line=${diagnostic.bodyLine')
	})

	it('loads release history in bounded pages with an infinite-scroll fallback', async () => {
		const reviews = await source('app/pages/admin/reviews.vue')
		const queue = await source('app/components/admin/reviews/AdminReleaseQueue.vue')

		expect(reviews).toContain('const pageSize = 8')
		expect(reviews).toContain('fetchRunPage')
		expect(reviews).toContain('@load-more="loadMore"')
		expect(queue).toContain('useIntersectionObserver')
		expect(queue).toContain('加载更多历史记录')
		expect(queue).toContain('max-height: min(42rem, calc(100dvh - 8rem))')
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
		const newsInbox = await source('app/components/admin/news/AdminNewsInbox.vue')

		expect(emptyState).toContain('headingLevel?: 1 | 2 | 3')
		expect(emptyState).toContain('headingLevel: 2')
		expect(emptyState).toContain('<component :is="`h')
		expect(emptyState).toContain('headingLevel')
		expect(fallbackPage).toContain(':heading-level="1"')
		expect(managementStyles).toContain('color: var(--admin-text)')
		expect(newsInbox).toContain('color: var(--admin-accent-strong)')
	})
})
