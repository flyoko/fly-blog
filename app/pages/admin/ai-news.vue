<script setup lang="ts">
import type { AdminFinanceFlashDto, AdminFinanceFlashListDto, FinanceAdminVisibility, FinanceFilter, FinanceSourceSettingDto } from '#shared/admin/finance'
import type { NewsItemDto } from '#shared/admin/news'
import { toAdminUserMessage } from '#shared/admin/feedback'
import AdminFinanceInbox from '~/components/admin/news/AdminFinanceInbox.vue'
import AdminNewsInbox from '~/components/admin/news/AdminNewsInbox.vue'
import AdminNewsManualForm from '~/components/admin/news/AdminNewsManualForm.vue'
import AdminNewsSourceHealth from '~/components/admin/news/AdminNewsSourceHealth.vue'

interface NewsSourceState {
	source_id: string
	status: string
	enabled?: boolean
	available?: boolean
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

interface FinanceAdminData {
	sources: NewsSourceState[]
	total: number
	updatedAt: string | null
	prototype: boolean
}

const tabs = [
	{ id: 'content', label: '内容管理', description: '筛选、检查和移除公开卡片', icon: 'tabler:news' },
	{ id: 'finance', label: '财经内容', description: '检查、隐藏和恢复 7×24 快讯', icon: 'tabler:chart-line' },
	{ id: 'manual', label: '手动精选', description: '添加一条自己的精选内容', icon: 'tabler:edit' },
	{ id: 'sources', label: '来源健康', description: '查看同步状态和失败原因', icon: 'tabler:heartbeat' },
]
const activeTab = ref('content')
const data = ref<NewsAdminData | null>(null)
const financeItems = ref<AdminFinanceFlashListDto | null>(null)
const financeSources = ref<FinanceSourceSettingDto[]>([])
const loading = ref(true)
const financeLoading = ref(true)
const financeSourcesLoading = ref(true)
const syncing = ref(false)
const adding = ref(false)
const deleting = ref(false)
const loadError = ref<string | null>(null)
const financeError = ref<string | null>(null)
const financeSourceError = ref<string | null>(null)
const syncError = ref<string | null>(null)
const manualError = ref<string | null>(null)
const deleteError = ref<string | null>(null)
const success = ref<string | null>(null)
const pendingDelete = ref<NewsItemDto | null>(null)
const candidateQuery = ref('')
const sourceFilter = ref('')
const financeQuery = ref('')
const financeCategory = ref<FinanceFilter>('all')
const financeVisibility = ref<FinanceAdminVisibility>('all')
const financeImportantOnly = ref(false)
const financeWorkingId = ref<string | null>(null)
const financeSourceWorkingId = ref<string | null>(null)
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
		: tab.id === 'finance'
			? financeItems.value?.visibleTotal ?? 0
			: tab.id === 'sources'
				? data.value?.sources.length ?? 0
				: undefined,
})))
const unhealthySources = computed(() => data.value?.sources.filter(source => (source.available === false && source.enabled !== false) || !['success', 'disabled'].includes(source.status)).length ?? 0)
const taskStatus = computed(() => {
	if (loading.value)
		return '正在加载 AI 阅闻…'
	if (syncing.value)
		return '正在同步全部来源，当前内容仍可查看'
	if (unhealthySources.value)
		return `${unhealthySources.value} 个来源需要处理`
	return `${data.value?.items.length ?? 0} 条 AI · ${financeItems.value?.visibleTotal ?? 0} 条财经 · 来源运行正常`
})
const taskTone = computed(() => loadError.value || financeError.value || financeSourceError.value || syncError.value ? 'danger' : unhealthySources.value ? 'warning' : 'positive')

useSeoMeta({ title: 'AI 阅闻管理', robots: 'noindex, nofollow' })

let financeRequestSerial = 0
let financeSearchTimer: ReturnType<typeof setTimeout> | null = null

async function load(background = false) {
	if (!background)
		loading.value = true
	loadError.value = null
	try {
		const [news, finance] = await Promise.all([
			useAdminApi<NewsAdminData>('/api/admin/news'),
			useAdminApi<FinanceAdminData>('/api/admin/finance'),
		])
		data.value = { ...news, sources: [...news.sources, ...finance.sources] }
	}
	catch (cause) {
		loadError.value = toAdminUserMessage(cause, 'AI 阅闻数据加载失败')
	}
	finally {
		if (!background)
			loading.value = false
	}
}

async function loadFinanceItems(background = false) {
	const requestSerial = ++financeRequestSerial
	if (!background)
		financeLoading.value = true
	financeError.value = null
	try {
		const result = await useAdminApi<AdminFinanceFlashListDto>('/api/admin/finance/items', {
			query: {
				q: financeQuery.value.trim() || undefined,
				category: financeCategory.value,
				visibility: financeVisibility.value,
				important: financeImportantOnly.value ? 'true' : undefined,
				limit: 100,
			},
		})
		if (requestSerial === financeRequestSerial)
			financeItems.value = result
	}
	catch (cause) {
		if (requestSerial === financeRequestSerial)
			financeError.value = toAdminUserMessage(cause, '财经内容加载失败')
	}
	finally {
		if (!background && requestSerial === financeRequestSerial)
			financeLoading.value = false
	}
}

