<script setup lang="ts">
const props = defineProps<{
	src: string
	title: string
}>()

const audio = ref<HTMLAudioElement | null>(null)
const error = ref<string | null>(null)

function pause() {
	audio.value?.pause()
}

function reload() {
	error.value = null
	pause()
	audio.value?.load()
}

watch(() => props.src, reload)
onBeforeUnmount(pause)

defineExpose({ pause })
</script>

<template>
<section class="music-preview-player" aria-label="试听">
	<div class="music-preview-player-copy">
		<span>试听</span>
		<strong>{{ title || '未命名歌曲' }}</strong>
	</div>
	<audio v-if="src" ref="audio" :src="src" controls preload="metadata" @error="error = '音频暂时无法试听，请检查文件或链接。'" />
	<p v-else class="admin-muted-copy">
		选择音频后可以在这里试听。
	</p>
	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>
</section>
</template>

<style scoped lang="scss">
.music-preview-player {
	display: grid;
	gap: 0.65rem;
	padding: 0.85rem;
	border-radius: 0.9rem;
	background: var(--admin-surface-soft);
}

.music-preview-player-copy span,
.music-preview-player-copy strong {
	display: block;
}

.music-preview-player-copy span {
	font-size: 0.64rem;
	color: var(--admin-muted);
}

.music-preview-player-copy strong {
	margin-top: 0.2rem;
	font-size: 0.78rem;
}

.music-preview-player audio {
	width: 100%;
	min-height: 2.5rem;
}
</style>
