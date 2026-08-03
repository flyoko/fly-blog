<script setup lang="ts">
import type { MediaObjectDto } from '#shared/admin/media'
import type { MusicPlaylist, MusicTrack } from '#shared/admin/music'
import playlistFallback from '~~/content/playlists/default.json'
import { musicPlaylistSchema } from '#shared/admin/music'

interface PlaylistResponse {
	playlist: MusicPlaylist
	sha: string
}

interface PublishResponse {
	publishRunId: string
	commitSha: string
}

type PickerTarget = { index: number, field: 'audioUrl' | 'coverUrl' } | null

const playlist = ref<MusicPlaylist>(musicPlaylistSchema.parse(structuredClone(playlistFallback) as unknown))
const sha = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const success = ref<PublishResponse | null>(null)
const pickerTarget = ref<PickerTarget>(null)

useSeoMeta({ title: '随心听', robots: 'noindex, nofollow' })

function normalizeTracks() {
	playlist.value.tracks.forEach((track, index) => {
		track.order = index
	})
}

async function load() {
	loading.value = true
	error.value = null
	try {
		const result = await useAdminApi<PlaylistResponse>('/api/admin/music/playlist')
		playlist.value = musicPlaylistSchema.parse(result.playlist)
		playlist.value.tracks = playlist.value.tracks.toSorted((left, right) => left.order - right.order)
		sha.value = result.sha
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '歌单加载失败'
	}
	finally {
		loading.value = false
	}
}

function createTrack(): MusicTrack {
	return {
		id: `track-${crypto.randomUUID().slice(0, 8)}`,
		title: '新歌曲',
		artist: '',
		source: '',
		audioUrl: 'https://media.example.com/audio.mp3',
		coverUrl: null,
		duration: null,
		enabled: false,
		order: playlist.value.tracks.length,
	}
}

function addTrack() {
	playlist.value.tracks.push(createTrack())
}

function removeTrack(index: number) {
	playlist.value.tracks.splice(index, 1)
	normalizeTracks()
}

function moveTrack(index: number, direction: -1 | 1) {
	const target = index + direction
	if (target < 0 || target >= playlist.value.tracks.length)
		return
	const current = playlist.value.tracks[index]!
	playlist.value.tracks[index] = playlist.value.tracks[target]!
	playlist.value.tracks[target] = current
	normalizeTracks()
}

function openPicker(index: number, field: 'audioUrl' | 'coverUrl') {
	pickerTarget.value = { index, field }
}

function applyMedia(media: MediaObjectDto) {
	if (!pickerTarget.value)
		return
	const track = playlist.value.tracks[pickerTarget.value.index]
	if (!track)
		return
	track[pickerTarget.value.field] = media.url
	pickerTarget.value = null
}

async function save() {
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
		error.value = cause instanceof Error ? cause.message : '歌单保存失败'
	}
	finally {
		saving.value = false
	}
}

