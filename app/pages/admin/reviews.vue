<script setup lang="ts">
import type {
	CheckSummaryDto,
	DeploymentDto,
	PullRequestDto,
	PullRequestFileDto,
} from '#shared/admin/publishing'
import type { AdminPublishRunDto } from '~/types/admin'
import { nextPublishRefreshDelay } from '#shared/admin/publishing-refresh'
import AdminReleaseChecklist from '~/components/admin/reviews/AdminReleaseChecklist.vue'
import AdminReleaseQueue from '~/components/admin/reviews/AdminReleaseQueue.vue'
import AdminReleaseTechnicalDetails from '~/components/admin/reviews/AdminReleaseTechnicalDetails.vue'
import { canClosePublishRun, publishNextAction, publishRunGroup, publishStatusMeta } from '~/types/admin'

interface PullRequestDetail {
	run: AdminPublishRunDto | null
	pullRequest: PullRequestDto
	files: PullRequestFileDto[]
	checks: CheckSummaryDto
	deployment: DeploymentDto | null
	canMerge: boolean
	reason?: string
}

const pageSize = 8
const runs = ref<AdminPublishRunDto[]>([])
const total = ref(0)
const loadedPageCount = ref(1)
const loading = ref(true)
const loadingMore = ref(false)
const detailLoading = ref(false)
const merging = ref(false)
const refreshingSelected = ref(false)
const closing = ref(false)
const mergeConfirmOpen = ref(false)
const closeConfirmOpen = ref(false)
const listError = ref<string | null>(null)
const detailError = ref<string | null>(null)
const mergeError = ref<string | null>(null)
const closeError = ref<string | null>(null)
const selected = ref<AdminPublishRunDto | null>(null)
const detail = ref<PullRequestDetail | null>(null)
const detailOwnerId = ref<string | null>(null)
const lastUpdatedAt = ref<string | null>(null)
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let refreshStartedAt = 0

const hasPendingRuns = computed(() => runs.value.some(run => publishRunGroup(run) === 'in_progress'))
const hasMore = computed(() => runs.value.length < total.value)
const visibleDetail = computed(() => detailOwnerId.value === selected.value?.id ? detail.value : null)
const selectedDirect = computed(() => selected.value?.kind === 'direct' ? selected.value : null)
const canCloseSelected = computed(() => selected.value ? canClosePublishRun(selected.value) : false)

function directStatusDescription(run: AdminPublishRunDto) {
	if (run.status === 'published') {
		return run.deploymentUrl
			? '该提交的自动检查与正式部署都已成功，不需要再手动合并。'
			: '这次提交没有产生内容差异，不需要重新部署，线上内容已经是最新版本。'
	}
	if (run.status === 'failed')
		return '自动检查或正式部署未通过。修复原因后重新提交内容即可。'
	if (run.status === 'conflict')
		return '提交时发现线上版本已变化，因此没有覆盖线上内容。'
	return '内容已经直接提交到 main，系统正在核对这个提交的自动检查和正式部署，完成后会自动更新为“已发布”。'
}
const taskStatus = computed(() => {
	if (loading.value)
		return '正在读取发布状态…'
	if (hasPendingRuns.value)
		return `${runs.value.filter(run => publishRunGroup(run) === 'in_progress').length} 项正在自动处理`
	if (runs.value.some(run => publishRunGroup(run) === 'needs_action'))
		return `${runs.value.filter(run => publishRunGroup(run) === 'needs_action').length} 项等待你处理`
	return `状态已更新 · ${lastUpdatedAt.value ? new Date(lastUpdatedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '刚刚'}`
})
const taskTone = computed(() => listError.value || mergeError.value || closeError.value ? 'danger' : runs.value.some(run => publishRunGroup(run) === 'needs_action') ? 'warning' : 'positive')

useSeoMeta({ title: '发布与审核', robots: 'noindex, nofollow' })

async function fetchRunPage(page: number) {
	return useAdminApi<{ items: AdminPublishRunDto[], total: number }>('/api/admin/publishing/runs', {
		query: { page, pageSize },
	})
}

function dedupeRuns(items: AdminPublishRunDto[]) {
	const seen = new Set<string>()
	return items.filter((run) => {
		if (seen.has(run.id))
			return false
		seen.add(run.id)
		return true
	})
}

