<script setup lang="ts">
import type { NewsItemDto } from '#shared/admin/news'
import { toAdminUserMessage } from '#shared/admin/feedback'
import AdminNewsInbox from '~/components/admin/news/AdminNewsInbox.vue'
import AdminNewsManualForm from '~/components/admin/news/AdminNewsManualForm.vue'
import AdminNewsSourceHealth from '~/components/admin/news/AdminNewsSourceHealth.vue'

interface NewsSourceState {
	source_id: string
	status: string
	item_count: number
	last_success_at: string | null
	last_error: string | null
}

interface NewsAdminData {
	items: NewsItemDto[]
	total: number
	briefing: Record<string, unknown> | null
	sources: NewsSourceState[]
}

const tabs = [
	{ id: 'content', label: '内容管理', description: '筛选、检查和移除公开卡片', icon: 'tabler:news' },
	{ id: 'manual', label: '手动精选', description: '添加一条自己的精选内容', icon: 'tabler:edit' },
	{ id: 'sources', label: '来源健康', description: '查看同步状态和失败原因', icon: 'tabler:heartbeat' },
]
const activeTab = ref('content')
const data = ref<NewsAdminData | null>(null)
const loading = ref(true)
const syncing = ref(false)
const adding = ref(false)
const deleting = ref(false)
const loadError = ref<string | null>(null)
const syncError = ref<string | null>(null)
const manualError = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const success = ref<string | null>(null)
const pendingDelete = ref<NewsItemDto | null>(null)
const candidateQuery = ref('')
const sourceFilter = ref('')
const form = reactive({
	title: '',
	summary: '',
	url: '',
	category: '手动精选',
})
const tabItems = computed(() => tabs.map(tab => ({
	...tab,
	count: tab.id === 'content'
		? data.value?.items.length ?? 0
		: tab.id === 'sources'
			? data.value?.sources.length ?? 0
			: undefined,
})))
const unhealthySources = computed(() => data.value?.sources.filter(source => source.status !== 'success').length ?? 0)
const taskStatus = computed(() => {
	if (loading.value)
		return '正在加载 AI 阅闻…'
	if (syncing.value)
		return '正在同步全部来源，当前内容仍可查看'
	if (unhealthySources.value)
		return `${unhealthySources.value} 个来源需要处理`
	return `${data.value?.items.length ?? 0} 条内容 · 来源运行正常`
})
const taskTone = computed(() => loadError.value || syncError.value ? 'danger' : unhealthySources.value ? 'warning' : 'positive')

useSeoMeta({ title: 'AI 阅闻管理', robots: 'noindex, nofollow' })

async function load(background = false) {
	if (!background)
		loading.value = true
	loadError.value = null
	try {
		data.value = await useAdminApi<NewsAdminData>('/api/admin/news')
	}
	catch (cause) {
		loadError.value = toAdminUserMessage(cause, 'AI 阅闻数据加载失败')
	}
	finally {
		if (!background)
			loading.value = false
	}
}

async function sync() {
	if (syncing.value)
		return
	syncing.value = true
	syncError.value = null
	success.value = null
	try {
		await useAdminApi('/api/admin/news/sync', { method: 'POST' })
		success.value = '来源同步完成，内容列表已刷新。'
		await load(true)
	}
	catch (cause) {
		syncError.value = toAdminUserMessage(cause, '同步失败，已保留上次成功快照。')
	}
	finally {
		syncing.value = false
	}
}

function requestDelete(item: NewsItemDto) {
	pendingDelete.value = item
	deleteError.value = null
}

async function confirmDelete() {
	const item = pendingDelete.value
	if (!item || deleting.value)
		return
	deleting.value = true
	deleteError.value = null
	success.value = null
	try {
		await useAdminApi<void>('/api/admin/news/items', {
			method: 'DELETE',
			body: { id: item.id },
		})
		pendingDelete.value = null
		success.value = item.kind === 'manual'
			? `已永久删除手动精选“${item.title}”。`
			: `已移除“${item.title}”，后续自动同步不会重新展示。`
		await load(true)
	}
	catch (cause) {
		deleteError.value = toAdminUserMessage(cause, 'AI 阅闻条目删除失败')
	}
	finally {
		deleting.value = false
	}
}

async function addManual() {
	if (adding.value || !form.title.trim() || !form.url.trim())
		return
	adding.value = true
	manualError.value = null
	success.value = null
	try {
		await useAdminApi('/api/admin/news/manual', {
			method: 'POST',
			body: { ...form, idempotencyKey: `news-manual-${crypto.randomUUID()}` },
		})
		Object.assign(form, {
			title: '',
			summary: '',
			url: '',
			category: '手动精选',
		})
		success.value = '手动精选已添加到内容列表。'
		await load(true)
		activeTab.value = 'content'
	}
	catch (cause) {
		manualError.value = toAdminUserMessage(cause, '手动精选保存失败')
	}
	finally {
		adding.value = false
	}
}

onMounted(load)
</script>

<template>
<section>
	<AdminTaskHeader
		eyebrow="内容聚合"
		title="AI 阅闻"
		description="分别管理公开内容、手动精选和来源健康。同步失败时继续使用最后成功快照，不会影响访客阅读。"
		:status="taskStatus"
		:status-tone="taskTone"
	>
		<template #actions>
			<a class="admin-button" href="/ai.news" target="_blank" rel="noopener">
				<Icon name="tabler:external-link" />查看公开页面
			</a>
			<button class="admin-button admin-button-primary" type="button" :disabled="syncing" @click="sync">
				<Icon name="tabler:refresh" />{{ syncing ? '同步中…' : '立即同步' }}
			</button>
		</template>
	</AdminTaskHeader>

	<p v-if="loadError" class="admin-error" role="alert">
		{{ loadError }}
		<button class="admin-button" type="button" @click="load()">
			重新加载
		</button>
	</p>
	<p v-if="syncError" class="admin-error" role="alert">
		同步失败：{{ syncError }}
	</p>
	<p v-if="deleteError" class="admin-error" role="alert">
		删除失败：{{ deleteError }}
	</p>
	<p v-if="success" class="admin-success">
		{{ success }}
	</p>

	<AdminSectionTabs v-model="activeTab" :tabs="tabItems" label="AI 阅闻任务分区" />

	<AdminNewsInbox
		v-if="activeTab === 'content'"
		:items="data?.items ?? []"
		:loading="loading"
		:query="candidateQuery"
		:source-filter="sourceFilter"
		:deleting="deleting"
		@update:query="candidateQuery = $event"
		@update:source-filter="sourceFilter = $event"
		@delete="requestDelete"
	/>
	<AdminNewsManualForm
		v-else-if="activeTab === 'manual'"
		v-model="form"
		:adding="adding"
		:error="manualError"
		@submit="addManual"
	/>
	<AdminNewsSourceHealth
		v-else
		:sources="data?.sources ?? []"
		:loading="loading"
		:error="syncError"
		@sync="sync"
	/>

	<AdminConfirmDialog
		:open="Boolean(pendingDelete)"
		title="删除 AI 阅闻条目"
		:description="pendingDelete ? (pendingDelete.kind === 'manual' ? `“${pendingDelete.title}”将从公开列表中永久删除。` : `“${pendingDelete.title}”将从公开列表中移除，并加入排除记录，自动同步不会再次展示它。`) : ''"
		confirm-label="删除条目"
		:busy="deleting"
		danger
		@close="pendingDelete = null"
		@confirm="confirmDelete"
	/>
</section>
</template>
