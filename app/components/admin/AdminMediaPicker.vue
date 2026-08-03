<script setup lang="ts">
import type { MediaObjectDto, MediaUploadPurpose } from '#shared/admin/media'

interface UploadResult {
	ok: boolean
	name: string
	media?: MediaObjectDto
	error?: { code: string, message: string }
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
const uploadPurpose = computed<MediaUploadPurpose>(() => props.uploadPurpose ?? (props.kind === 'audio' ? 'music' : 'article'))
const accept = computed(() => props.kind === 'audio'
	? 'audio/mpeg,audio/ogg,audio/wav'
	: 'image/png,image/jpeg,image/webp,image/gif')
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
		error.value = cause instanceof Error ? cause.message : '媒体加载失败'
	}
	finally {
		loading.value = false
	}
}

watch(() => props.open, (open) => {
	if (open) {
		uploadResults.value = []
		load()
	}
})

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

function choose(media: MediaObjectDto) {
	emit('select', media)
	emit('close')
}
</script>

<template>
<Teleport to="body">
	<div v-if="open" class="admin-modal" role="dialog" aria-modal="true" aria-label="选择媒体">
		<button class="admin-modal-backdrop" type="button" aria-label="关闭媒体选择器" @click="emit('close')" />
		<section class="admin-modal-panel">
			<header class="admin-modal-header">
				<div>
					<span class="admin-badge">R2 媒体库</span>
					<h2>选择{{ kind === 'image' ? '图片' : '音频' }}</h2>
				</div>
				<button class="admin-icon-button" type="button" aria-label="关闭" @click="emit('close')">
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
				<button class="admin-button admin-button-primary" type="button" :disabled="uploading" @click="openFilePicker">
					<Icon name="tabler:cloud-upload" />
					{{ uploading ? '上传中…' : `上传${kind === 'image' ? '图片' : '音频'}` }}
				</button>
				<input
					ref="fileInput"
					class="admin-media-picker-file"
					type="file"
					multiple
					:accept="accept"
					:disabled="uploading"
					@change="upload"
				>
				<NuxtLink class="admin-button" to="/admin/media" @click="emit('close')">
					管理媒体
				</NuxtLink>
			</form>

			<div v-if="uploadResults.length" class="admin-upload-results">
				<p v-if="successfulUploads.length" class="admin-success">
					已上传 {{ successfulUploads.length }} 个文件，可从下方选择。
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
				description="先上传图片，再回到编辑器插入正文。"
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
