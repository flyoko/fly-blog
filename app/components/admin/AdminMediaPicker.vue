<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'

const props = withDefaults(defineProps<{
	open: boolean
	kind?: 'image' | 'audio'
}>(), {
	kind: 'image',
})

const emit = defineEmits<{
	close: []
	select: [media: MediaObjectDto]
}>()

const items = ref<MediaObjectDto[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

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
	if (open)
		load()
})

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
				<NuxtLink class="admin-button" to="/admin/media" @click="emit('close')">
					上传媒体
				</NuxtLink>
			</form>

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
					<img v-if="media.kind === 'image'" :src="media.url" :alt="media.originalName">
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
