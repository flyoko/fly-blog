<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'
import type { MusicImportFileResult } from '~/utils/music-import/types'
import { musicAudioAccept } from '~/utils/music-import/qmc-formats'
import { maxMusicBatchBytes, MusicImportError } from '~/utils/music-import/types'

interface UploadResult {
	ok: boolean
	name: string
	originalName?: string
	converted?: boolean
	media?: MediaObjectDto
	error?: { code: string, message: string }
}

interface PreparedUploadFile {
	originalName: string
	file: File
	converted: boolean
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
const keyFileInput = ref<HTMLInputElement | null>(null)
const keyFileStatus = ref<{ kind: 'success' | 'error', message: string } | null>(null)
const {
	activeFileName,
	cancel: cancelMusicImport,
	clearMediaKeys,
	keyCount,
	loadKeyFile,
	prepareFiles,
	progress: musicImportProgress,
	stage: musicImportStage,
} = useMusicImport()
const uploadAccept = computed(() => uploadPurpose.value === 'music'
	? musicAudioAccept
	: 'image/png,image/jpeg,image/webp,image/gif')
const uploadBusy = computed(() => uploading.value || musicImportStage.value !== 'idle')
const uploadActivityLabel = computed(() => {
	if (uploading.value)
		return '正在上传'
	if (musicImportStage.value === 'parsing')
		return '正在本地解析'
	if (musicImportStage.value === 'decrypting')
		return '正在本地解密'
	return ''
})
const activeMusicProgress = computed(() => activeFileName.value
	? musicImportProgress.value[activeFileName.value] ?? 0
	: 0)
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
	if (!uploadBusy.value)
		fileInput.value?.click()
}

function openKeyFilePicker() {
	if (!uploadBusy.value)
		keyFileInput.value?.click()
}

async function importKeyFile(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file)
		return
	keyFileStatus.value = null
	try {
		const count = await loadKeyFile(file)
		keyFileStatus.value = {
			kind: 'success',
			message: `已加载 ${count} 条本机媒体密钥，仅保留在当前浏览器标签页内存。`,
		}
	}
	catch (cause) {
		keyFileStatus.value = {
			kind: 'error',
			message: cause instanceof Error ? cause.message : '密钥文件导入失败。',
		}
	}
	finally {
		input.value = ''
	}
}

function removeMediaKeys() {
	clearMediaKeys()
	keyFileStatus.value = {
		kind: 'success',
		message: '已从当前页面内存移除本机密钥。',
	}
}

function musicClientFailures(results: MusicImportFileResult[]): UploadResult[] {
	return results
		.filter(result => !result.ok)
		.map(result => ({
			ok: false,
			name: result.originalName,
			originalName: result.originalName,
			error: result.error ?? { code: 'DECRYPT_FAILED', message: '本地处理失败。' },
		}))
}

async function prepareUploadFiles(files: File[]): Promise<{
	preparedFiles: PreparedUploadFile[]
	failures: UploadResult[]
}> {
	if (uploadPurpose.value !== 'music') {
		return {
			preparedFiles: files.map(file => ({ originalName: file.name, file, converted: false })),
			failures: [],
		}
	}
	const results = await prepareFiles(files)
	return {
		preparedFiles: results
			.filter(result => result.ok && result.prepared)
			.map(result => ({
				originalName: result.originalName,
				file: result.prepared!.file,
				converted: result.prepared!.converted,
			})),
		failures: musicClientFailures(results),
	}
}

