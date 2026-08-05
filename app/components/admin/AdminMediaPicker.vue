<script setup lang="ts">
import type { MediaObjectDto, MediaUploadPurpose } from '#shared/admin/media'
import type { MusicImportFileResult } from '~/utils/music-import/types'
import { toAdminUserMessage } from '#shared/admin/feedback'
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

const props = withDefaults(defineProps<{
	open: boolean
	kind?: 'image' | 'audio'
	uploadPurpose?: MediaUploadPurpose
}>(), {
	kind: 'image',
})

const emit = defineEmits<{
	close: []
	select: [media: MediaObjectDto]
}>()

const items = ref<MediaObjectDto[]>([])
const loading = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)
const query = ref('')
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
const uploadPurpose = computed<MediaUploadPurpose>(() => props.uploadPurpose ?? (props.kind === 'audio' ? 'music' : 'article'))
const accept = computed(() => props.kind === 'audio'
	? musicAudioAccept
	: 'image/png,image/jpeg,image/webp,image/gif')
const busy = computed(() => uploading.value || musicImportStage.value !== 'idle')
const activityLabel = computed(() => {
	if (uploading.value)
		return '正在上传'
	if (musicImportStage.value === 'parsing')
		return '正在本地解析'
	if (musicImportStage.value === 'decrypting')
		return '正在本地解密'
	return ''
})
const activeProgress = computed(() => activeFileName.value
	? musicImportProgress.value[activeFileName.value] ?? 0
	: 0)
const successfulUploads = computed(() => uploadResults.value.filter(result => result.ok))
const failedUploads = computed(() => uploadResults.value.filter(result => !result.ok))

async function load() {
	loading.value = true
	error.value = null
	try {
		const result = await useAdminApi('/api/admin/media', {
			query: {
				page: 1,
				pageSize: 40,
				type: props.kind,
				status: 'active',
				query: query.value || undefined,
			},
		}) as { items: MediaObjectDto[], total: number }
		items.value = result.items
	}
	catch (cause) {
		error.value = toAdminUserMessage(cause, '媒体加载失败')
	}
	finally {
		loading.value = false
	}
}

watch(() => props.open, (open) => {
	if (open) {
		uploadResults.value = []
		void load()
	}
	else {
		cancelMusicImport()
		keyFileStatus.value = null
	}
})

function closePicker() {
	cancelMusicImport()
	keyFileStatus.value = null
	emit('close')
}

function openFilePicker() {
	if (!busy.value)
		fileInput.value?.click()
}

function openKeyFilePicker() {
	if (!busy.value)
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
			message: toAdminUserMessage(cause, '密钥文件导入失败。'),
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
		message: '已从当前浏览器标签页内存移除本机密钥。',
	}
}

