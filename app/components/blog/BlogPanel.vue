<script setup lang="ts">
defineProps<{
	hasAside?: boolean
	musicEnabled?: boolean
}>()

const layoutStore = useLayoutStore()
const musicStore = useMusicStore()
const { avoidTargets } = storeToRefs(layoutStore)

const panelRef = useTemplateRef('blog-panel')
const { transform } = useAvoidTransform(panelRef, avoidTargets)
</script>

<template>
<div
	id="blog-panel-shell"
	ref="blog-panel"
	:class="{ 'music-active': musicStore.playerOpen, 'music-playing': musicStore.playing }"
	:style="{ transform }"
>
	<div id="blog-panel" :class="{ 'has-active': layoutStore.state !== 'none' }">
		<button
			v-if="hasAside"
			class="toggle-aside widescreen-only"
			:class="{ active: layoutStore.state === 'aside' }"
			aria-label="切换侧边栏"
			@click="layoutStore.toggle('aside')"
		>
			<Icon class="rtl-flip" name="tabler:align-right" />
		</button>
		<button
			v-if="musicEnabled && musicStore.hasTracks"
			class="toggle-music"
			:class="{ 'active': musicStore.playerOpen, 'is-playing': musicStore.playing }"
			:aria-label="musicStore.playerOpen ? '收起音乐播放器' : '打开音乐播放器'"
			:aria-expanded="musicStore.playerOpen"
			@click="musicStore.togglePlayerOpen"
		>
			<Icon class="music-launcher-icon" name="tabler:music" />
			<span class="music-launcher-status" aria-hidden="true" />
		</button>

		<Icon v-show="false" name="tabler:layout-sidebar-filled" />
		<button
			class="toggle-sidebar mobile-only"
			:class="{ active: layoutStore.state === 'sidebar' }"
			aria-label="切换菜单"
			@click="layoutStore.toggle('sidebar')"
		>
			<Icon class="rtl-flip" :name="layoutStore.state === 'sidebar' ? 'tabler:layout-sidebar-filled' : 'tabler:layout-sidebar'" />
		</button>
	</div>

	<span
		v-if="musicEnabled && musicStore.hasTracks"
		class="music-launcher-effect music-launcher-sparkles"
		aria-hidden="true"
	>
		<span v-for="index in 8" :key="index" class="music-launcher-spark" />
	</span>
</div>
</template>

<style lang="scss" scoped>
#blog-panel-shell {
	--music-spark-duration: 2.55s;
	--music-spark-intensity: 1;

	position: fixed;
	inset-inline-end: min(1rem, 5%);
	bottom: min(2rem, 5%);
	transition: transform 0.1s;
	z-index: calc(var(--z-index-popover) + 3);

	&:has(.toggle-music:hover) {
		--music-spark-intensity: 1.2;
	}

	&.music-active {
		--music-spark-intensity: 0.42;
	}

	&.music-playing {
		--music-spark-duration: 1.95s;
		--music-spark-intensity: 1.18;
	}

	&.music-active.music-playing {
		--music-spark-intensity: 0.72;
	}
}

#blog-panel {
	contain: paint;
	position: relative;
	border-radius: 0.5rem;
	background-color: var(--c-bg-a50);
	backdrop-filter: blur(0.5rem);
	font-size: 1.4rem;
	z-index: calc(var(--z-index-popover) + 3);

	@media (max-height: $breakpoint-phone) {
		display: flex;
	}

	&.has-active {
		box-shadow: var(--box-shadow-1), var(--box-shadow-3);
	}
}

button {
	display: block;
	position: relative;
	padding: 0.5rem;
	transition: background-color 0.2s, color 0.2s;

	&:hover {
		background-color: var(--c-bg-a80);
		color: var(--c-primary);
	}

	&.active {
		background-color: var(--ld-bg-active);
		color: var(--c-primary);
	}
}

.music-launcher-icon {
	position: relative;
	z-index: 1;
}

.music-launcher-effect {
	position: absolute;
	overflow: visible;
	inset-inline-end: 0;
	bottom: 0;
	width: 2.75rem;
	height: 2.95rem;
	pointer-events: none;
	z-index: 1;

	&::before,
	&::after {
		content: "";
		position: absolute;
		opacity: 0;
		border-radius: 0.9rem;
		pointer-events: none;
	}

	&::before {
		inset: -0.8rem;
		background:
			radial-gradient(
				circle,
				color-mix(in srgb, var(--c-primary) 48%, transparent),
				color-mix(in srgb, var(--c-primary) 12%, transparent) 44%,
				transparent 72%
			);
		transform: scale(0.88);
	}

	&::after {
		inset: -0.45rem;
		border: 1px solid color-mix(in srgb, var(--c-primary) 46%, transparent);
		transform: scale(0.78);
	}
}

