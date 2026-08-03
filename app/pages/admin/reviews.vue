<script setup lang="ts">
import type {
	CheckSummaryDto,
	DeploymentDto,
	PullRequestDto,
	PullRequestFileDto,
} from '#shared/admin/publishing'
import type { AdminPublishRunDto } from '~/types/admin'

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

useSeoMeta({ title: '发布与审核', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = null
	try {
		const result = await useAdminApi<{ items: AdminPublishRunDto[], total: number }>('/api/admin/publishing/runs', {
			query: { page: 1, pageSize: 30 },
		})
		runs.value = result.items
		total.value = result.total
		if (selected.value) {
			selected.value = runs.value.find(run => run.id === selected.value?.id) ?? null
		}
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '发布记录加载失败'
	}
	finally {
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

onMounted(load)
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">发布流水线</span>
			<h1>发布与审核</h1>
			<p>查看直接发布、配置 Pull Request、检查结果和预览部署。</p>
		</div>
		<button class="admin-button" type="button" @click="load">
			<Icon name="tabler:refresh" />
			刷新状态
		</button>
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
					<div><span>检查</span><strong>{{ detail.checks.status }}</strong></div>
					<div><span>预览</span><strong>{{ detail.deployment?.status || '缺失' }}</strong></div>
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
							<span>{{ file.status }} · <b>+{{ file.additions }}</b> / <i>-{{ file.deletions }}</i></span>
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
					检查与预览尚未通过，当前不能合并。{{ detail.reason ? `原因：${detail.reason}` : '' }}
				</p>
				<button v-else class="admin-button admin-button-primary admin-merge-button" type="button" :disabled="merging" @click="requestMerge">
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
		verification-text="MERGE"
		:busy="merging"
		danger
		@close="mergeConfirmOpen = false"
		@confirm="merge"
	/>
</section>
</template>
