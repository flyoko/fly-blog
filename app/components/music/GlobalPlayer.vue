<script setup lang="ts">
import type { ApiSuccess } from '#shared/admin/api'
import type { PublicMusicPlaylist } from '#shared/admin/music'
import { resolvePublicApiUrl } from '~/utils/public-api'

const store = useMusicStore()
const route = useRoute()
const moduleEnabled = ref(false)
const playerRef = useTemplateRef<HTMLElement>('player')

useAvoidTarget(playerRef, computed(() => store.mobileOpen))

watch(() => route.fullPath, () => store.setMobileOpen(false))

onMounted(async () => {
	try {
		const playlistUrl = resolvePublicApiUrl('/api/music/playlist', globalThis.location.hostname)
		const response = await $fetch<ApiSuccess<PublicMusicPlaylist>>(playlistUrl)
		moduleEnabled.value = response.data.enabled
		if (response.data.enabled)
			store.initialize(response.data.tracks)
	}
	catch {
		moduleEnabled.value = false
		store.setMobileOpen(false)
	}
})

function formatTime(value: number) {
	if (!Number.isFinite(value) || value < 0)
		return '0:00'
	const minutes = Math.floor(value / 60)
	const seconds = Math.floor(value % 60).toString().padStart(2, '0')
	return `${minutes}:${seconds}`
}
</script>

<template>
<section
	v-if="moduleEnabled && store.hasTracks"
	ref="player"
	class="music-player"
	:class="{ 'is-expanded': store.expanded, 'is-playing': store.playing, 'is-mobile-open': store.mobileOpen }"
	aria-label="随心听播放器"
>
	<div v-if="store.expanded" class="music-player-expanded">
		<div class="music-cover-large">
			<img v-if="store.currentTrack?.coverUrl" :src="store.currentTrack.coverUrl" :alt="`${store.currentTrack.title} 封面`" decoding="async">
			<Icon v-else name="tabler:vinyl" />
		</div>
		<div class="music-track-details">
			<span>随心听</span>
			<strong>{{ store.currentTrack?.title }}</strong>
			<small>{{ store.currentTrack?.artist || store.currentTrack?.source || 'fly living' }}</small>
		</div>
	</div>

	<div class="music-player-main">
		<button class="music-cover" type="button" aria-label="展开或收起播放器" @click="store.toggleExpanded">
			<img v-if="store.currentTrack?.coverUrl" :src="store.currentTrack.coverUrl" alt="" decoding="async">
			<Icon v-else name="tabler:vinyl" />
		</button>
		<div class="music-player-copy">
			<strong>{{ store.currentTrack?.title }}</strong>
			<span>{{ store.currentTrack?.artist || store.currentTrack?.source || '随心听' }}</span>
		</div>
		<div class="music-controls">
			<button type="button" aria-label="上一首" @click="store.previous">
				<Icon name="tabler:player-skip-back-filled" />
			</button>
			<button class="music-play" type="button" :aria-label="store.playing ? '暂停' : '播放'" @click="store.toggle">
				<Icon :name="store.loading ? 'tabler:loader-2' : store.playing ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" :class="{ spin: store.loading }" />
			</button>
			<button type="button" aria-label="下一首" @click="store.next()">
				<Icon name="tabler:player-skip-forward-filled" />
			</button>
		</div>
	</div>

	<div class="music-progress-row">
		<span>{{ formatTime(store.progress) }}</span>
		<input
			:value="store.progress"
			type="range"
			min="0"
			:max="Math.max(store.duration, 1)"
			step="0.1"
			aria-label="播放进度"
			@input="store.seek(Number(($event.target as HTMLInputElement).value))"
		>
		<span>{{ formatTime(store.duration) }}</span>
	</div>

	<div class="music-volume-control">
		<button type="button" :aria-label="store.muted ? '取消静音' : '静音'" @click="store.toggleMuted">
			<Icon :name="store.muted ? 'tabler:volume-off' : 'tabler:volume'" />
		</button>
		<input
			:value="store.volume"
			type="range"
			min="0"
			max="1"
			step="0.05"
			aria-label="音量"
			:aria-valuetext="store.muted ? '静音' : `${Math.round(store.volume * 100)}%`"
			@input="store.setVolume(Number(($event.target as HTMLInputElement).value))"
		>
		<output>{{ store.muted ? '静音' : `${Math.round(store.volume * 100)}%` }}</output>
	</div>

	<div v-if="store.expanded" class="music-player-tools">
		<button type="button" :aria-label="store.mode === 'shuffle' ? '切换为顺序播放' : '切换为随机播放'" @click="store.toggleMode">
			<Icon :name="store.mode === 'shuffle' ? 'tabler:arrows-shuffle' : 'tabler:repeat'" />
			{{ store.mode === 'shuffle' ? '随机' : '顺序' }}
		</button>
	</div>
	<p v-if="store.error" class="music-player-error" role="status">
		{{ store.error }}
	</p>