.music-launcher-spark {
	--music-spark-x: 0rem;
	--music-spark-y: 0rem;
	--music-spark-rotation: 0deg;
	--music-spark-delay: 0s;

	position: absolute;
	opacity: 0;
	top: 50%;
	left: 50%;
	width: 0.5rem;
	height: 0.5rem;
	pointer-events: none;

	&::before,
	&::after {
		content: "";
		position: absolute;
		top: 50%;
		left: 50%;
		border-radius: 999px;
		box-shadow: 0 0 0.3rem color-mix(in srgb, var(--c-primary) 52%, transparent);
		background:
			linear-gradient(
				90deg,
				transparent,
				var(--c-bg-1) 40%,
				color-mix(in srgb, var(--c-primary) 72%, white) 62%,
				transparent
			);
		transform: translate(-50%, -50%);
	}

	&::before {
		width: 0.75rem;
		height: 0.125rem;
	}

	&::after {
		width: 0.125rem;
		height: 0.75rem;
	}

	&:nth-child(1) {
		--music-spark-x: -2.15rem;
		--music-spark-y: -1.7rem;
		--music-spark-rotation: -12deg;
		--music-spark-delay: 0s;
	}

	&:nth-child(2) {
		--music-spark-x: 0.2rem;
		--music-spark-y: -2.5rem;
		--music-spark-rotation: 16deg;
		--music-spark-delay: 0.28s;
	}

	&:nth-child(3) {
		--music-spark-x: 2.2rem;
		--music-spark-y: -1.4rem;
		--music-spark-rotation: 28deg;
		--music-spark-delay: 0.62s;
	}

	&:nth-child(4) {
		--music-spark-x: 2.55rem;
		--music-spark-y: 0.7rem;
		--music-spark-rotation: 40deg;
		--music-spark-delay: 0.94s;
	}

	&:nth-child(5) {
		--music-spark-x: 1.2rem;
		--music-spark-y: 2.35rem;
		--music-spark-rotation: 62deg;
		--music-spark-delay: 1.18s;
	}

	&:nth-child(6) {
		--music-spark-x: -1.15rem;
		--music-spark-y: 2.4rem;
		--music-spark-rotation: -54deg;
		--music-spark-delay: 1.46s;
	}

	&:nth-child(7) {
		--music-spark-x: -2.55rem;
		--music-spark-y: 0.75rem;
		--music-spark-rotation: -35deg;
		--music-spark-delay: 1.74s;
	}

	&:nth-child(8) {
		--music-spark-x: -2.2rem;
		--music-spark-y: -0.4rem;
		--music-spark-rotation: -22deg;
		--music-spark-delay: 2.04s;
	}
}

.music-launcher-status {
	display: none;
	position: absolute;
	inset-inline-end: 0.45rem;
	top: 0.45rem;
	width: 0.42rem;
	height: 0.42rem;
	border: 1px solid var(--c-bg-1);
	border-radius: 50%;
	background: var(--c-primary);
	z-index: 2;
}

.toggle-music.is-playing .music-launcher-status {
	display: block;
}

@media (min-width: ($breakpoint-mobile + 1px)) and (hover: hover) and (pointer: fine) {
	.music-launcher-effect {
		&::before {
			animation: music-launcher-glow 2.15s ease-in-out infinite;
			will-change: transform, opacity;
		}

		&::after {
			animation: music-launcher-ring 2.15s ease-out infinite;
			will-change: transform, opacity;
		}
	}

	.music-launcher-spark {
		animation: music-launcher-sparkle var(--music-spark-duration) cubic-bezier(0.22, 0.76, 0.25, 1) infinite;
		animation-delay: var(--music-spark-delay);
		will-change: transform, opacity;
	}
}

@media (max-width: $breakpoint-mobile), (hover: none) and (pointer: coarse) {
	.music-launcher-effect {
		display: none;
	}

	.music-launcher-effect::before,
	.music-launcher-effect::after,
	.music-launcher-spark {
		animation: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.music-launcher-effect {
		display: none;
	}

	.music-launcher-effect::before,
	.music-launcher-effect::after,
	.music-launcher-spark {
		animation: none;
	}
}

@keyframes music-launcher-glow {
	0%, 100% {
		opacity: calc(0.4 * var(--music-spark-intensity));
		transform: scale(0.88);
	}

	50% {
		opacity: calc(0.72 * var(--music-spark-intensity));
		transform: scale(1.13);
	}
}

@keyframes music-launcher-ring {
	0% {
		opacity: calc(0.62 * var(--music-spark-intensity));
		transform: scale(0.78);
	}

	70%, 100% {
		opacity: 0;
		transform: scale(1.35);
	}
}

@keyframes music-launcher-sparkle {
	0%, 63%, 100% {
		opacity: 0;
		transform: translate(-50%, -50%) translate3d(0, 0, 0) rotate(var(--music-spark-rotation)) scale(0.2);
	}

	68% {
		opacity: calc(0.9 * var(--music-spark-intensity));
		transform: translate(-50%, -50%) translate3d(calc(var(--music-spark-x) * 0.48), calc(var(--music-spark-y) * 0.48), 0) rotate(var(--music-spark-rotation)) scale(0.72);
	}

	80% {
		opacity: var(--music-spark-intensity);
		transform: translate(-50%, -50%) translate3d(var(--music-spark-x), var(--music-spark-y), 0) rotate(var(--music-spark-rotation)) scale(1);
	}

	94% {
		opacity: 0;
		transform: translate(-50%, -50%) translate3d(calc(var(--music-spark-x) * 1.16), calc(var(--music-spark-y) * 1.16), 0) rotate(calc(var(--music-spark-rotation) + 24deg)) scale(0.32);
	}
}
</style>
