<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'

interface UploadResult {
	ok: boolean
	name: string
	media?: MediaObjectDto
	error?: { code: string, message: string }
}

const items = ref<MediaObjectDto[]>([])
const total = ref(0)
const loading = ref(true)
const uploading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
const status = ref<'active' | 'trashed' | 'deleted'>('active')
const type = ref<'' | 'image' | 'audio'>('')
const uploadPurpose = ref<'article' | 'moment' | 'profile' | 'music'>('article')
const uploadResults = ref<UploadResult[]>([])
const fileInput = ref<HTMLInputElement | null>(null)
const pendingAction = ref<{
	kind: 'trash' | 'delete'
	media: MediaObjectDto
	confirmationToken?: string
	referenceCount?: number
} | null>(null)
const actionBusy = ref(false)
const statusTabs = [
	{ value: 'active', label: '使用中' },
	{ value: 'trashed', label: '回收站' },
	{ value: 'deleted', label: '已删除' },
] as const
let searchTimer: ReturnType<typeof setTimeout> | undefined

useSeoMeta({ title: '媒体库', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = null
	try {
		const result = await useAdminApi<{ items: MediaObjectDto[], total: number }>('/api/admin/media', {
			query: {
				page: 1,
				pageSize: 40,
				status: status.value,
				type: type.value || undefined,
				query: query.value || undefined,
			},
		})
		items.value = result.items
		total.value = result.total
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '媒体列表加载失败'
	}
	finally {
		loading.value = false
	}
}

function openFilePicker() {
	if (!uploading.value)
		fileInput.value?.click()
}

async function upload(event: Event) {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (!files.length)
		return
	uploading.value = true
	error.value = null
	uploadResults.value = []
	try {
		const form = new FormData()
		form.set('purpose', uploadPurpose.value)
		files.forEach(file => form.append('files', file))
		uploadResults.value = await useAdminApi<UploadResult[]>('/api/admin/media', {
			method: 'POST',
			headers: { 'x-idempotency-key': `media-upload-${crypto.randomUUID()}` },
			body: form,
		})
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '媒体上传失败'
	}
	finally {
		uploading.value = false
		input.value = ''
	}
}

function trash(media: MediaObjectDto) {
	pendingAction.value = { kind: 'trash', media }
}

async function restore(media: MediaObjectDto) {
	await perform(() => useAdminApi(`/api/admin/media/${media.id}/restore`, { method: 'POST' }))
}

function permanentDelete(media: MediaObjectDto) {
	pendingAction.value = { kind: 'delete', media }
}

async function confirmPendingAction() {
	const action = pendingAction.value
	if (!action)
		return
	actionBusy.value = true
	error.value = null
	try {
		if (action.kind === 'trash') {
			await useAdminApi(`/api/admin/media/${action.media.id}`, { method: 'DELETE' })
			pendingAction.value = null
			await load()
			return
		}

		await useAdminApi(`/api/admin/media/${action.media.id}/permanent`, {
			method: 'DELETE',
			headers: action.confirmationToken
				? { 'x-confirmation-token': action.confirmationToken }
				: undefined,
		})
		pendingAction.value = null
		await load()
	}
	catch (cause) {
		if (cause instanceof AdminApiError && cause.code === 'CONFLICT') {
			const details = cause.details as { confirmationToken?: string, referenceCount?: number } | undefined
			if (details?.confirmationToken) {
				pendingAction.value = {
					...action,
					confirmationToken: details.confirmationToken,
					referenceCount: details.referenceCount,
				}
				return
			}
		}
		error.value = cause instanceof Error ? cause.message : '媒体操作失败'
	}
	finally {
		actionBusy.value = false
	}
}

async function perform(operation: () => Promise<unknown>) {
	error.value = null
	try {
		await operation()
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '媒体操作失败'
	}
}

const confirmationTitle = computed(() => pendingAction.value?.kind === 'delete' ? '永久删除媒体' : '移入回收站')
const confirmationDescription = computed(() => {
	const action = pendingAction.value
	if (!action)
		return ''
	if (action.kind === 'trash')
		return `“${action.media.originalName}”将移入回收站，之后仍可恢复。`
	if (action.confirmationToken) {
		return `“${action.media.originalName}”仍被 ${action.referenceCount ?? 0} 处内容引用。继续操作会永久删除对象且无法恢复。`
	}
	return `“${action.media.originalName}”将被永久删除，此操作无法撤销。服务器会再次检查内容引用。`
})
const failedUploads = computed(() => uploadResults.value.filter(result => !result.ok))
const successfulUploads = computed(() => uploadResults.value.filter(result => result.ok))

watch([query, status, type], () => {
	if (searchTimer)
		clearTimeout(searchTimer)
	searchTimer = setTimeout(load, 250)
})

onMounted(load)
onBeforeUnmount(() => searchTimer && clearTimeout(searchTimer))
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">R2 媒体库</span>
			<h1>媒体库</h1>
			<p>管理文章图片、个人资料、音乐封面和音频文件。</p>
		</div>
		<div class="admin-media-upload">
			<select v-model="uploadPurpose" aria-label="上传用途">
				<option value="article">
					文章图片
				</option>
				<option value="moment">
					瞬间图片
				</option>
				<option value="profile">
					个人资料
				</option>
				<option value="music">
					音乐文件
				</option>
			</select>
			<button
				class="admin-button admin-button-primary"
				type="button"
				:disabled="uploading"
				@click="openFilePicker"
			>
				<Icon name="tabler:cloud-upload" />
				{{ uploading ? '上传中…' : '上传媒体' }}
			</button>
			<input ref="fileInput" type="file" multiple :disabled="uploading" accept="image/png,image/jpeg,image/webp,image/gif,audio/mpeg,audio/ogg,audio/wav" aria-label="选择要上传的媒体文件" @change="upload">
		</div>
	</header>

	<div v-if="uploadResults.length" class="admin-upload-results">
		<p v-if="successfulUploads.length" class="admin-success">
			已成功上传 {{ successfulUploads.length }} 个文件。
		</p>
		<div v-if="failedUploads.length" class="admin-error">
			<strong>部分文件上传失败</strong>
			<ul>
				<li v-for="result in failedUploads" :key="result.name">
					{{ result.name }}：{{ result.error?.message }}
				</li>
			</ul>
		</div>
	</div>

	<div class="admin-toolbar admin-toolbar-wrap">
		<div class="admin-tab-list" role="group" aria-label="媒体状态">
			<button v-for="item in statusTabs" :key="item.value" class="admin-tab" :class="{ 'is-active': status === item.value }" type="button" :aria-pressed="status === item.value" @click="status = item.value">
				{{ item.label }}
			</button>
		</div>
		<label class="admin-search-field admin-search-field-wide">
			<Icon name="tabler:search" />
			<input v-model="query" type="search" placeholder="搜索媒体文件">
		</label>
		<label class="admin-select-field">
			<span>类型</span>
			<select v-model="type">
				<option value="">全部类型</option>
				<option value="image">图片</option>
				<option value="audio">音频</option>
			</select>
		</label>
		<span class="admin-muted-copy">共 {{ total }} 项</span>
	</div>

	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<div v-if="loading" class="admin-media-grid">
		<div v-for="index in 8" :key="index" class="admin-skeleton admin-media-card-skeleton" />
	</div>
	<div v-else-if="items.length" class="admin-media-grid">
		<article v-for="media in items" :key="media.id" class="admin-media-library-card">
			<img v-if="media.kind === 'image'" :src="media.url" :alt="media.originalName" loading="lazy" decoding="async">
			<div v-else class="admin-media-card-audio">
				<Icon name="tabler:music" />
			</div>
			<div class="admin-media-library-body">
				<strong>{{ media.originalName }}</strong>
				<span>{{ media.mime }} · {{ Math.ceil(media.size / 1024) }} KB</span>
				<span>引用 {{ media.referenceCount }} 次</span>
			</div>
			<div class="admin-media-library-actions">
				<button v-if="media.status === 'active'" class="admin-button" type="button" @click="trash(media)">
					移入回收站
				</button>
				<button v-if="media.status === 'trashed'" class="admin-button" type="button" @click="restore(media)">
					恢复媒体
				</button>
				<button v-if="media.status === 'trashed'" class="admin-button admin-button-danger" type="button" @click="permanentDelete(media)">
					永久删除
				</button>
			</div>
		</article>
	</div>
	<AdminEmptyState v-else icon="tabler:photo-off" title="这里还没有媒体" description="上传文件，或切换状态和搜索条件。" />

	<AdminConfirmDialog
		:open="Boolean(pendingAction)"
		:title="confirmationTitle"
		:description="confirmationDescription"
		:confirm-label="pendingAction?.kind === 'delete' ? '永久删除' : '移入回收站'"
		:verification-text="pendingAction?.kind === 'delete' ? 'DELETE' : ''"
		:busy="actionBusy"
		:danger="pendingAction?.kind === 'delete'"
		@close="pendingAction = null"
		@confirm="confirmPendingAction"
	/>
</section>
</template>
