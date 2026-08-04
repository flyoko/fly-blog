<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'
import type { MusicPlaylist, MusicTrack } from '#shared/admin/music'
import playlistFallback from '~~/content/playlists/default.json'
import { musicPlaylistSchema } from '#shared/admin/music'
import AdminMusicTrackEditor from '~/components/admin/music/AdminMusicTrackEditor.vue'
import AdminMusicTrackList from '~/components/admin/music/AdminMusicTrackList.vue'

interface PlaylistResponse {
	playlist: MusicPlaylist
	sha: string
}

interface PublishResponse {
	publishRunId: string
	commitSha: string
}

type TrackFilter = 'all' | 'published' | 'draft'
type PickerTarget = { kind: 'field', trackId: string, field: 'audioUrl' | 'coverUrl' } | { kind: 'new-audio' } | null

const playlist = ref<MusicPlaylist>(musicPlaylistSchema.parse(structuredClone(playlistFallback) as unknown))
const sha = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<PublishResponse | null>(null)
const pickerTarget = ref<PickerTarget>(null)
const pendingDelete = ref<MusicTrack | null>(null)
const selectedTrackId = ref<string | null>(null)
const query = ref('')
const filter = ref<TrackFilter>('all')
const sortMode = ref(false)
const savedFingerprint = ref('')
const hasChanges = computed(() => Boolean(savedFingerprint.value) && savedFingerprint.value !== JSON.stringify(playlist.value))
const pickerKind = computed(() => pickerTarget.value?.kind === 'field' && pickerTarget.value.field === 'coverUrl' ? 'image' : 'audio')
const selectedTrack = computed(() => playlist.value.tracks.find(track => track.id === selectedTrackId.value) ?? null)
const selectedTrackModel = computed({
	get: () => selectedTrack.value as MusicTrack,
	set: (value: MusicTrack) => {
		const index = playlist.value.tracks.findIndex(track => track.id === value.id)
		if (index >= 0)
			playlist.value.tracks[index] = value
	},
})
const taskStatus = computed(() => {
	if (loading.value)
		return '正在加载歌单…'
	if (saving.value)
		return '正在保存整个歌单…'
	if (hasChanges.value)
		return '存在未保存的歌单改动'
	return `已保存 · ${playlist.value.tracks.length} 首歌曲`
})
const taskTone = computed(() => error.value ? 'danger' : hasChanges.value ? 'warning' : 'positive')

useSeoMeta({ title: '随心听', robots: 'noindex, nofollow' })
useAdminUnsavedChanges(hasChanges)

function normalizeTracks() {
	playlist.value.tracks.forEach((track, index) => {
		track.order = index
	})
}

function ensureSelection(preferredId?: string | null) {
	const preferred = preferredId && playlist.value.tracks.some(track => track.id === preferredId)
		? preferredId
		: playlist.value.tracks[0]?.id ?? null
	selectedTrackId.value = preferred
}

async function load() {
	loading.value = true
	error.value = null
	try {
		const result = await useAdminApi<PlaylistResponse>('/api/admin/music/playlist')
		playlist.value = musicPlaylistSchema.parse(result.playlist)
		playlist.value.tracks = playlist.value.tracks.toSorted((left, right) => left.order - right.order)
		sha.value = result.sha
		savedFingerprint.value = JSON.stringify(playlist.value)
		ensureSelection(selectedTrackId.value)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '歌单加载失败'
	}
	finally {
		loading.value = false
	}
}

function trackTitleFromMedia(media: MediaObjectDto) {
	return media.originalName.replace(/\.[^.]+$/u, '') || '新歌曲'
}

function createTrack(media?: MediaObjectDto): MusicTrack {
	return {
		id: `track-${crypto.randomUUID().slice(0, 8)}`,
		title: media ? trackTitleFromMedia(media) : '新歌曲',
		artist: '',
		source: '',
		audioUrl: media?.url ?? '',
		coverUrl: null,
		duration: null,
		enabled: Boolean(media),
		order: playlist.value.tracks.length,
	}
}

