<script setup lang="ts">
import type {
	CheckSummaryDto,
	DeploymentDto,
	PullRequestDto,
	PullRequestFileDto,
} from '#shared/admin/publishing'
import type { AdminPublishRunDto } from '~/types/admin'
import { reviewCheckMeta, reviewDeploymentMeta, reviewFileStatusLabel } from '~/types/admin'

interface PullRequestDetail {
	run: AdminPublishRunDto | null
	pullRequest: PullRequestDto
	files: PullRequestFileDto[]
	checks: CheckSummaryDto
	deployment: DeploymentDto | null
	canMerge: boolean
	reason?: string
}

const runs = ref<AdminPublishRunDto[]>([])
const total = ref(0)
const loading = ref(true)
const detailLoading = ref(false)
const merging = ref(false)
const mergeConfirmOpen = ref(false)
const error = ref<string | null>(null)
const selected = ref<AdminPublishRunDto | null>(null)
const detail = ref<PullRequestDetail | null>(null)
const lastUpdatedAt = ref<string | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const checkMeta = computed(() => reviewCheckMeta(detail.value?.checks.status ?? ''))
const deploymentMeta = computed(() => reviewDeploymentMeta(detail.value?.deployment?.status))
const hasPendingRuns = computed(() => runs.value.some(run => ['checks_pending', 'queued', 'in_progress', 'pending'].includes(run.status)))
const updateLabel = computed(() => lastUpdatedAt.value
	? `最近更新 ${new Date(lastUpdatedAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
	: '正在读取最新状态')

useSeoMeta({ title: '发布与审核', robots: 'noindex, nofollow' })

async function load(silent = false) {
	if (!silent)
		loading.value = true
	error.value = null
	try {
		const result = await useAdminApi<{ items: AdminPublishRunDto[], total: number }>('/api/admin/publishing/runs', {
			query: { page: 1, pageSize: 30 },
		})
		runs.value = result.items
		total.value = result.total
		if (selected.value)
			selected.value = runs.value.find(run => run.id === selected.value?.id) ?? null
		lastUpdatedAt.value = new Date().toISOString()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '发布记录加载失败'
	}
	finally {
		if (!silent)
			loading.value = false
	}
}

async function inspect(run: AdminPublishRunDto) {
	selected.value = run
	detail.value = null
	if (!run.pullNumber)
		return
	detailLoading.value = true
	error.value = null
	try {
		detail.value = await useAdminApi(`/api/admin/publishing/pull-requests/${run.pullNumber}`)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : 'Pull Request 状态加载失败'
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

function requestMerge() {
	if (detail.value?.canMerge)
		mergeConfirmOpen.value = true
}

async function merge() {
	if (!detail.value?.canMerge || !detail.value.pullRequest.number)
		return
	merging.value = true
	error.value = null
	try {
		const result = await useAdminApi<{ merged: boolean, reason?: string }>(
			`/api/admin/publishing/pull-requests/${detail.value.pullRequest.number}/merge`,
			{
				method: 'POST',
				body: { expectedHeadSha: detail.value.pullRequest.headSha },
			},
		)
		mergeConfirmOpen.value = false
		if (!result.merged)
			error.value = `暂时无法合并：${result.reason || '检查未通过'}`
		await Promise.all([load(), inspect(selected.value!)])
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : 'Pull Request 合并失败'
	}
	finally {
		merging.value = false
	}
}

onMounted(() => {
	void load()
	refreshTimer = setInterval(() => {
		if (hasPendingRuns.value && document.visibilityState === 'visible')
			void refreshStatus(true)
	}, 15_000)
})

onBeforeUnmount(() => {
	if (refreshTimer)
		clearInterval(refreshTimer)
})
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">发布流水线</span>
			<h1>发布与审核</h1>
			<p>系统会自动跟进检查和预览，只有全部通过后才会允许合并。</p>
		</div>
		<div class="admin-review-heading-actions">
			<small>{{ updateLabel }}{{ hasPendingRuns ? ' · 自动跟进中' : '' }}</small>
			<button class="admin-button" type="button" :disabled="loading" @click="refreshStatus()">
				<Icon name="tabler:refresh" />
				{{ loading ? '正在更新…' : '立即更新' }}
			</button>
		</div>
	</header>

	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<div class="admin-review-layout">
		<section class="admin-panel">
			<header class="admin-panel-header">
				<div><h2>发布记录</h2><p>共 {{ total }} 项</p></div>
			</header>
			<div v-if="loading" class="admin-action-list">
				<div v-for="index in 6" :key="index" class="admin-skeleton admin-list-skeleton" />
			</div>
			<div v-else-if="runs.length" class="admin-publish-list">
				<button
					v-for="run in runs"
					:key="run.id"
					class="admin-publish-list-item"
					:class="{ 'is-active': selected?.id === run.id }"
					type="button"
					@click="inspect(run)"
				>
					<AdminPublishStatus :run="run" :show-actions="false" />
				</button>
			</div>
			<AdminEmptyState v-else icon="tabler:history-off" title="还没有发布记录" description="文章或配置发布后会显示在这里。" />
		</section>

		<aside class="admin-panel admin-review-detail">
			<header class="admin-panel-header">
				<div><h2>审核详情</h2><p>{{ selected?.resourcePath || '选择一条发布记录' }}</p></div>
			</header>
			<div v-if="detailLoading" class="admin-skeleton" />
			<template v-else-if="detail">
				<div class="admin-review-summary">
					<div><span>Pull Request</span><strong>#{{ detail.pullRequest.number }}</strong></div>
					<div><span>自动检查</span><strong class="admin-status-pill" :data-tone="checkMeta.tone">{{ checkMeta.label }}</strong></div>
					<div><span>预览站点</span><strong class="admin-status-pill" :data-tone="deploymentMeta.tone">{{ deploymentMeta.label }}</strong></div>
				</div>
				<div class="admin-review-meta">
					<div><span>目标分支</span><code>{{ detail.pullRequest.baseBranch }}</code></div>
					<div><span>Head SHA</span><code>{{ detail.pullRequest.headSha }}</code></div>
					<div><span>发布记录 Commit</span><code>{{ detail.run?.commitSha || '未关联' }}</code></div>
				</div>
				<section class="admin-review-files">
					<header>
						<div><strong>变更文件</strong><span>GitHub 返回的结构化补丁</span></div>
						<span class="admin-badge">{{ detail.files.length }} 个文件</span>
					</header>
					<article v-for="file in detail.files" :key="file.filename" class="admin-review-file">
						<div class="admin-review-file-header">
							<code>{{ file.filename }}</code>
							<span>{{ reviewFileStatusLabel(file.status) }} · <b>+{{ file.additions }}</b> / <i>-{{ file.deletions }}</i></span>
						</div>
						<pre v-if="file.patch">{{ file.patch }}</pre>
						<p v-else>
							该文件没有可显示的文本补丁，可能是二进制文件或补丁过大。
						</p>
					</article>
				</section>
				<div class="admin-review-links">
					<a class="admin-button" :href="detail.pullRequest.url" target="_blank" rel="noopener">打开 GitHub</a>
					<a v-if="detail.deployment?.url" class="admin-button" :href="detail.deployment.url" target="_blank" rel="noopener">打开预览</a>
				</div>
				<p v-if="!detail.canMerge" class="admin-review-blocked">
					<Icon name="tabler:shield-x" />
					<span><strong>还需要等待</strong>检查与预览尚未通过，当前不能合并。{{ detail.reason ? `原因：${detail.reason}` : '' }}</span>
				</p>
				<p v-else class="admin-review-ready">
					<Icon name="tabler:shield-check" />
					<span><strong>可以安全合并</strong>自动检查和预览都已通过，下一步会把这次变更发布到正式站点。</span>
				</p>
				<button v-if="detail.canMerge" class="admin-button admin-button-primary admin-merge-button" type="button" :disabled="merging" @click="requestMerge">
					<Icon name="tabler:git-merge" />
					{{ merging ? '正在合并…' : '确认合并' }}
				</button>
			</template>
			<AdminEmptyState v-else icon="tabler:git-pull-request" title="选择一条记录" description="选择左侧 Pull Request，查看检查、预览和合并状态。" />
		</aside>
	</div>

	<AdminConfirmDialog
		:open="mergeConfirmOpen"
		title="确认合并 Pull Request"
		:description="`Pull Request #${detail?.pullRequest.number ?? '—'} 将合并到生产分支。系统会在服务器端再次校验 Head SHA、检查与预览状态。`"
		confirm-label="确认合并"
		:busy="merging"
		danger
		@close="mergeConfirmOpen = false"
		@confirm="merge"
	/>
</section>
</template>
