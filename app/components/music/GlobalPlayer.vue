<script setup lang="ts">
import type { ApiSuccess } from '#shared/admin/api'
import type { PublicMusicPlaylist } from '#shared/admin/music'
import { resolvePublicApiUrl } from '~/utils/public-api'

const store = useMusicStore()
const route = useRoute()
const moduleEnabled = ref(false)
const volumeOpen = ref(false)
const playerRef = useTemplateRef<HTMLElement>('player')
const volumeControlRef = useTemplateRef<HTMLElement>('volume-control')

const progressPercent = computed(() => {
	if (!Number.isFinite(store.duration) || store.duration <= 0)
		return 0
	return Math.min(100, Math.max(0, (store.progress / store.duration) * 100))
})

useAvoidTarget(playerRef, computed(() => store.playerOpen))

watch(() => route.fullPath, () => {
	volumeOpen.value = false
	store.setPlayerOpen(false)
})
watch(() => store.playerOpen, (open) => {
	if (!open)
		volumeOpen.value = false
})

function handleDocumentPointerDown(event: PointerEvent) {
	const target = event.target
	if (volumeOpen.value && target instanceof Node && !volumeControlRef.value?.contains(target))
		volumeOpen.value = false
}

function handleDocumentKeyDown(event: KeyboardEvent) {
	if (event.key === 'Escape')
		volumeOpen.value = false
}

onMounted(() => {
	document.addEventListener('pointerdown', handleDocumentPointerDown)
	document.addEventListener('keydown', handleDocumentKeyDown)
})

onBeforeUnmount(() => {
	document.removeEventListener('pointerdown', handleDocumentPointerDown)
	document.removeEventListener('keydown', handleDocumentKeyDown)
})

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
		store.setPlayerOpen(false)
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
	:class="{ 'is-expanded': store.expanded, 'is-playing': store.playing, 'is-open': store.playerOpen }"
	aria-label="随心听播放器"
>
	<div class="music-player-console">
		<button
			class="music-track-toggle"
			type="button"
			:aria-label="store.expanded ? '收起播放器详情' : '展开播放器详情'"
			:aria-expanded="store.expanded"
			aria-controls="music-player-details"
			@click="store.toggleExpanded"
		>
			<span class="music-cover" aria-hidden="true">
				<img v-if="store.currentTrack?.coverUrl" :src="store.currentTrack.coverUrl" alt="" decoding="async">
				<Icon v-else name="tabler:vinyl" />
			</span>
			<span class="music-player-copy">
				<strong>{{ store.currentTrack?.title }}</strong>
				<span>{{ store.currentTrack?.artist || store.currentTrack?.source || '随心听' }}</span>
			</span>
		</button>

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

		<div ref="volume-control" class="music-volume-control">
			<button
				class="music-volume-toggle"
				type="button"
				aria-label="调节音量"
				:aria-expanded="volumeOpen"
				aria-controls="music-volume-panel"
				@click="volumeOpen = !volumeOpen"
			>
				<Icon :name="store.muted || store.volume === 0 ? 'tabler:volume-off' : 'tabler:volume'" />
			</button>
			<div v-if="volumeOpen" id="music-volume-panel" class="music-volume-panel" role="group" aria-label="音量调节">
				<output>{{ store.muted ? '静音' : `${Math.round(store.volume * 100)}%` }}</output>
				<input
					:value="store.volume"
					class="music-volume-slider"
					type="range"
					min="0"
					max="1"
					step="0.05"
					aria-label="音量"
					aria-orientation="vertical"
					:aria-valuetext="store.muted ? '静音' : `${Math.round(store.volume * 100)}%`"
					@input="store.setVolume(Number(($event.target as HTMLInputElement).value))"
				>
				<button type="button" :aria-label="store.muted ? '取消静音' : '静音'" @click="store.toggleMuted">
					<Icon :name="store.muted ? 'tabler:volume-off' : 'tabler:volume'" />
				</button>
			</div>
		</div>
	</div>

	<div class="music-progress-rail" :style="{ '--music-progress': `${progressPercent}%` }">
		<input
			:value="store.progress"
			type="range"
			min="0"
			:max="Math.max(store.duration, 1)"
			step="0.1"
			aria-label="播放进度"
			@input="store.seek(Number(($event.target as HTMLInputElement).value))"
		>
	</div>

	<div v-if="store.expanded" id="music-player-details" class="music-player-details">
		<div class="music-time-row" aria-label="播放时间">
			<span>{{ formatTime(store.progress) }}</span>
			<span>{{ formatTime(store.duration) }}</span>
		</div>

		<div class="music-player-tools">
			<button type="button" :aria-label="store.mode === 'shuffle' ? '切换为顺序播放' : '切换为随机播放'" @click="store.toggleMode">
				<Icon :name="store.mode === 'shuffle' ? 'tabler:arrows-shuffle' : 'tabler:repeat'" />
				{{ store.mode === 'shuffle' ? '随机' : '顺序' }}
			</button>
		</div>
	</div>

	<p v-if="store.error" class="music-player-error" role="status">
		{{ store.error }}
	</p>