onMounted(load)
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">Git 歌单 · R2 媒体</span>
			<h1>随心听</h1>
			<p>管理站长拥有、获授权或可以合法公开播放的音频。不会抓取受保护流媒体地址。</p>
		</div>
		<div class="admin-heading-actions">
			<button class="admin-button" type="button" @click="addTrack">
				<Icon name="tabler:plus" />
				添加歌曲
			</button>
			<button class="admin-button admin-button-primary" type="button" :disabled="saving || loading" @click="save">
				<Icon name="tabler:device-floppy" />
				{{ saving ? '保存中…' : '直接保存歌单' }}
			</button>
		</div>
	</header>

	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>
	<p v-if="success" class="admin-success">
		歌单提交成功 · {{ success.commitSha.slice(0, 8) }}
	</p>

	<div v-if="loading" class="admin-panel admin-skeleton music-loading" />
	<div v-else class="music-admin-layout">
		<section class="admin-panel music-playlist-meta">
			<label class="admin-field">
				<span>歌单标题</span>
				<input v-model="playlist.title" type="text" maxlength="160">
			</label>
			<label class="admin-field">
				<span>歌单说明</span>
				<textarea v-model="playlist.description" rows="3" maxlength="1000" />
			</label>
			<div class="music-summary">
				<strong>{{ playlist.tracks.length }}</strong>
				<span>首歌曲 · {{ playlist.tracks.filter(track => track.enabled).length }} 首启用</span>
			</div>
		</section>

		<section class="music-track-list">
			<article v-for="(track, index) in playlist.tracks" :key="track.id" class="admin-panel music-track-card">
				<header>
					<div class="music-track-order">
						<strong>#{{ index + 1 }}</strong>
						<code>{{ track.id }}</code>
					</div>
					<div class="music-track-actions">
						<button class="admin-icon-button" type="button" aria-label="上移歌曲" :disabled="index === 0" @click="moveTrack(index, -1)">
							<Icon name="tabler:arrow-up" />
						</button>
						<button class="admin-icon-button" type="button" aria-label="下移歌曲" :disabled="index === playlist.tracks.length - 1" @click="moveTrack(index, 1)">
							<Icon name="tabler:arrow-down" />
						</button>
						<button class="admin-icon-button" type="button" aria-label="删除歌曲" @click="removeTrack(index)">
							<Icon name="tabler:trash" />
						</button>
					</div>
				</header>

				<div class="music-track-fields">
					<label class="admin-field"><span>标题</span><input v-model="track.title" type="text" maxlength="160"></label>
					<label class="admin-field"><span>作者</span><input v-model="track.artist" type="text" maxlength="160"></label>
					<label class="admin-field"><span>来源说明</span><input v-model="track.source" type="text" maxlength="240"></label>
					<label class="admin-field"><span>预计时长（秒）</span><input v-model.number="track.duration" type="number" min="0"></label>
				</div>

				<div class="music-media-fields">
					<label class="admin-field admin-field-grow">
						<span>音频 URL</span>
						<div class="admin-inline-field">
							<input v-model="track.audioUrl" type="url" placeholder="https://...">
							<button class="admin-button" type="button" @click="openPicker(index, 'audioUrl')">选择/上传音频</button>
						</div>
					</label>
					<label class="admin-field admin-field-grow">
						<span>封面 URL</span>
						<div class="admin-inline-field">
							<input v-model="track.coverUrl" type="url" placeholder="https://...">
							<button class="admin-button" type="button" @click="openPicker(index, 'coverUrl')">选择/上传封面</button>
						</div>
					</label>
				</div>

				<label class="music-enable-toggle">
					<input v-model="track.enabled" type="checkbox">
					<span>在公开播放器中启用</span>
				</label>
			</article>

			<AdminEmptyState
				v-if="!playlist.tracks.length"
				icon="tabler:music-off"
				title="歌单还是空的"
				description="添加第一首拥有合法播放权的音频。"
			>
				<button class="admin-button admin-button-primary" type="button" @click="addTrack">
					添加歌曲
				</button>
			</AdminEmptyState>
		</section>
	</div>

	<AdminMediaPicker
		:open="pickerTarget !== null"
		:kind="pickerTarget?.field === 'audioUrl' ? 'audio' : 'image'"
		upload-purpose="music"
		@close="pickerTarget = null"
		@select="applyMedia"
	/>
</section>
</template>

<style scoped lang="scss">
.music-loading {
	min-height: 24rem;
}

.music-admin-layout {
	display: grid;
	grid-template-columns: minmax(15rem, 0.35fr) minmax(0, 1fr);
	align-items: start;
	gap: 1rem;
}

.music-playlist-meta {
	display: grid;
	gap: 1rem;
	position: sticky;
	top: 1rem;
	padding: 1rem;
}

.music-summary {
	display: grid;
	padding: 1rem;
	border-radius: 0.9rem;
	background: var(--admin-surface-soft);
}

.music-summary strong {
	font-size: 2rem;
}

.music-track-list {
	display: grid;
	gap: 1rem;
}

.music-track-card {
	display: grid;
	gap: 1rem;
	padding: 1rem;
}

.music-track-card > header,
.music-track-actions,
.music-enable-toggle,
.admin-inline-field {
	display: flex;
	align-items: center;
}

.music-track-card > header {
	justify-content: space-between;
	gap: 1rem;
}

.music-track-order {
	display: grid;
	gap: 0.2rem;
}

.music-track-order code {
	font-size: 0.7rem;
	color: var(--admin-muted);
}

.music-track-actions {
	gap: 0.35rem;
}

.music-track-fields,
.music-media-fields {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-inline-field {
	gap: 0.5rem;
}

.admin-inline-field input {
	flex: 1;
	min-width: 0;
}

.music-enable-toggle {
	gap: 0.5rem;
	font-size: 0.82rem;
}

@media (max-width: 900px) {
	.music-admin-layout,
	.music-track-fields,
	.music-media-fields {
		grid-template-columns: 1fr;
	}

	.music-playlist-meta {
		position: static;
	}
}
</style>