async function upload(event: Event) {
	const input = event.target as HTMLInputElement
	const files = Array.from(input.files ?? [])
	if (!files.length)
		return
	error.value = null
	uploadResults.value = []
	try {
		const { preparedFiles, failures } = await prepareUploadFiles(files)
		const batchBytes = preparedFiles.reduce((totalBytes, prepared) => totalBytes + prepared.file.size, 0)
		if (uploadPurpose.value === 'music' && batchBytes > maxMusicBatchBytes) {
			uploadResults.value = [
				...failures,
				...preparedFiles.map(prepared => ({
					ok: false,
					name: prepared.file.name,
					originalName: prepared.originalName,
					error: { code: 'FILE_TOO_LARGE', message: '本次待上传音频总大小不能超过 100 MiB。' },
				})),
			]
			return
		}
		if (!preparedFiles.length) {
			uploadResults.value = failures
			return
		}

		uploading.value = true
		const form = new FormData()
		form.set('purpose', uploadPurpose.value)
		preparedFiles.forEach(prepared => form.append('files', prepared.file))
		const uploaded = await useAdminApi<UploadResult[]>('/api/admin/media', {
			method: 'POST',
			headers: { 'x-idempotency-key': `media-upload-${crypto.randomUUID()}` },
			body: form,
		})
		uploadResults.value = [
			...failures,
			...uploaded.map((result, index) => ({
				...result,
				originalName: preparedFiles[index]?.originalName ?? result.name,
				converted: preparedFiles[index]?.converted ?? false,
			})),
		]
		await load()
	}
	catch (cause) {
		if (cause instanceof MusicImportError && cause.code === 'CANCELLED')
			error.value = cause.message
		else
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
onBeforeUnmount(() => {
	cancelMusicImport()
	if (searchTimer)
		clearTimeout(searchTimer)
})
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
			<select v-model="uploadPurpose" aria-label="上传用途" :disabled="uploadBusy">
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
				:disabled="uploadBusy"
				@click="openFilePicker"
			>
				<Icon name="tabler:cloud-upload" />
				{{ uploadBusy ? `${uploadActivityLabel}…` : '上传媒体' }}
			</button>
			<input ref="fileInput" type="file" multiple :disabled="uploadBusy" :accept="uploadAccept" aria-label="选择要上传的媒体文件" @change="upload">
		</div>
	</header>

	<p v-if="uploadPurpose === 'music'" class="admin-music-legal-note">
		仅上传本人拥有、已获授权或可合法公开播放的音频。QMCv2 文件只在当前浏览器本地解密，原文件不会上传。
	</p>

	<div v-if="uploadPurpose === 'music'" class="admin-music-key-file">
		<div>
			<strong>MusicEx 本机密钥</strong>
			<span v-if="keyCount">已加载 {{ keyCount }} 条本机媒体密钥，仅保留在当前浏览器标签页内存。</span>
			<span v-else>尚未加载本机密钥。这里导入的是密钥数据库，不是 .mflac/.mgg 音乐文件；音乐文件请使用上方上传入口。支持 Mac/iOS 的 MMKVStreamEncryptId、filenameEkeyMap、.mmkv，或版本化 JSON 密钥包。可连续导入多份密钥数据库，密钥只会在当前页面内存中合并。</span>
		</div>
		<div class="admin-music-key-file-actions">
			<button class="admin-button" type="button" :disabled="uploadBusy" @click="openKeyFilePicker">
				<Icon name="tabler:key" />
				导入 QQ 音乐密钥数据库
			</button>
			<button v-if="keyCount" class="admin-button" type="button" :disabled="uploadBusy" @click="removeMediaKeys">
				移除本机密钥
			</button>
			<input
				ref="keyFileInput"
				class="admin-music-key-file-input"
				type="file"
				aria-label="选择 QQ 音乐 MMKV 或 JSON 密钥文件（不是音乐文件）"
				:disabled="uploadBusy"
				@change="importKeyFile"
			>
		</div>
	</div>
	<p
		v-if="keyFileStatus && uploadPurpose === 'music'"
		:class="keyFileStatus.kind === 'error' ? 'admin-error' : 'admin-success'"
		role="status"
		aria-live="polite"
	>
		{{ keyFileStatus.message }}
	</p>

	<div v-if="uploadBusy" class="admin-music-import-progress" role="status" aria-live="polite">
		<div>
			<strong>{{ uploadActivityLabel }}</strong>
			<span v-if="activeFileName">{{ activeFileName }}</span>
		</div>
		<progress v-if="musicImportStage === 'decrypting'" :value="activeMusicProgress" max="100">
			{{ activeMusicProgress }}%
		</progress>
		<button v-if="musicImportStage !== 'idle'" class="admin-button" type="button" @click="cancelMusicImport">
			取消本次处理
		</button>
	</div>

	<div v-if="uploadResults.length" class="admin-upload-results">
		<div v-if="successfulUploads.length" class="admin-success">
			<strong>已成功上传 {{ successfulUploads.length }} 个文件。</strong>
			<ul>
				<li v-for="result in successfulUploads" :key="`${result.originalName}-${result.name}`">
					{{ result.converted && result.originalName !== result.name ? `${result.originalName} → ${result.name}` : result.name }}
				</li>
			</ul>
		</div>
		<div v-if="failedUploads.length" class="admin-error">
			<strong>部分文件上传失败</strong>
			<ul>
				<li v-for="result in failedUploads" :key="result.name">
					{{ result.originalName ?? result.name }}：{{ result.error?.message }}
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