</section>
</template>

<style scoped lang="scss">
.music-player {
	display: none;
	position: fixed;
	overflow: visible;
	inset-inline-end: 4.5rem;
	bottom: 1rem;
	width: min(20.625rem, calc(100vw - 2rem));
	border: 1px solid color-mix(in srgb, var(--c-primary) 16%, var(--c-border));
	border-radius: 1rem;
	box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--c-text) 11%, transparent), var(--box-shadow-1);
	box-sizing: border-box;
	background: color-mix(in srgb, var(--c-bg-2) 92%, transparent);
	backdrop-filter: blur(1rem) saturate(118%);
	transition: border-color 0.2s ease, box-shadow 0.2s ease;
	z-index: calc(var(--z-index-popover) + 2);

	&.is-open {
		display: block;
	}
}

.music-player-console {
	display: flex;
	align-items: center;
	gap: 0.45rem;
	height: 3.75rem;
	min-height: 3.5rem;
	padding: 0.45rem 0.55rem 0.55rem;
	box-sizing: border-box;
}

.music-track-toggle {
	display: flex;
	flex: 1;
	align-items: center;
	gap: 0.55rem;
	min-width: 0;
	padding: 0;
	border: 0;
	border-radius: 0.8rem;
	background: transparent;
	font: inherit;
	text-align: start;
	color: inherit;
	cursor: pointer;
}

.music-track-toggle:focus-visible,
.music-controls button:focus-visible,
.music-volume-control button:focus-visible,
.music-player-tools button:focus-visible,
.music-progress-rail input:focus-visible,
.music-volume-control input:focus-visible {
	outline: 2px solid var(--c-primary);
	outline-offset: 2px;
}

.music-cover {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	overflow: hidden;
	width: 2.625rem;
	height: 2.625rem;
	border-radius: 0.75rem;
	box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-border) 72%, transparent);
	background: linear-gradient(145deg, var(--c-primary-soft), var(--c-bg-soft));
	font-size: 1.35rem;
	color: var(--c-primary);
}

.music-cover img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.music-player-copy {
	display: grid;
	flex: 1;
	gap: 0.08rem;
	min-width: 0;
	line-height: 1.2;
}

.music-player-copy strong,
.music-player-copy span {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.music-player-copy strong {
	font-size: 0.82rem;
	font-weight: 700;
	letter-spacing: -0.012em;
}

.music-player-copy span {
	font-size: 0.68rem;
	color: var(--c-text-2);
}

.music-controls {
	display: flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 0.12rem;
}

.music-controls button,
.music-volume-control button,
.music-player-tools button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0;
	border: 0;
	background: transparent;
	color: inherit;
	transition: background-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
	cursor: pointer;
}

.music-controls button {
	width: 1.875rem;
	height: 1.875rem;
	border-radius: 50%;
	font-size: 0.92rem;
}

.music-controls button:hover,
.music-volume-control button:hover,
.music-player-tools button:hover {
	background: color-mix(in srgb, var(--c-primary) 10%, transparent);
	color: var(--c-primary);
}

.music-controls button:active,
.music-volume-control button:active,
.music-player-tools button:active {
	transform: scale(0.94);
}

.music-controls .music-play {
	width: 2.125rem;
	height: 2.125rem;
	box-shadow: 0 0.3rem 0.9rem color-mix(in srgb, var(--c-primary) 22%, transparent);
	background: var(--c-primary);
	font-size: 1rem;
	color: var(--c-bg);
}

.music-controls .music-play:hover {
	background: var(--c-primary);
	color: var(--c-bg);
	transform: translateY(-1px);
}

.is-playing {
	border-color: color-mix(in srgb, var(--c-primary) 30%, var(--c-border));
}

.is-playing .music-play {
	box-shadow:
		0 0 0 0.2rem color-mix(in srgb, var(--c-primary) 13%, transparent),
		0 0.4rem 1rem color-mix(in srgb, var(--c-primary) 30%, transparent);
}

.music-progress-rail {
	height: 0.25rem;
	padding: 0 0.55rem;
	box-sizing: border-box;
}

.music-progress-rail input {
	display: block;
	width: 100%;
	height: 0.25rem;
	margin: 0;
	padding: 0;
	background: transparent;
	appearance: none;
	cursor: pointer;
}

.music-progress-rail input::-webkit-slider-runnable-track {
	height: 0.2rem;
	border-radius: 999px;
	background:
		linear-gradient(
			to right,
			var(--c-primary) 0 var(--music-progress),
			color-mix(in srgb, var(--c-border) 78%, transparent) var(--music-progress) 100%
		);
}

.music-progress-rail input::-webkit-slider-thumb {
	opacity: 0;
	width: 0.65rem;
	height: 0.65rem;
	margin-top: -0.225rem;
	border: 2px solid var(--c-bg-2);
	border-radius: 50%;
	box-shadow: 0 0.1rem 0.35rem color-mix(in srgb, var(--c-text) 20%, transparent);
	background: var(--c-primary);
	transition: opacity 0.15s ease;
	appearance: none;
}