async function loadFinanceSources(background = false) {
	if (!background) {
		financeSourcesLoading.value = true
		financeSourceError.value = null
	}
	try {
		financeSources.value = await useAdminApi<FinanceSourceSettingDto[]>('/api/admin/finance/sources')
	}
	catch (cause) {
		if (!background)
			financeSourceError.value = toAdminUserMessage(cause, '财经来源设置加载失败')
	}
	finally {
		if (!background)
			financeSourcesLoading.value = false
	}
}

async function toggleFinanceSource(source: FinanceSourceSettingDto) {
	if (financeSourceWorkingId.value)
		return
	financeSourceWorkingId.value = source.sourceId
	financeSourceError.value = null
	success.value = null
	try {
		const updated = await useAdminApi<FinanceSourceSettingDto>(`/api/admin/finance/sources/${encodeURIComponent(source.sourceId)}`, {
			method: 'PUT',
			body: { enabled: !source.enabled },
		})
		financeSources.value = financeSources.value.map(item => item.sourceId === updated.sourceId ? updated : item)
		success.value = updated.enabled
			? `已开启财经来源“${updated.sourceName}”，后续将恢复真实同步。`
			: `已关闭财经来源“${updated.sourceName}”，后续将停止真实同步，公开聚合已立即隐藏。`
		await Promise.all([loadFinanceItems(true), load(true)])
	}
	catch (cause) {
		const mutationError = toAdminUserMessage(cause, '财经来源设置更新失败')
		await Promise.all([loadFinanceSources(true), loadFinanceItems(true), load(true)])
		financeSourceError.value = mutationError
	}
	finally {
		financeSourceWorkingId.value = null
	}
}

async function sync() {
	if (syncing.value)
		return
	syncing.value = true
	syncError.value = null
	success.value = null
	try {
		await Promise.all([
			useAdminApi('/api/admin/news/sync', { method: 'POST' }),
			useAdminApi('/api/admin/finance/sync', { method: 'POST' }),
		])
		success.value = 'AI 与财经来源同步完成，内容列表已刷新。'
		await Promise.all([load(true), loadFinanceItems(true)])
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

async function setFinanceHidden(item: AdminFinanceFlashDto, hidden: boolean) {
	if (financeWorkingId.value)
		return
	financeWorkingId.value = item.id
	financeError.value = null
	success.value = null
	try {
		await useAdminApi(`/api/admin/finance/items/${encodeURIComponent(item.id)}/${hidden ? 'hide' : 'restore'}`, { method: 'POST' })
		success.value = hidden
			? `已隐藏财经快讯“${item.title}”，后续自动同步仍保持隐藏。`
			: `已恢复财经快讯“${item.title}”。`
		await loadFinanceItems(true)
	}
	catch (cause) {
		financeError.value = toAdminUserMessage(cause, hidden ? '财经快讯隐藏失败' : '财经快讯恢复失败')
	}
	finally {
		financeWorkingId.value = null
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

watch([financeCategory, financeVisibility, financeImportantOnly], () => loadFinanceItems())
watch(financeQuery, () => {
	if (financeSearchTimer)
		clearTimeout(financeSearchTimer)
	financeSearchTimer = setTimeout(loadFinanceItems, 250)
})

onMounted(() => Promise.all([load(), loadFinanceItems(), loadFinanceSources()]))
onBeforeUnmount(() => {
	if (financeSearchTimer)
		clearTimeout(financeSearchTimer)
})
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
	<p v-if="financeError" class="admin-error" role="alert">
		财经内容：{{ financeError }}
		<button class="admin-button" type="button" @click="loadFinanceItems()">
			重新加载
		</button>
	</p>
	<p v-if="financeSourceError" class="admin-error" role="alert">
		财经来源：{{ financeSourceError }}
		<button class="admin-button" type="button" @click="loadFinanceSources()">
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
	<AdminFinanceInbox
		v-else-if="activeTab === 'finance'"
		:items="financeItems?.items ?? []"
		:total="financeItems?.total ?? 0"
		:visible-total="financeItems?.visibleTotal ?? 0"
		:hidden-total="financeItems?.hiddenTotal ?? 0"
		:loading="financeLoading"
		:query="financeQuery"
		:category="financeCategory"
		:visibility="financeVisibility"
		:important-only="financeImportantOnly"
		:working-id="financeWorkingId"
		:sources="financeSources"
		:source-loading="financeSourcesLoading"
		:source-working-id="financeSourceWorkingId"
		@update:query="financeQuery = $event"
		@update:category="financeCategory = $event"
		@update:visibility="financeVisibility = $event"
		@update:important-only="financeImportantOnly = $event"
		@hide="setFinanceHidden($event, true)"
		@restore="setFinanceHidden($event, false)"
		@toggle-source="toggleFinanceSource"
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