</section>
</template>

<style scoped lang="scss">
.music-player {
	position: fixed;
	overflow: hidden;
	inset-inline-end: 1rem;
	bottom: 1rem;
	width: min(23rem, calc(100vw - 2rem));
	border: 1px solid color-mix(in srgb, var(--c-primary) 20%, var(--c-border));
	border-radius: 1.25rem;
	box-shadow: var(--box-shadow-2), var(--box-shadow-3);
	background: color-mix(in srgb, var(--c-bg-2) 88%, transparent);
	backdrop-filter: blur(1rem);
	z-index: calc(var(--z-index-popover) + 2);
}

.music-player-expanded {
	display: flex;
	align-items: center;
	gap: 1rem;
	padding: 1rem 1rem 0;
}

.music-cover-large,
.music-cover {
	display: grid;
	place-items: center;
	overflow: hidden;
	border-radius: 50%;
	background: linear-gradient(145deg, var(--c-primary-soft), var(--c-bg-soft));
	color: var(--c-primary);
}

.music-cover-large {
	width: 5.5rem;
	height: 5.5rem;
	font-size: 3rem;
}

.music-cover {
	flex: 0 0 auto;
	width: 2.8rem;
	height: 2.8rem;
	border: 0;
	font-size: 1.5rem;
	cursor: pointer;
}

.music-cover img,
.music-cover-large img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.is-playing .music-cover img,
.is-playing .music-cover > .iconify,
.is-playing .music-cover-large img,
.is-playing .music-cover-large > .iconify {
	animation: music-spin 12s linear infinite;
}

.music-track-details,
.music-player-copy {
	display: grid;
	min-width: 0;
}

.music-track-details span,
.music-player-copy span,
.music-track-details small {
	color: var(--c-text-2);
}

.music-player-copy strong,
.music-player-copy span {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.music-player-main {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	padding: 0.75rem 1rem 0.45rem;
}

.music-player-copy {
	flex: 1;
	font-size: 0.82rem;
}

.music-controls {
	display: flex;
	align-items: center;
	gap: 0.2rem;
}

.music-controls button,
.music-player-tools button,
.music-volume-control button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 0.35rem;
	border: 0;
	background: transparent;
	color: inherit;
	cursor: pointer;
}

.music-controls button {
	width: 2rem;
	height: 2rem;
	border-radius: 50%;
}

.music-controls .music-play {
	width: 2.35rem;
	height: 2.35rem;
	background: var(--c-primary);
	color: var(--c-bg);
}

.music-progress-row {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.5rem;
	padding: 0 1rem 0.65rem;
	font-size: 0.65rem;
	color: var(--c-text-2);
}

.music-progress-row input,
.music-volume-control input {
	accent-color: var(--c-primary);
}

.music-volume-control {
	display: grid;
	grid-template-columns: 2.25rem minmax(0, 1fr) 2.75rem;
	align-items: center;
	gap: 0.5rem;
	padding: 0 1rem 0.75rem;
}

.music-volume-control button {
	display: inline-grid;
	place-items: center;
	width: 2.25rem;
	height: 2.25rem;
	border-radius: 50%;
}

.music-volume-control input {
	width: 100%;
	min-width: 0;
}

.music-volume-control output {
	font-variant-numeric: tabular-nums;
	font-size: 0.7rem;
	text-align: end;
	color: var(--c-text-2);
}

.music-player-tools {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0 1rem 0.8rem;
	font-size: 0.75rem;
}

.music-player-error {
	margin: 0;
	padding: 0 1rem 0.8rem;
	font-size: 0.72rem;
	color: var(--c-danger, #B42318);
}

.spin {
	animation: music-spin 1s linear infinite;
}

@keyframes music-spin {
	to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
	.is-playing .music-cover img,
	.is-playing .music-cover > .iconify,
	.is-playing .music-cover-large img,
	.is-playing .music-cover-large > .iconify,
	.spin {
		animation: none;
	}
}

@media (max-width: $breakpoint-mobile), (hover: none) and (pointer: coarse) {
	.music-player {
		display: none;
		overflow-y: auto;
		inset-inline: 0.6rem;
		bottom: max(0.6rem, env(safe-area-inset-bottom));
		width: auto;
		max-height: min(34rem, calc(100dvh - 6rem));
		background: var(--c-bg-2);
		backdrop-filter: none;

		&.is-mobile-open {
			display: block;
		}
	}

	.music-controls button,
	.music-player-tools button,
	.music-volume-control button,
	.music-cover {
		min-width: 2.75rem;
		min-height: 2.75rem;
	}
}
</style>
