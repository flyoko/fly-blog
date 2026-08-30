<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'

type ScrollEdge = 'top' | 'bottom'

const route = useRoute()
const layoutStore = useLayoutStore()
const { avoidTargets } = storeToRefs(layoutStore)
const navigatorRef = useTemplateRef<HTMLElement>('navigator')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const progress = ref(0)
const isScrollable = ref(false)
const burstDirection = ref<ScrollEdge>()
const { transform } = useAvoidTransform(navigatorRef, avoidTargets)

const primaryDirection = computed<ScrollEdge>(() => progress.value >= 52 ? 'top' : 'bottom')
const primaryLabel = computed(() => primaryDirection.value === 'top' ? '回到顶部' : '直达文末')
const progressOffset = computed(() => 100 - progress.value)

let frame = 0
let burstTimer: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined

function updateProgress() {
	frame = 0
	const root = document.documentElement
	const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight)
	isScrollable.value = maxScroll > Math.min(320, window.innerHeight * 0.35)
	progress.value = maxScroll > 0
		? Math.min(100, Math.max(0, window.scrollY / maxScroll * 100))
		: 0
}

function scheduleUpdate() {
	if (!import.meta.client || frame)
		return
	frame = requestAnimationFrame(updateProgress)
}

function triggerBurst(edge: ScrollEdge) {
	burstDirection.value = edge
	if (burstTimer)
		clearTimeout(burstTimer)
	burstTimer = setTimeout(() => {
		burstDirection.value = undefined
	}, prefersReducedMotion.value ? 0 : 420)
}

function scrollToEdge(edge: ScrollEdge) {
	if (!import.meta.client)
		return
	triggerBurst(edge)
	const top = edge === 'top'
		? 0
		: Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
	window.scrollTo({
		top,
		behavior: prefersReducedMotion.value ? 'auto' : 'smooth',
	})
}

useEventListener('scroll', scheduleUpdate, { passive: true })
useEventListener('resize', scheduleUpdate, { passive: true })

watch(() => route.fullPath, () => nextTick(scheduleUpdate))

onMounted(() => {
	scheduleUpdate()
	if ('ResizeObserver' in window) {
		resizeObserver = new ResizeObserver(scheduleUpdate)
		resizeObserver.observe(document.documentElement)
	}
})

onBeforeUnmount(() => {
	if (frame)
		cancelAnimationFrame(frame)
	if (burstTimer)
		clearTimeout(burstTimer)
	resizeObserver?.disconnect()
})
</script>

<template>
<nav
	v-show="isScrollable"
	ref="navigator"
	class="article-reading-nav"
	:style="{ transform }"
	aria-label="文章快速导航"
>
	<div class="article-reading-nav-actions">
		<button type="button" aria-label="回到顶部" title="回到顶部" @click="scrollToEdge('top')">
			<Icon name="tabler:arrow-bar-to-up" />
			<span>回到顶部</span>
		</button>
		<button type="button" aria-label="直达文末" title="直达文末" @click="scrollToEdge('bottom')">
			<Icon name="tabler:arrow-bar-to-down" />
			<span>直达文末</span>
		</button>
	</div>

	<button
		class="article-reading-nav-orb"
		:class="{
			'is-bursting': burstDirection,
			'burst-top': burstDirection === 'top',
			'burst-bottom': burstDirection === 'bottom',
		}"
		type="button"
		:aria-label="primaryLabel"
		:title="`${primaryLabel} · 已读 ${Math.round(progress)}%`"
		@click="scrollToEdge(primaryDirection)"
	>
		<svg class="article-reading-nav-ring" viewBox="0 0 64 64" aria-hidden="true">
			<circle class="article-reading-nav-track" cx="32" cy="32" r="27" pathLength="100" />
			<circle
				class="article-reading-nav-progress"
				cx="32"
				cy="32"
				r="27"
				pathLength="100"
				:style="{ strokeDashoffset: progressOffset }"
			/>
		</svg>
		<span class="article-reading-nav-glint" aria-hidden="true" />
		<Icon
			class="article-reading-nav-icon"
			:name="primaryDirection === 'top' ? 'tabler:arrow-bar-to-up' : 'tabler:arrow-bar-to-down'"
		/>
		<span class="article-reading-nav-percent" aria-hidden="true">{{ Math.round(progress) }}%</span>
	</button>
