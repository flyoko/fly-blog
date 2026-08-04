<script setup lang="ts">
import type { MusicTrack } from '#shared/admin/music'
import AdminAdvancedDetails from '~/components/admin/AdminAdvancedDetails.vue'
import AdminMusicPreviewPlayer from '~/components/admin/music/AdminMusicPreviewPlayer.vue'

const emit = defineEmits<{
	pick: [field: 'audioUrl' | 'coverUrl']
	delete: []
}>()
const track = defineModel<MusicTrack>({ required: true })
</script>

<template>
<section class="admin-panel music-track-editor">
	<header class="music-track-editor-header">
		<div>
			<span class="admin-badge">当前歌曲</span>
			<h2>{{ track.title || '未命名歌曲' }}</h2>
			<p>修改后可先试听，再一次保存整个歌单。</p>
		</div>
		<button class="admin-button admin-button-danger" type="button" @click="emit('delete')">
			<Icon name="tabler:trash" />删除歌曲
		</button>
	</header>

	<AdminMusicPreviewPlayer :src="track.audioUrl" :title="track.title" />

	<div class="music-track-editor-fields">
		<label class="admin-field"><span>歌曲名</span><input v-model="track.title" type="text" maxlength="160"></label>
		<label class="admin-field"><span>作者</span><input v-model="track.artist" type="text" maxlength="160" placeholder="可选"></label>
	</div>

	<label class="admin-field admin-field-grow">
		<span>音频</span>
		<div class="admin-inline-field">
			<input v-model="track.audioUrl" type="url" placeholder="从媒体库选择或粘贴公开链接">
			<button class="admin-button" type="button" @click="emit('pick', 'audioUrl')">选择音频</button>
		</div>
	</label>

	<label class="music-enable-toggle">
		<input v-model="track.enabled" type="checkbox">
		<span><strong>公开播放</strong><small>关闭后保留歌曲，但前台播放器不会展示。</small></span>
	</label>

	<AdminAdvancedDetails title="封面、来源和时长" description="不影响播放的补充信息。">
		<div class="music-track-editor-fields">
			<label class="admin-field"><span>来源说明</span><input v-model="track.source" type="text" maxlength="240" placeholder="可选"></label>
			<label class="admin-field"><span>预计时长（秒）</span><input v-model.number="track.duration" type="number" min="0"></label>
		</div>
		<label class="admin-field admin-field-grow">
			<span>封面</span>
			<div class="admin-inline-field">
				<input v-model="track.coverUrl" type="url" placeholder="可选">
				<button class="admin-button" type="button" @click="emit('pick', 'coverUrl')">选择封面</button>
			</div>
		</label>
	</AdminAdvancedDetails>
</section>
</template>

<style scoped lang="scss">
.music-track-editor {
	display: grid;
	align-content: start;
	gap: 1rem;
	min-width: 0;
	padding: 1rem;
}

.music-track-editor-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.music-track-editor-header h2,
.music-track-editor-header p {
	margin: 0;
}

.music-track-editor-header h2 {
	margin-top: 0.55rem;
	font-family: "Noto Serif SC", serif;
	font-size: 1.35rem;
}

.music-track-editor-header p {
	margin-top: 0.3rem;
	font-size: 0.7rem;
	color: var(--admin-muted);
}

.music-track-editor-fields {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-inline-field,
.music-enable-toggle {
	display: flex;
	align-items: center;
}

.admin-inline-field {
	gap: 0.5rem;
}

.admin-inline-field input {
	flex: 1;
	min-width: 0;
}

.music-enable-toggle {
	gap: 0.65rem;
	min-height: 3.25rem;
	padding: 0.65rem 0.8rem;
	border-radius: 0.85rem;
	background: var(--admin-surface-soft);
}

.music-enable-toggle span,
.music-enable-toggle strong,
.music-enable-toggle small {
	display: block;
}

.music-enable-toggle strong {
	font-size: 0.74rem;
}

.music-enable-toggle small {
	margin-top: 0.18rem;
	font-size: 0.64rem;
	color: var(--admin-muted);
}

@media (max-width: 680px) {
	.music-track-editor-header {
		flex-direction: column;
		align-items: stretch;
	}

	.music-track-editor-fields {
		grid-template-columns: 1fr;
	}
}
</style>
