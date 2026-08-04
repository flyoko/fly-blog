<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'

const colorMode = useColorMode()
const root = useTemplateRef<HTMLElement>('root')
const isFinePointer = useMediaQuery('(pointer: fine)')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isDynamic = computed(() => colorMode.value === 'dynamic')

let previousX = 0
let previousY = 0
let previousTime = 0
let trailIndex = 0
const soundWords = ['啪', '咻', '叮', '✦']
const cleanupTimers = new Set<number>()

function appendEffect(element: HTMLElement, timeout = 900) {
	const layer = root.value
	if (!layer)
		return
	layer.append(element)
	while (layer.childElementCount > 40)
		layer.firstElementChild?.remove()
	const timer = window.setTimeout(() => {
		cleanupTimers.delete(timer)
		element.remove()
	}, timeout)
	cleanupTimers.add(timer)
}

function createTrail(x: number, y: number) {
	const particle = document.createElement('i')
	particle.className = `storyboard-trail is-${trailIndex++ % 3}`
	particle.style.left = `${x}px`
	particle.style.top = `${y}px`
	particle.style.setProperty('--trail-rotate', `${Math.round(Math.random() * 70 - 35)}deg`)
	appendEffect(particle, 680)
}

function createBurst(x: number, y: number) {
	const burst = document.createElement('span')
	burst.className = 'storyboard-burst'
	burst.style.left = `${x}px`
	burst.style.top = `${y}px`

	const ring = document.createElement('i')
	ring.className = 'storyboard-ring'
	burst.append(ring)

	for (let index = 0; index < 7; index++) {
		const ray = document.createElement('i')
		ray.className = 'storyboard-ray'
		ray.style.setProperty('--ray-angle', `${index * 51.4}deg`)
		burst.append(ray)
	}

	const word = document.createElement('b')
	word.className = 'storyboard-word'
	word.textContent = soundWords[Math.floor(Math.random() * soundWords.length)] ?? '啪'
	burst.append(word)
	appendEffect(burst, 980)
}

useEventListener('pointermove', (event) => {
	if (!isDynamic.value || !isFinePointer.value || prefersReducedMotion.value)
		return

	const now = performance.now()
	const distance = Math.hypot(event.clientX - previousX, event.clientY - previousY)
	if (distance < 24 || now - previousTime < 42)
		return

	previousX = event.clientX
	previousY = event.clientY
	previousTime = now
	createTrail(event.clientX, event.clientY)
}, { passive: true })

useEventListener('pointerdown', (event) => {
	if (!isDynamic.value || prefersReducedMotion.value || event.button > 0)
		return
	createBurst(event.clientX, event.clientY)
}, { passive: true })

function clearEffects() {
	for (const timer of cleanupTimers)
		window.clearTimeout(timer)
	cleanupTimers.clear()
	root.value?.replaceChildren()
	previousX = 0
	previousY = 0
	previousTime = 0
}

watch([isDynamic, prefersReducedMotion], ([dynamic, reduced]) => {
	if (!dynamic || reduced)
		clearEffects()
})

onBeforeUnmount(clearEffects)
</script>

<template>
<div ref="root" class="storyboard-layer" aria-hidden="true" />
</template>

<style lang="scss" scoped>
:global(.storyboard-layer) {
	position: fixed;
	overflow: hidden;
	inset: 0;
	pointer-events: none;
	z-index: calc(var(--z-index-popover) + 2);
}

:global(.storyboard-trail),
:global(.storyboard-burst),
:global(.storyboard-ring),
:global(.storyboard-ray),
:global(.storyboard-word) {
	position: absolute;
	pointer-events: none;
}

:global(.storyboard-trail) {
	width: 8px;
	height: 3px;
	border-radius: 999px;
	background: linear-gradient(90deg, var(--c-flow-cyan), var(--c-flow-blue));
	transform: translate(-50%, -50%) rotate(var(--trail-rotate));
	animation: storyboard-trail-fade 0.68s ease-out forwards;
}

:global(.storyboard-trail.is-1) {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--c-flow-violet);
}

:global(.storyboard-trail.is-2) {
	width: 11px;
	height: 1px;
	background: var(--c-flow-signal);
}

:global(.storyboard-burst) {
	width: 1px;
	height: 1px;
}

:global(.storyboard-ring) {
	inset: -8px;
	border: 2px solid var(--c-flow-cyan);
	border-radius: 50%;
	animation: storyboard-ring 0.72s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

:global(.storyboard-ray) {
	top: -2px;
	left: -1px;
	width: 2px;
	height: 18px;
	border-radius: 999px;
	background: linear-gradient(var(--c-flow-blue), transparent);
	transform: rotate(var(--ray-angle)) translateY(-5px);
	transform-origin: center 7px;
	animation: storyboard-ray 0.72s cubic-bezier(0.22, 1, 0.36, 1) forwards;
}

:global(.storyboard-word) {
	top: -28px;
	left: 10px;
	font: 800 0.85rem var(--font-creative);
	text-shadow: 0 2px 8px var(--c-surface-highlight);
	color: var(--c-primary);
	animation: storyboard-word 0.86s ease-out forwards;
}

@keyframes storyboard-trail-fade {
	to {
		opacity: 0;
		transform: translate(-50%, -50%) rotate(var(--trail-rotate)) scale(0.25);
	}
}

@keyframes storyboard-ring {
	from {
		opacity: 0.9;
		transform: scale(0.3);
	}

	to {
		opacity: 0;
		transform: scale(4.4);
	}
}

@keyframes storyboard-ray {
	from {
		opacity: 1;
		transform: rotate(var(--ray-angle)) translateY(-4px) scaleY(0.3);
	}

	to {
		opacity: 0;
		transform: rotate(var(--ray-angle)) translateY(-32px) scaleY(1.15);
	}
}

@keyframes storyboard-word {
	0% {
		opacity: 0;
		transform: translateY(8px) rotate(-8deg) scale(0.7);
	}

	32% {
		opacity: 1;
		transform: translateY(-5px) rotate(4deg) scale(1.12);
	}

	100% {
		opacity: 0;
		transform: translateY(-24px) rotate(-2deg) scale(0.92);
	}
}

@media (prefers-reduced-motion: reduce) {
	:global(.storyboard-layer) {
		display: none;
	}
}
</style>
