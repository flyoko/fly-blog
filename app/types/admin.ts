import type { AdminSessionDto } from '#shared/admin/auth'
import type { ConfigPullRequestRequest } from '#shared/admin/publishing'

export type AdminConfigKind = 'article' | 'categories' | 'navigation' | 'footer' | 'modules' | 'weather' | 'aboutTimeline' | 'aboutLinks'

const configLabels: Record<AdminConfigKind, string> = {
	article: '文章展示配置',
	categories: '分类配置',
	navigation: '导航配置',
	footer: '页脚配置',
	modules: '模块配置',
	weather: '天气配置',
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

export function reviewCheckMeta(status: string) {
	if (status === 'success')
		return { label: '检查通过', tone: 'positive' as const }
	if (status === 'pending' || status === 'queued' || status === 'in_progress')
		return { label: '检查进行中', tone: 'warning' as const }
	if (status === 'failure' || status === 'failed' || status === 'error')
		return { label: '检查未通过', tone: 'danger' as const }
	return { label: '等待检查', tone: 'neutral' as const }
}

export function reviewDeploymentMeta(status: string | null | undefined) {
	if (status === 'success' || status === 'ready')
		return { label: '预览可用', tone: 'positive' as const }
	if (status === 'pending' || status === 'queued' || status === 'in_progress' || status === 'building')
		return { label: '正在生成预览', tone: 'warning' as const }
	if (status === 'failure' || status === 'failed' || status === 'error')
		return { label: '预览生成失败', tone: 'danger' as const }
	return { label: '等待预览', tone: 'neutral' as const }
}

export function reviewFileStatusLabel(status: string) {
	if (status === 'added')
		return '新增'
	if (status === 'removed' || status === 'deleted')
		return '删除'
	if (status === 'renamed')
		return '重命名'
	return '修改'
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
	if (status === 'closed')
		return { label: '已关闭', tone: 'neutral' as const }
	return { label: '处理中', tone: 'neutral' as const }
}

export interface AdminNavigationItem {
	label: string
	to: string
	icon: string
}

export const adminNavigation: AdminNavigationItem[] = [
	{ label: '概览', to: '/admin', icon: 'tabler:layout-dashboard' },
	{ label: '访问分析', to: '/admin/analytics', icon: 'tabler:chart-line' },
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

export const adminUnavailableSections: Record<string, { title: string, cycle: number, description: string }> = {}

export type AdminUnavailableSection = string

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

export type AdminPublishRunGroup = 'needs_action' | 'in_progress' | 'completed'

export function publishRunGroup(run: Pick<AdminPublishRunDto, 'status'>): AdminPublishRunGroup {
	if (['preview_ready', 'failed', 'conflict'].includes(run.status))
		return 'needs_action'
	if (['merged', 'published', 'closed'].includes(run.status))
		return 'completed'
	return 'in_progress'
}

export function canClosePublishRun(run: Pick<AdminPublishRunDto, 'status'>): boolean {
	return !['closed', 'merged', 'published'].includes(run.status)
}

export function publishNextAction(run: Pick<AdminPublishRunDto, 'kind' | 'status'>) {
	if (run.status === 'preview_ready')
		return '查看预览并确认上线'
	if (run.status === 'failed')
		return '查看失败原因'
	if (run.status === 'conflict')
		return '处理内容冲突'
	if (run.status === 'merged' || run.status === 'published')
		return run.kind === 'direct' ? '正式站点已部署' : '已经上线'
	if (run.status === 'closed')
		return '已关闭'
	return run.kind === 'direct'
		? '直接提交已完成，正在确认检查与正式部署'
		: '等待自动检查和预览'
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