.music-progress-rail input:hover::-webkit-slider-thumb,
.music-progress-rail input:focus-visible::-webkit-slider-thumb {
	opacity: 1;
}

.music-progress-rail input::-moz-range-track {
	height: 0.2rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c-border) 78%, transparent);
}

.music-progress-rail input::-moz-range-progress {
	height: 0.2rem;
	border-radius: 999px;
	background: var(--c-primary);
}

.music-progress-rail input::-moz-range-thumb {
	opacity: 0;
	width: 0.65rem;
	height: 0.65rem;
	border: 2px solid var(--c-bg-2);
	border-radius: 50%;
	box-shadow: 0 0.1rem 0.35rem color-mix(in srgb, var(--c-text) 20%, transparent);
	background: var(--c-primary);
	transition: opacity 0.15s ease;
}

.music-progress-rail input:hover::-moz-range-thumb,
.music-progress-rail input:focus-visible::-moz-range-thumb {
	opacity: 1;
}

.music-player-details {
	display: grid;
	gap: 0.4rem;
	padding: 0.45rem 0.75rem 0.6rem;
	border-top: 1px solid color-mix(in srgb, var(--c-border) 72%, transparent);
	background: color-mix(in srgb, var(--c-bg-soft) 42%, transparent);
}

.music-time-row {
	display: flex;
	justify-content: space-between;
	font-variant-numeric: tabular-nums;
	font-size: 0.66rem;
	color: var(--c-text-2);
}

.music-volume-control {
	flex: 0 0 auto;
	position: relative;
}

.music-volume-toggle,
.music-volume-panel button {
	width: 1.875rem;
	height: 1.875rem;
	border-radius: 50%;
}

.music-volume-panel {
	display: grid;
	justify-items: center;
	gap: 0.45rem;
	position: absolute;
	inset-inline-end: 0;
	bottom: calc(100% + 0.7rem);
	min-width: 3.25rem;
	padding: 0.6rem 0.45rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 18%, var(--c-border));
	border-radius: 0.9rem;
	box-shadow: 0 0.7rem 1.8rem color-mix(in srgb, var(--c-text) 16%, transparent), var(--box-shadow-1);
	background: color-mix(in srgb, var(--c-bg-2) 96%, transparent);
	backdrop-filter: blur(0.8rem) saturate(118%);
	z-index: 1;
}

.music-volume-slider {
	width: 1.5rem;
	height: 6.5rem;
	margin: 0;
	padding: 0;
	direction: rtl;
	accent-color: var(--c-primary);
	cursor: pointer;
	writing-mode: vertical-lr;
}

.music-volume-panel output {
	font-variant-numeric: tabular-nums;
	font-size: 0.68rem;
	text-align: center;
	color: var(--c-text-2);
}

.music-player-tools {
	display: flex;
	justify-content: flex-end;
	font-size: 0.72rem;
}

.music-player-tools button {
	gap: 0.3rem;
	min-height: 1.9rem;
	padding: 0 0.55rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c-bg-2) 68%, transparent);
}

.music-player-error {
	margin: 0;
	padding: 0.55rem 0.75rem 0.7rem;
	border-top: 1px solid color-mix(in srgb, var(--c-border) 72%, transparent);
	font-size: 0.72rem;
	color: var(--c-danger, #B42318);
}

.spin {
	animation: music-loading-spin 1s linear infinite;
}

@keyframes music-loading-spin {
	to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
	.music-player,
	.music-controls button,
	.music-volume-control button,
	.music-player-tools button,
	.music-progress-rail input::-webkit-slider-thumb,
	.music-progress-rail input::-moz-range-thumb {
		transition: none;
	}

	.spin {
		animation: none;
	}
}

@media (max-width: $breakpoint-mobile), (hover: none) and (pointer: coarse) {
	.music-player {
		inset-inline: 0.6rem;
		bottom: max(0.6rem, env(safe-area-inset-bottom));
		width: auto;
		max-height: min(20rem, calc(100dvh - 5.5rem));
		background: var(--c-bg-2);
		backdrop-filter: none;
	}

	.music-player-console {
		min-height: 2.75rem;
		padding: 0.35rem 0.4rem 0.45rem;
	}

	.music-track-toggle {
		gap: 0.45rem;
	}

	.music-cover {
		width: 2.375rem;
		height: 2.375rem;
		border-radius: 0.68rem;
	}

	.music-player-copy strong {
		font-size: 0.76rem;
	}

	.music-player-copy span {
		font-size: 0.64rem;
	}

	.music-controls {
		gap: 0;
	}

	.music-controls button,
	.music-volume-control button {
		min-width: 2.75rem;
		min-height: 2.75rem;
	}

	.music-player-tools button {
		min-height: 2.75rem;
	}

	.music-progress-rail {
		padding-inline: 0.45rem;
	}
}
</style>