async function load(silent = false) {
	if (!silent)
		loading.value = true
	listError.value = null
	try {
		const pages = await Promise.all(
			Array.from({ length: loadedPageCount.value }, (_, index) => fetchRunPage(index + 1)),
		)
		runs.value = dedupeRuns(pages.flatMap(page => page.items))
		total.value = pages[0]?.total ?? 0
		if (selected.value)
			selected.value = runs.value.find(run => run.id === selected.value?.id) ?? null
		lastUpdatedAt.value = new Date().toISOString()
	}
	catch (cause) {
		listError.value = cause instanceof Error ? cause.message : '发布记录加载失败'
	}
	finally {
		if (!silent)
			loading.value = false
	}
}

async function loadMore() {
	if (!hasMore.value || loadingMore.value)
		return
	loadingMore.value = true
	listError.value = null
	try {
		const nextPage = loadedPageCount.value + 1
		const result = await fetchRunPage(nextPage)
		runs.value = dedupeRuns([...runs.value, ...result.items])
		total.value = result.total
		loadedPageCount.value = nextPage
	}
	catch (cause) {
		listError.value = cause instanceof Error ? cause.message : '更多发布记录加载失败'
	}
	finally {
		loadingMore.value = false
	}
}

async function inspect(run: AdminPublishRunDto) {
	selected.value = run
	detailError.value = null
	mergeError.value = null
	closeError.value = null
	if (!run.pullNumber) {
		detailOwnerId.value = null
		return
	}
	detailLoading.value = true
	try {
		detail.value = await useAdminApi(`/api/admin/publishing/pull-requests/${run.pullNumber}`)
		detailOwnerId.value = run.id
	}
	catch (cause) {
		detailError.value = cause instanceof Error ? cause.message : '发布详情加载失败'
	}
	finally {
		detailLoading.value = false
	}
}

async function refreshStatus(silent = false) {
	await load(silent)
	if (selected.value?.pullNumber)
		await inspect(selected.value)
}

async function recheckSelected() {
	if (!selected.value || refreshingSelected.value)
		return
	refreshingSelected.value = true
	closeError.value = null
	try {
		await refreshStatus(true)
	}
	finally {
		refreshingSelected.value = false
	}
}

function requestClose() {
	if (canCloseSelected.value)
		closeConfirmOpen.value = true
}

async function closeSelected() {
	const current = selected.value
	if (!current || !canClosePublishRun(current) || closing.value)
		return
	closing.value = true
	closeError.value = null
	try {
		await useAdminApi(`/api/admin/publishing/runs/${current.id}/close`, { method: 'POST' })
		closeConfirmOpen.value = false
		await load()
		const next = runs.value.find(run => run.id !== current.id && publishRunGroup(run) === 'needs_action')
			?? runs.value.find(run => run.id !== current.id && publishRunGroup(run) === 'in_progress')
			?? runs.value.find(run => run.id === current.id)
			?? runs.value[0]
		if (next) {
			await inspect(next)
		}
		else {
			selected.value = null
			detail.value = null
			detailOwnerId.value = null
		}
	}
	catch (cause) {
		closeError.value = cause instanceof Error ? cause.message : '关闭任务失败，请稍后重试'
	}
	finally {
		closing.value = false
	}
}

function requestMerge() {
	if (visibleDetail.value?.canMerge)
		mergeConfirmOpen.value = true
}

async function merge() {
	const current = visibleDetail.value
	if (!current?.canMerge || !current.pullRequest.number || merging.value)
		return
	merging.value = true
	mergeError.value = null
	try {
		const result = await useAdminApi<{ merged: boolean, reason?: string }>(
			`/api/admin/publishing/pull-requests/${current.pullRequest.number}/merge`,
			{
				method: 'POST',
				body: { expectedHeadSha: current.pullRequest.headSha },
			},
		)
		mergeConfirmOpen.value = false
		if (!result.merged)
			mergeError.value = `暂时不能上线：${result.reason || '自动检查尚未通过'}`
		await refreshStatus()
	}
	catch (cause) {
		mergeError.value = cause instanceof Error ? cause.message : '上线失败，请稍后重试'
	}
	finally {
		merging.value = false
	}
}

function stopRefreshTimer() {
	if (refreshTimer)
		clearTimeout(refreshTimer)
	refreshTimer = undefined
}

