import type { AdminSessionDto } from '#shared/admin/auth'
import type { ConfigPullRequestRequest } from '#shared/admin/publishing'

export type AdminConfigKind = 'categories' | 'navigation' | 'footer' | 'modules' | 'aboutTimeline' | 'aboutLinks'

const configLabels: Record<AdminConfigKind, string> = {
	categories: '分类配置',
	navigation: '导航配置',
	footer: '页脚配置',
	modules: '模块配置',
	aboutTimeline: '自述时间线',
	aboutLinks: '自述链接',
}

export function buildConfigPullRequest(
	kind: AdminConfigKind,
	content: unknown,
	idempotencyKey: string,
): ConfigPullRequestRequest {
	return {
		kind,
		content,
		idempotencyKey,
		title: `更新${configLabels[kind]}`,
		body: '由 fly living 管理后台提交，等待预览与检查通过后合并。',
	}
}

export function publishStatusMeta(status: string) {
	if (status === 'checks_pending')
		return { label: '检查中', tone: 'warning' as const }
	if (status === 'preview_ready')
		return { label: '可审核', tone: 'positive' as const }
	if (status === 'failed')
		return { label: '失败', tone: 'danger' as const }
	if (status === 'merged' || status === 'published')
		return { label: '已发布', tone: 'positive' as const }
	if (status === 'conflict')
		return { label: '存在冲突', tone: 'danger' as const }
	return { label: '处理中', tone: 'neutral' as const }
}

export interface AdminNavigationItem {
	label: string
	to: string
	icon: string
}

export const adminNavigation: AdminNavigationItem[] = [
	{ label: '概览', to: '/admin', icon: 'tabler:layout-dashboard' },
	{ label: '文章', to: '/admin/articles', icon: 'tabler:file-text' },
	{ label: '瞬间', to: '/admin/moments', icon: 'tabler:sparkles' },
	{ label: 'AI 阅闻', to: '/admin/ai-news', icon: 'tabler:news' },
	{ label: '自述', to: '/admin/about', icon: 'tabler:user-circle' },
	{ label: '媒体库', to: '/admin/media', icon: 'tabler:photo' },
	{ label: '随心听', to: '/admin/music', icon: 'tabler:headphones' },
	{ label: '模块管理', to: '/admin/modules', icon: 'tabler:layout-grid' },
	{ label: '发布与审核', to: '/admin/reviews', icon: 'tabler:git-pull-request' },
	{ label: '站点设置', to: '/admin/settings', icon: 'tabler:settings' },
]

export const adminUnavailableSections = {
	music: { title: '随心听', cycle: 3, description: '歌单与播放器管理将在周期 3 接入。' },
	modules: { title: '模块管理', cycle: 3, description: '统一模块开关与排序将在周期 3 接入。' },
} as const

export type AdminUnavailableSection = keyof typeof adminUnavailableSections

export interface AdminServiceHealth {
	service: 'github' | 'd1' | 'r2' | 'pages'
	status: 'ok' | 'degraded' | 'down'
	checkedAt: string
	message?: string
}

export interface AdminPublishRunDto {
	id: string
	kind: 'direct' | 'pull_request'
	status: string
	repositoryRef: string
	resourcePath: string | null
	commitSha: string | null
	pullNumber: number | null
	pullRequestUrl: string | null
	workflowRunId: number | null
	deploymentUrl: string | null
	errorCode: string | null
	errorMessage: string | null
	createdAt: string
	updatedAt: string
}

export interface AdminOverviewDto {
	counts: {
		articles: number | null
		activeMedia: number | null
		publishedMoments: number | null
		publishedNews: number | null
		openPullRequests: number | null
		pendingPublishes: number | null
		failedPublishes: number | null
	}
	latestPublish: AdminPublishRunDto | null
	backupState: { last_success_at?: string | null, last_backup_path?: string | null, last_error?: string | null } | null
	services: AdminServiceHealth[]
}

export function resolveAdminAuthNavigation(session: Pick<AdminSessionDto, 'authenticated'>, path: string): string | null {
	if (path === '/admin/login')
		return session.authenticated ? '/admin' : null
	if (!session.authenticated)
		return `/admin/login?returnTo=${encodeURIComponent(path)}`
	return null
}

export function serviceStatusMeta(status: AdminServiceHealth['status']) {
	if (status === 'ok')
		return { label: '运行正常', tone: 'positive' as const }
	if (status === 'degraded')
		return { label: '需要关注', tone: 'warning' as const }
	return { label: '暂不可用', tone: 'danger' as const }
}
