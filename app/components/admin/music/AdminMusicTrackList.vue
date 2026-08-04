<script setup lang="ts">
import type { MusicTrack } from '#shared/admin/music'
import AdminEmptyState from '~/components/admin/AdminEmptyState.vue'
import AdminStatusPill from '~/components/admin/AdminStatusPill.vue'

type TrackFilter = 'all' | 'published' | 'draft'

const props = defineProps<{
	tracks: MusicTrack[]
	selectedId: string | null
	query: string
	filter: TrackFilter
	sortMode: boolean
}>()

const emit = defineEmits<{
	'update:query': [value: string]
	'update:filter': [value: TrackFilter]
	'update:sortMode': [value: boolean]
	'select': [id: string]
	'move': [id: string, direction: -1 | 1]
	'addBlank': []
	'addMedia': []
}>()

const normalizedQuery = computed(() => props.query.trim().toLocaleLowerCase('zh-CN'))
const filteredTracks = computed(() => props.tracks.filter((track) => {
	if (props.filter === 'published' && !track.enabled)
		return false
	if (props.filter === 'draft' && track.enabled)
		return false
	if (!normalizedQuery.value)
		return true
	return `${track.title} ${track.artist}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery.value)
}))
const canSort = computed(() => props.filter === 'all' && !normalizedQuery.value)

function durationLabel(seconds: number | null | undefined) {
	if (!seconds)
		return '--:--'
	const minutes = Math.floor(seconds / 60)
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}
</script>

<template>
<section class="admin-panel music-library-panel" aria-label="歌曲列表">
	<header class="music-library-header">
		<div>
			<h2>歌曲列表</h2>
			<p>{{ tracks.length }} 首歌曲 · {{ tracks.filter(track => track.enabled).length }} 首已公开</p>
		</div>
		<div class="music-library-actions">
			<button class="admin-icon-button" type="button" aria-label="添加空白歌曲" title="添加空白歌曲" @click="emit('addBlank')">
				<Icon name="tabler:plus" />
			</button>
			<button class="admin-icon-button" type="button" aria-label="从媒体库添加" title="从媒体库添加" @click="emit('addMedia')">
				<Icon name="tabler:library-plus" />
			</button>
		</div>
	</header>

	<label class="admin-search-field music-track-search">
		<Icon name="tabler:search" aria-hidden="true" />
		<input
			:value="query"
			type="search"
			placeholder="搜索歌曲或作者"
			@input="emit('update:query', ($event.target as HTMLInputElement).value)"
		>
	</label>

	<div class="music-track-filters" aria-label="歌曲状态筛选">
		<button v-for="option in ([['all', '全部'], ['published', '已公开'], ['draft', '草稿']] as const)" :key="option[0]" type="button" :class="{ 'is-active': filter === option[0] }" @click="emit('update:filter', option[0])">
			{{ option[1] }}
		</button>
	</div>

	<button
		class="admin-button music-sort-toggle"
		type="button"
		:disabled="!canSort"
		:title="canSort ? '调整公开播放顺序' : '清除搜索并选择全部状态后再排序'"
		@click="emit('update:sortMode', !sortMode)"
	>
		<Icon name="tabler:arrows-sort" />{{ sortMode ? '完成排序' : '调整顺序' }}
	</button>

	<div v-if="filteredTracks.length" class="music-track-compact-list">
		<article v-for="track in filteredTracks" :key="track.id" class="music-track-compact-item" :class="{ 'is-active': selectedId === track.id }">
			<button class="music-track-select" type="button" :aria-pressed="selectedId === track.id" @click="emit('select', track.id)">
				<span class="music-track-cover" aria-hidden="true">
					<img v-if="track.coverUrl" :src="track.coverUrl" alt="" width="44" height="44" loading="lazy" decoding="async">
					<Icon v-else name="tabler:music" />
				</span>
				<span class="music-track-select-copy">
					<strong>{{ track.title || '未命名歌曲' }}</strong>
					<small>{{ track.artist || '待补充作者' }} · {{ durationLabel(track.duration) }}</small>
				</span>
				<AdminStatusPill :tone="track.enabled ? 'positive' : 'neutral'">
					{{ track.enabled ? '已公开' : '草稿' }}
				</AdminStatusPill>
			</button>
			<div v-if="sortMode && canSort" class="music-track-sort-actions">
				<button class="admin-icon-button" type="button" :aria-label="`上移${track.title}`" :disabled="track.order === 0" @click="emit('move', track.id, -1)">
					<Icon name="tabler:arrow-up" />
				</button>
				<button class="admin-icon-button" type="button" :aria-label="`下移${track.title}`" :disabled="track.order === tracks.length - 1" @click="emit('move', track.id, 1)">
					<Icon name="tabler:arrow-down" />
				</button>
			</div>
		</article>
	</div>
	<div v-else-if="!tracks.length" class="music-library-empty-note">
		<span aria-hidden="true"><Icon name="tabler:music-plus" /></span>
		<div>
			<strong>还没有歌曲</strong>
			<small>使用上方添加按钮创建第一首，右侧会立即进入编辑。</small>
		</div>
	</div>
	<AdminEmptyState v-else icon="tabler:music-search" title="没有匹配的歌曲" description="调整搜索或状态筛选，即可继续编辑已有歌曲。" />
</section>
</template>

<style scoped lang="scss">
.music-library-panel {
	display: grid;
	align-content: start;
	gap: 0.8rem;
	min-width: 0;
	padding: 1rem;
}

.music-library-header,
.music-library-actions,
.music-track-select,
.music-track-sort-actions {
	display: flex;
	align-items: center;
}

.music-library-header {
	justify-content: space-between;
	gap: 0.75rem;
}

.music-library-header h2,
.music-library-header p {
	margin: 0;
}

.music-library-header h2 {
	font-size: 0.94rem;
}

.music-library-header p {
	margin-top: 0.22rem;
	font-size: 0.68rem;
	color: var(--admin-muted);
}

.music-library-actions,
.music-track-sort-actions {
	gap: 0.35rem;
}

.music-track-search {
	width: 100%;
}

.music-track-filters {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.25rem;
	padding: 0.25rem;
	border-radius: 0.75rem;
	background: var(--admin-surface-soft);
}

.music-track-filters button {
	min-height: 2.5rem;
	padding: 0 0.55rem;
	border: 0;
	border-radius: 0.55rem;
	background: transparent;
	font: inherit;
	font-size: 0.68rem;
	color: var(--admin-muted);
	cursor: pointer;
}

.music-track-filters button.is-active {
	box-shadow: 0 4px 14px rgb(17 57 59 / 6%);
	background: var(--admin-surface);
	font-weight: 600;
	color: var(--admin-accent-strong);
}

.music-sort-toggle {
	width: 100%;
}

.music-library-empty-note {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	min-height: 5rem;
	padding: 0.8rem;
	border: 1px dashed var(--admin-border);
	border-radius: 0.85rem;
	background: var(--admin-surface-soft);
}

.music-library-empty-note > span {
	display: grid;
	flex: none;
	place-items: center;
	width: 2.6rem;
	height: 2.6rem;
	border-radius: 0.75rem;
	background: var(--admin-accent-soft);
	font-size: 1.25rem;
	color: var(--admin-accent-strong);
}

.music-library-empty-note strong,
.music-library-empty-note small {
	display: block;
}

.music-library-empty-note strong {
	font-size: 0.76rem;
}

.music-library-empty-note small {
	margin-top: 0.2rem;
	font-size: 0.66rem;
	line-height: 1.5;
	color: var(--admin-muted);
}

.music-track-compact-list {
	display: grid;
	gap: 0.45rem;
}

.music-track-compact-item {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.35rem;
	border: 1px solid transparent;
	border-radius: 0.85rem;
}

.music-track-compact-item.is-active {
	border-color: color-mix(in srgb, var(--admin-accent) 35%, var(--admin-border));
	background: var(--admin-accent-soft);
}

.music-track-select {
	gap: 0.65rem;
	min-width: 0;
	min-height: 3.75rem;
	padding: 0.45rem;
	border: 0;
	background: transparent;
	font: inherit;
	text-align: left;
	color: inherit;
	cursor: pointer;
}

.music-track-cover {
	display: grid;
	flex: none;
	place-items: center;
	overflow: hidden;
	width: 2.75rem;
	height: 2.75rem;
	border-radius: 0.75rem;
	background: var(--admin-surface-soft);
	color: var(--admin-muted);
}

.music-track-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.music-track-select-copy {
	flex: 1;
	min-width: 0;
}

.music-track-select-copy strong,
.music-track-select-copy small {
	display: block;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.music-track-select-copy strong {
	font-size: 0.75rem;
}

.music-track-select-copy small {
	margin-top: 0.2rem;
	font-size: 0.65rem;
	color: var(--admin-muted);
}

.music-track-sort-actions {
	padding-right: 0.4rem;
}
</style>