function addBlankTrack() {
	const track = createTrack()
	playlist.value.tracks.push(track)
	selectedTrackId.value = track.id
	query.value = ''
	filter.value = 'all'
}

function addFromMedia() {
	pickerTarget.value = { kind: 'new-audio' }
}

function requestDelete() {
	pendingDelete.value = selectedTrack.value ? { ...toRaw(selectedTrack.value) } : null
}

function confirmDelete() {
	const track = pendingDelete.value
	if (!track)
		return
	const index = playlist.value.tracks.findIndex(item => item.id === track.id)
	if (index < 0)
		return
	playlist.value.tracks.splice(index, 1)
	normalizeTracks()
	pendingDelete.value = null
	ensureSelection(playlist.value.tracks[index]?.id ?? playlist.value.tracks[index - 1]?.id)
}

function moveTrack(id: string, direction: -1 | 1) {
	const index = playlist.value.tracks.findIndex(track => track.id === id)
	const target = index + direction
	if (index < 0 || target < 0 || target >= playlist.value.tracks.length)
		return
	const current = playlist.value.tracks[index]!
	playlist.value.tracks[index] = playlist.value.tracks[target]!
	playlist.value.tracks[target] = current
	normalizeTracks()
}

function openPicker(field: 'audioUrl' | 'coverUrl') {
	if (!selectedTrackId.value)
		return
	pickerTarget.value = { kind: 'field', trackId: selectedTrackId.value, field }
}

function applyMedia(media: MediaObjectDto) {
	const target = pickerTarget.value
	if (!target)
		return
	if (target.kind === 'new-audio') {
		const track = createTrack(media)
		playlist.value.tracks.push(track)
		selectedTrackId.value = track.id
		query.value = ''
		filter.value = 'all'
		pickerTarget.value = null
		return
	}
	const track = playlist.value.tracks.find(item => item.id === target.trackId)
	if (track)
		track[target.field] = media.url
	pickerTarget.value = null
}

async function save() {
	if (!hasChanges.value || saving.value || loading.value)
		return
	saving.value = true
	error.value = null
	success.value = null
	try {
		normalizeTracks()
		const parsed = musicPlaylistSchema.parse(playlist.value)
		success.value = await useAdminApi<PublishResponse>('/api/admin/music/playlist', {
			method: 'PUT',
			body: {
				playlist: parsed,
				expectedSha: sha.value,
				idempotencyKey: `music-playlist-${crypto.randomUUID()}`,
			},
		})
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '歌单保存失败，本地改动仍然保留。'
	}
	finally {
		saving.value = false
	}
}

function handleSaveShortcut(event: KeyboardEvent) {
	if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's')
		return
	event.preventDefault()
	void save()
}

watch([query, filter], () => {
	if (query.value || filter.value !== 'all')
		sortMode.value = false
})

onMounted(() => {
	void load()
	window.addEventListener('keydown', handleSaveShortcut)
})
onBeforeUnmount(() => window.removeEventListener('keydown', handleSaveShortcut))
</script>