function clientFailures(results: MusicImportFileResult[]): UploadResult[] {
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
	if (props.kind !== 'audio') {
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
		failures: clientFailures(results),
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
		const batchBytes = preparedFiles.reduce((total, prepared) => total + prepared.file.size, 0)
		if (props.kind === 'audio' && batchBytes > maxMusicBatchBytes) {
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
			error.value = toAdminUserMessage(cause, '媒体上传失败')
	}
	finally {
		uploading.value = false
		input.value = ''
	}
}

function choose(media: MediaObjectDto) {
	emit('select', media)
	closePicker()
}
</script>

<template>
<Teleport to="body">
	<div v-if="open" class="admin-modal" role="dialog" aria-modal="true" aria-label="选择媒体">
		<button class="admin-modal-backdrop" type="button" aria-label="关闭媒体选择器" @click="closePicker" />
		<section class="admin-modal-panel">
			<header class="admin-modal-header">
				<div>
					<span class="admin-badge">R2 媒体库</span>
					<h2>选择{{ kind === 'image' ? '图片' : '音频' }}</h2>
				</div>
				<button class="admin-icon-button" type="button" aria-label="关闭" @click="closePicker">
					<Icon name="tabler:x" />
				</button>
			</header>

			<form class="admin-toolbar" @submit.prevent="load">
				<label class="admin-search-field">
					<Icon name="tabler:search" />
					<input v-model="query" type="search" placeholder="搜索文件名">
				</label>
				<button class="admin-button" type="submit">
					搜索
				</button>
				<button class="admin-button admin-button-primary" type="button" :disabled="busy" @click="openFilePicker">
					<Icon name="tabler:cloud-upload" />
					{{ busy ? `${activityLabel}…` : `上传${kind === 'image' ? '图片' : '音频'}` }}
				</button>
				<input
					ref="fileInput"
					class="admin-media-picker-file"
					type="file"
					multiple
					:accept="accept"
					:disabled="busy"
					@change="upload"
				>
				<NuxtLink class="admin-button" to="/admin/media" @click="closePicker">
					管理媒体
				</NuxtLink>
			</form>

			<p v-if="kind === 'audio'" class="admin-music-legal-note">
				仅上传本人拥有、已获授权或可合法公开播放的音频。QMCv2 文件只在当前浏览器本地解密，原文件不会上传。
			</p>

			<details v-if="kind === 'audio'" class="admin-music-key-file">
				<summary>MusicEx 加密文件兼容（高级）</summary>
				<div class="admin-music-key-file-content">
					<div>
						<strong>只有已经持有兼容密钥数据库时才需要这里</strong>
						<span v-if="keyCount">已加载 {{ keyCount }} 条本机媒体密钥，仅保留在当前浏览器标签页内存。</span>
						<span v-else>普通 MP3、FLAC、OGG、WAV、M4A 不需要密钥。如果你不知道密钥数据库是什么，不需要查找或操作这里。仅兼容旧版 QQ 音乐明文 MMKV、iOS filenameEkeyMap 或 JSON 密钥包；新版 QQ 音乐 Mac 可能生成空或加密数据库，当前浏览器无法读取。</span>
					</div>
					<div class="admin-music-key-file-actions">
						<button class="admin-button" type="button" :disabled="busy" @click="openKeyFilePicker">
							<Icon name="tabler:key" />
							导入兼容密钥数据库
						</button>
						<button v-if="keyCount" class="admin-button" type="button" :disabled="busy" @click="removeMediaKeys">
							移除本机密钥
						</button>
						<input
							ref="keyFileInput"
							class="admin-music-key-file-input"
							type="file"
							aria-label="选择旧版 QQ 音乐 MMKV、iOS filenameEkeyMap 或 JSON 密钥包"
							:disabled="busy"
							@change="importKeyFile"
						>
					</div>
				</div>
			</details>
			<p
				v-if="kind === 'audio' && keyFileStatus"
				:class="keyFileStatus.kind === 'error' ? 'admin-error' : 'admin-success'"
				role="status"
				aria-live="polite"
			>
				{{ keyFileStatus.message }}
			</p>

			<div v-if="busy" class="admin-music-import-progress" role="status" aria-live="polite">
				<div>
					<strong>{{ activityLabel }}</strong>
					<span v-if="activeFileName">{{ activeFileName }}</span>
				</div>
				<progress v-if="musicImportStage === 'decrypting'" :value="activeProgress" max="100">
					{{ activeProgress }}%
				</progress>
				<button v-if="musicImportStage !== 'idle'" class="admin-button" type="button" @click="cancelMusicImport">
					取消本次处理
				</button>
			</div>

			<div v-if="uploadResults.length" class="admin-upload-results">
				<div v-if="successfulUploads.length" class="admin-success">
					<strong>已上传 {{ successfulUploads.length }} 个文件，可从下方选择。</strong>
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
							{{ result.originalName ?? result.name }}：{{ toAdminUserMessage(result.error, '这个文件没有处理成功。') }}
						</li>
					</ul>
				</div>
			</div>

			<p v-if="error" class="admin-error">
				{{ error }}
			</p>
			<div v-if="loading" class="admin-media-grid">
				<div v-for="index in 8" :key="index" class="admin-skeleton admin-media-card-skeleton" />
			</div>
			<div v-else-if="items.length" class="admin-media-grid">
				<button
					v-for="media in items"
					:key="media.id"
					class="admin-media-card"
					type="button"
					@click="choose(media)"
				>
					<img v-if="media.kind === 'image'" :src="media.url" :alt="media.originalName" loading="lazy" decoding="async">
					<div v-else class="admin-media-card-audio">
						<Icon name="tabler:music" />
					</div>
					<span>{{ media.originalName }}</span>
				</button>
			</div>
			<AdminEmptyState
				v-else
				icon="tabler:photo-off"
				title="还没有可用媒体"
				:description="kind === 'audio' ? '上传合法音频，再回到歌单编辑器选择。' : '先上传图片，再回到编辑器插入正文。'"
			/>
		</section>
	</div>
</Teleport>
</template>

<style scoped lang="scss">
.admin-media-picker-file {
	display: none;
}
</style>