</nav>
</template>

<style scoped lang="scss">
.article-reading-nav {
	position: fixed;
	inset-inline-end: min(1rem, 5%);
	bottom: calc(min(2rem, 5%) + 6rem);
	width: 3.75rem;
	height: 3.75rem;
	transition: transform 0.1s ease;
	z-index: calc(var(--z-index-popover) + 2);
}

.article-reading-nav-actions {
	display: grid;
	gap: 0.4rem;
	position: absolute;
	opacity: 0;
	inset-inline-end: calc(100% + 0.55rem);
	bottom: 0;
	transform: translateX(0.4rem) scale(0.98);
	transition:
		opacity var(--motion-base) var(--motion-ease),
		transform var(--motion-base) var(--motion-ease);
	pointer-events: none;

	button {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.45rem;
		width: max-content;
		min-height: 2.35rem;
		padding: 0.45rem 0.72rem;
		border: 1px solid color-mix(in srgb, var(--c-primary) 18%, var(--c-border));
		border-radius: 999px;
		box-shadow: 0 0.6rem 1.8rem color-mix(in srgb, var(--c-bg) 30%, transparent), inset 0 1px 0 var(--c-surface-highlight);
		background:
			linear-gradient(145deg, color-mix(in srgb, var(--c-surface-highlight) 48%, transparent), transparent 46%),
			color-mix(in srgb, var(--c-bg-2) 94%, transparent);
		backdrop-filter: blur(0.8rem) saturate(112%);
		font: 600 0.74rem/1 var(--font-basic);
		color: var(--c-text-1);
		transition:
			border-color var(--motion-fast) var(--motion-ease),
			background-color var(--motion-fast) var(--motion-ease),
			color var(--motion-fast) var(--motion-ease),
			transform var(--motion-fast) var(--motion-ease);
		cursor: pointer;

		&:hover {
			border-color: color-mix(in srgb, var(--c-primary) 46%, var(--c-border));
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
			transform: translateX(-2px);
		}
	}
}

.article-reading-nav-orb {
	display: grid;
	place-items: center;
	position: relative;
	overflow: hidden;
	width: 3.75rem;
	height: 3.75rem;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--c-primary) 24%, var(--c-border));
	border-radius: 50%;
	box-shadow:
		0 0.85rem 2.3rem color-mix(in srgb, var(--c-bg) 34%, transparent),
		0 0 1.2rem color-mix(in srgb, var(--c-primary) 10%, transparent),
		inset 0 1px 0 color-mix(in srgb, var(--c-surface-highlight) 80%, transparent);
	background:
		radial-gradient(circle at 30% 22%, color-mix(in srgb, var(--c-surface-highlight) 72%, transparent), transparent 32%),
		linear-gradient(145deg, color-mix(in srgb, var(--c-primary-soft) 34%, transparent), transparent 58%),
		color-mix(in srgb, var(--c-bg-2) 91%, transparent);
	backdrop-filter: blur(0.9rem) saturate(118%);
	color: var(--c-text);
	transition:
		border-color var(--motion-base) var(--motion-ease),
		box-shadow var(--motion-base) var(--motion-ease),
		transform var(--motion-base) var(--motion-ease);
	cursor: pointer;

	&::after {
		content: "";
		position: absolute;
		opacity: 0;
		inset: 0.42rem;
		border: 1px solid color-mix(in srgb, var(--c-primary) 58%, transparent);
		border-radius: 50%;
		pointer-events: none;
	}

	&:hover {
		border-color: color-mix(in srgb, var(--c-primary) 52%, var(--c-border));
		box-shadow:
			0 1rem 2.6rem color-mix(in srgb, var(--c-bg) 38%, transparent),
			0 0 1.5rem color-mix(in srgb, var(--c-primary) 18%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--c-surface-highlight) 88%, transparent);
		transform: translateY(-2px) scale(1.025);
	}

	&.is-bursting::after {
		animation: article-reading-orb-pulse 0.42s var(--motion-ease);
	}

	&.burst-top .article-reading-nav-icon {
		animation: article-reading-arrow-up 0.42s var(--motion-ease);
	}

	&.burst-bottom .article-reading-nav-icon {
		animation: article-reading-arrow-down 0.42s var(--motion-ease);
	}
}