<template>
<section>
	<AdminTaskHeader
		eyebrow="个人歌单"
		title="随心听"
		description="先从列表选择歌曲，再编辑详情、试听和调整公开顺序。保存时仍会校验线上版本，避免覆盖其他改动。"
		:status="taskStatus"
		:status-tone="taskTone"
	>
		<template #actions>
			<button class="admin-button" type="button" aria-label="从媒体库添加" @click="addFromMedia">
				<Icon name="tabler:library-plus" aria-hidden="true" />从媒体库添加
			</button>
			<button class="admin-button" type="button" aria-label="添加歌曲" @click="addBlankTrack">
				<Icon name="tabler:plus" aria-hidden="true" />添加歌曲
			</button>
			<button class="admin-button admin-button-primary" type="button" :disabled="saving || loading || !hasChanges" title="快捷键：⌘/Ctrl + S" @click="save">
				<Icon name="tabler:device-floppy" />{{ saving ? '保存中…' : hasChanges ? '保存歌单' : '已保存' }}
			</button>
		</template>
	</AdminTaskHeader>

	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>
	<p v-if="success" class="admin-success">
		歌单保存成功 · {{ success.commitSha.slice(0, 8) }}
	</p>

	<div v-if="loading" class="admin-panel admin-skeleton music-loading" />
	<template v-else>
		<section class="admin-panel music-playlist-overview">
			<label class="admin-field">
				<span>歌单标题</span>
				<input v-model="playlist.title" type="text" maxlength="160">
			</label>
			<label class="admin-field admin-field-grow">
				<span>歌单说明</span>
				<input v-model="playlist.description" type="text" maxlength="1000">
			</label>
			<div class="music-playlist-count">
				<strong>{{ playlist.tracks.length }}</strong>
				<span>首歌曲</span>
			</div>
		</section>

		<div class="music-workbench-layout">
			<AdminMusicTrackList
				:tracks="playlist.tracks"
				:selected-id="selectedTrackId"
				:query="query"
				:filter="filter"
				:sort-mode="sortMode"
				@update:query="query = $event"
				@update:filter="filter = $event"
				@update:sort-mode="sortMode = $event"
				@select="selectedTrackId = $event"
				@move="moveTrack"
				@add-blank="addBlankTrack"
				@add-media="addFromMedia"
			/>

			<AdminMusicTrackEditor
				v-if="selectedTrack"
				v-model="selectedTrackModel"
				@pick="openPicker"
				@delete="requestDelete"
			/>
			<AdminEmptyState v-else icon="tabler:music-off" title="歌单还是空的" description="从媒体库选择音频，或先创建一首空白歌曲。">
				<button class="admin-button admin-button-primary" type="button" @click="addFromMedia">
					从媒体库添加歌曲
				</button>
			</AdminEmptyState>
		</div>
	</template>

	<AdminMediaPicker
		:open="pickerTarget !== null"
		:kind="pickerKind"
		upload-purpose="music"
		@close="pickerTarget = null"
		@select="applyMedia"
	/>

	<AdminConfirmDialog
		:open="Boolean(pendingDelete)"
		title="删除歌曲"
		:description="pendingDelete ? `“${pendingDelete.title || '未命名歌曲'}”将从歌单中移除。保存歌单后才会影响线上播放器。` : ''"
		confirm-label="删除歌曲"
		:busy="false"
		danger
		@close="pendingDelete = null"
		@confirm="confirmDelete"
	/>
</section>
</template>

<style scoped lang="scss">
.music-loading {
	min-height: 24rem;
}

.music-playlist-overview {
	display: grid;
	grid-template-columns: minmax(11rem, 0.35fr) minmax(0, 1fr) auto;
	align-items: end;
	gap: 0.8rem;
	margin-bottom: 1rem;
	padding: 0.9rem;
}

.music-playlist-overview .admin-field {
	margin: 0;
}

.music-playlist-count {
	display: grid;
	place-items: center;
	min-width: 5rem;
	min-height: 3.5rem;
	border-radius: 0.8rem;
	background: var(--admin-surface-soft);
}

.music-playlist-count strong {
	font-size: 1.25rem;
	font-variant-numeric: tabular-nums;
}

.music-playlist-count span {
	font-size: 0.62rem;
	color: var(--admin-muted);
}

.music-workbench-layout {
	display: grid;
	grid-template-columns: minmax(18rem, 0.38fr) minmax(0, 1fr);
	align-items: start;
	gap: 1rem;
}

@media (max-width: 900px) {
	.music-playlist-overview,
	.music-workbench-layout {
		grid-template-columns: 1fr;
	}

	.music-playlist-count {
		grid-template-columns: auto auto;
		place-content: center;
		gap: 0.35rem;
	}
}
</style>