function startRefreshTimer() {
	stopRefreshTimer()
	if (document.visibilityState !== 'visible')
		return
	refreshStartedAt = Date.now()
	const schedule = () => {
		refreshTimer = setTimeout(async () => {
			if (document.visibilityState !== 'visible' || !hasPendingRuns.value)
				return
			await refreshStatus(true)
			if (hasPendingRuns.value && document.visibilityState === 'visible')
				schedule()
		}, nextPublishRefreshDelay(Date.now() - refreshStartedAt))
	}
	schedule()
}

function handleVisibilityChange() {
	if (document.visibilityState === 'visible') {
		void refreshStatus(true)
		startRefreshTimer()
	}
	else {
		stopRefreshTimer()
	}
}

onMounted(async () => {
	await load()
	const first = runs.value.find(run => publishRunGroup(run) === 'needs_action') ?? runs.value[0]
	if (first)
		await inspect(first)
	document.addEventListener('visibilitychange', handleVisibilityChange)
	startRefreshTimer()
})

onBeforeUnmount(() => {
	stopRefreshTimer()
	document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
<section>
	<AdminTaskHeader
		eyebrow="安全发布"
		title="发布与审核"
		description="先看系统检查和预览结果，再决定是否上线。Git、分支和补丁等技术信息仍保留在高级详情中。"
		:status="taskStatus"
		:status-tone="taskTone"
	>
		<template #actions>
			<button class="admin-button" type="button" :disabled="loading" @click="refreshStatus()">
				<Icon name="tabler:refresh" />{{ loading ? '更新中…' : '立即更新' }}
			</button>
		</template>
	</AdminTaskHeader>

	<p v-if="listError" class="admin-error" role="alert">
		{{ listError }}
		<button class="admin-button" type="button" @click="load()">
			重新加载
		</button>
	</p>
	<p v-if="mergeError" class="admin-error" role="alert">
		{{ mergeError }}
	</p>
	<p v-if="closeError" class="admin-error" role="alert">
		{{ closeError }}
	</p>

	<div class="admin-release-workbench">
		<AdminReleaseQueue
			:runs="runs"
			:total="total"
			:selected-id="selected?.id ?? null"
			:loading="loading"
			:loading-more="loadingMore"
			:has-more="hasMore"
			@select="inspect"
			@load-more="loadMore"
		/>

		<aside class="admin-panel admin-release-detail">
			<header class="admin-panel-header">
				<div>
					<h2>审核详情</h2>
					<p>{{ selected?.resourcePath || (selected ? '这是一项直接发布记录' : '从左侧选择一项发布任务') }}</p>
				</div>
			</header>

			<div v-if="detailLoading" class="admin-skeleton admin-release-detail-skeleton" />
			<p v-if="detailError" class="admin-error" role="alert">
				{{ detailError }}
				<button v-if="selected" class="admin-button" type="button" @click="inspect(selected)">
					重试详情
				</button>
			</p>

			<div v-if="selected && canCloseSelected" class="admin-release-task-actions">
				<button class="admin-button" type="button" :disabled="refreshingSelected || closing" @click="recheckSelected">
					<Icon name="tabler:refresh" />{{ refreshingSelected ? '正在重新检查…' : '重新检查' }}
				</button>
				<button class="admin-button admin-button-danger" type="button" :disabled="closing" @click="requestClose">
					<Icon name="tabler:x" />{{ closing ? '正在关闭…' : '关闭任务' }}
				</button>
			</div>

			<section v-if="selectedDirect" class="admin-release-direct-status" aria-live="polite">
				<div class="admin-release-direct-heading">
					<div>
						<span>直接发布</span>
						<h3>{{ publishNextAction(selectedDirect) }}</h3>
					</div>
					<AdminStatusPill :tone="publishStatusMeta(selectedDirect.status).tone">
						{{ publishStatusMeta(selectedDirect.status).label }}
					</AdminStatusPill>
				</div>
				<p>{{ directStatusDescription(selectedDirect) }}</p>
				<p v-if="selectedDirect.errorMessage" class="admin-error" role="alert">
					{{ selectedDirect.errorMessage }}
				</p>
				<div class="admin-release-direct-meta">
					<div><span>内容</span><code>{{ selectedDirect.resourcePath || '直接发布内容' }}</code></div>
					<div><span>提交</span><code>{{ selectedDirect.commitSha?.slice(0, 12) || '等待提交' }}</code></div>
				</div>
				<a v-if="selectedDirect.deploymentUrl" class="admin-button" :href="selectedDirect.deploymentUrl" target="_blank" rel="noopener">
					<Icon name="tabler:external-link" />打开部署结果
				</a>
			</section>

			<template v-else-if="visibleDetail">
				<AdminReleaseChecklist
					:run="selected!"
					:checks="visibleDetail.checks"
					:deployment="visibleDetail.deployment"
					:can-merge="visibleDetail.canMerge"
					:reason="visibleDetail.reason"
				/>

				<div class="admin-release-primary-actions">
					<a v-if="visibleDetail.deployment?.url" class="admin-button" :href="visibleDetail.deployment.url" target="_blank" rel="noopener">
						<Icon name="tabler:external-link" />打开完整预览
					</a>
					<button v-if="visibleDetail.canMerge" class="admin-button admin-button-primary" type="button" :disabled="merging" @click="requestMerge">
						<Icon name="tabler:rocket" />{{ merging ? '正在上线…' : '确认上线' }}
					</button>
				</div>

				<AdminReleaseTechnicalDetails :run="visibleDetail.run" :pull-request="visibleDetail.pullRequest" :files="visibleDetail.files" />
			</template>
			<AdminEmptyState v-else-if="!detailLoading && !detailError" icon="tabler:git-pull-request" title="选择一项发布任务" description="查看自动检查、预览和是否可以上线。" />
		</aside>
	</div>

	<AdminConfirmDialog
		:open="closeConfirmOpen"
		title="关闭发布任务"
		:description="selected?.kind === 'pull_request'
			? '关闭后会同步关闭对应的 GitHub Pull Request，并把记录移入已完成。失败原因和技术信息仍会保留。'
			: '关闭后只停止后台跟踪并把记录移入已完成，不会撤销已经写入仓库或线上站点的内容。'"
		confirm-label="确认关闭"
		:busy="closing"
		danger
		@close="closeConfirmOpen = false"
		@confirm="closeSelected"
	/>

	<AdminConfirmDialog
		:open="mergeConfirmOpen"
		title="确认上线"
		:description="`发布任务 #${visibleDetail?.pullRequest.number ?? '—'} 的检查和预览已经通过。确认后，这次变更会进入正式站点。系统会在服务端再次校验当前版本。`"
		confirm-label="确认上线"
		:busy="merging"
		danger
		@close="mergeConfirmOpen = false"
		@confirm="merge"
	/>
</section>
</template>

<style scoped lang="scss">
.admin-release-workbench {
	display: grid;
	grid-template-columns: minmax(18rem, 0.36fr) minmax(0, 1fr);
	align-items: start;
	gap: 1rem;
}

.admin-release-detail {
	display: grid;
	gap: 1rem;
	min-width: 0;
	padding: 1rem;
}

.admin-release-detail-skeleton {
	min-height: 22rem;
}

.admin-release-primary-actions,
.admin-release-task-actions {
	display: flex;
	justify-content: flex-end;
	gap: 0.6rem;
}

.admin-release-direct-status {
	display: grid;
	gap: 1rem;
	padding: 1rem;
	border: 1px solid var(--admin-border);
	border-radius: 1rem;
	background: var(--admin-surface-soft);
}

.admin-release-direct-heading {
	display: flex;
	align-items: start;
	justify-content: space-between;
	gap: 1rem;
}

.admin-release-direct-heading span,
.admin-release-direct-meta span {
	display: block;
	font-size: 0.65rem;
	color: var(--admin-muted);
}

.admin-release-direct-heading h3 {
	margin: 0.25rem 0 0;
	font-size: 1rem;
}

.admin-release-direct-status > p {
	margin: 0;
	line-height: 1.7;
	color: var(--admin-muted);
}

.admin-release-direct-meta {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-release-direct-meta div {
	min-width: 0;
	padding: 0.75rem;
	border-radius: 0.75rem;
	background: var(--admin-surface);
}

.admin-release-direct-meta code {
	display: block;
	overflow: hidden;
	margin-top: 0.3rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-release-direct-status > .admin-button {
	justify-self: start;
}

@media (max-width: 980px) {
	.admin-release-workbench {
		grid-template-columns: 1fr;
	}
}

@media (max-width: 560px) {
	.admin-release-direct-meta {
		grid-template-columns: 1fr;
	}

	.admin-release-primary-actions,
	.admin-release-primary-actions .admin-button,
	.admin-release-task-actions,
	.admin-release-task-actions .admin-button {
		width: 100%;
	}

	.admin-release-primary-actions,
	.admin-release-task-actions {
		flex-direction: column;
	}
}
</style>