.article-reading-nav-ring {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
	pointer-events: none;
}

.article-reading-nav-track,
.article-reading-nav-progress {
	fill: none;
	stroke-width: 3.6;
}

.article-reading-nav-track {
	stroke: color-mix(in srgb, var(--c-border) 72%, transparent);
}

.article-reading-nav-progress {
	stroke: var(--c-primary);
	stroke-dasharray: 100;
	stroke-linecap: round;
	transition: stroke-dashoffset 0.14s linear;
	filter: drop-shadow(0 0 0.18rem color-mix(in srgb, var(--c-primary) 54%, transparent));
}

.article-reading-nav-glint {
	position: absolute;
	inset: 0.58rem;
	border-radius: 50%;
	background: radial-gradient(circle at 28% 22%, color-mix(in srgb, white 24%, transparent), transparent 34%);
	pointer-events: none;
}

.article-reading-nav-icon {
	position: relative;
	margin-top: -0.3rem;
	font-size: 1.25rem;
	color: var(--c-primary);
	z-index: 1;
}

.article-reading-nav-percent {
	position: absolute;
	bottom: 0.7rem;
	left: 50%;
	font: 700 0.58rem/1 var(--font-basic);
	letter-spacing: -0.02em;
	color: var(--c-text-2);
	transform: translateX(-50%);
	z-index: 1;
}

@media (hover: hover) and (pointer: fine) {
	.article-reading-nav:hover .article-reading-nav-actions,
	.article-reading-nav:focus-within .article-reading-nav-actions {
		opacity: 1;
		transform: none;
		pointer-events: auto;
	}
}

@media (max-height: $breakpoint-phone) and (hover: hover) and (pointer: fine) {
	.article-reading-nav {
		bottom: calc(min(1rem, 3%) + 3.5rem);
	}
}

@media (max-width: $breakpoint-mobile), (hover: none) and (pointer: coarse) {
	.article-reading-nav {
		inset-inline-end: var(--mobile-page-gutter);
		bottom: calc(var(--mobile-safe-bottom) + var(--mobile-float-size) + 0.75rem);
		width: 3.25rem;
		height: 3.25rem;
	}

	.article-reading-nav-actions {
		display: none;
	}

	.article-reading-nav-orb {
		width: 3.25rem;
		height: 3.25rem;
		box-shadow:
			0 0.7rem 1.8rem color-mix(in srgb, var(--c-bg) 28%, transparent),
			inset 0 1px 0 color-mix(in srgb, var(--c-surface-highlight) 74%, transparent);
		backdrop-filter: none;

		&:hover {
			transform: none;
		}
	}

	.article-reading-nav-icon {
		margin-top: -0.2rem;
		font-size: 1.08rem;
	}

	.article-reading-nav-percent {
		bottom: 0.58rem;
		font-size: 0.53rem;
	}
}

:global(html.dynamic) .article-reading-nav-orb,
:global(html.dynamic) .article-reading-nav-actions button {
	backdrop-filter: none;
}

@media (prefers-reduced-transparency: reduce) {
	.article-reading-nav-orb,
	.article-reading-nav-actions button {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.article-reading-nav,
	.article-reading-nav-actions,
	.article-reading-nav-actions button,
	.article-reading-nav-orb,
	.article-reading-nav-progress {
		transition: none;
	}

	.article-reading-nav-orb,
	.article-reading-nav-orb.is-bursting::after,
	.article-reading-nav-orb.burst-top .article-reading-nav-icon,
	.article-reading-nav-orb.burst-bottom .article-reading-nav-icon {
		animation: none;
	}
}

@keyframes article-reading-orb-pulse {
	0% {
		opacity: 0.72;
		transform: scale(0.7);
	}

	100% {
		opacity: 0;
		transform: scale(1.55);
	}
}

@keyframes article-reading-arrow-up {
	0%, 100% { transform: translateY(0); }
	45% { transform: translateY(-0.32rem); }
}

@keyframes article-reading-arrow-down {
	0%, 100% { transform: translateY(0); }
	45% { transform: translateY(0.32rem); }
}
</style>
