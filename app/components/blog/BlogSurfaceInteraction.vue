<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'

const route = useRoute()
const colorMode = useColorMode()
const selector = '.card.upraise:not([data-surface-static]), .gradient-card:not([data-surface-static]), .sidebar-nav-item:not([data-surface-static]), .about-hero:not([data-surface-static])'
const isFinePointer = useMediaQuery('(pointer: fine)')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isCompactPerformanceMode = useMediaQuery('(max-width: 1180px)')
const interactionIntensity = computed(() => {
	if (colorMode.value === 'dynamic')
		return 1
	if (colorMode.value === 'dark')
		return 0.72
	return 0.58
})

let active: HTMLElement | undefined
let frame = 0
let pendingX = 0
let pendingY = 0
let hasPending = false

function clearSurface(element = active) {
	if (!element)
		return

	element.classList.remove('is-pointer-active', 'is-pressed')
	element.style.removeProperty('--surface-x')
	element.style.removeProperty('--surface-y')
	element.style.removeProperty('--surface-shift-x')
	element.style.removeProperty('--surface-shift-y')
	element.style.removeProperty('--surface-sheen-position')
	element.style.removeProperty('--surface-tilt-x')
	element.style.removeProperty('--surface-tilt-y')
	element.style.removeProperty('--scene-shift-x')
	element.style.removeProperty('--scene-shift-y')
	element.style.removeProperty('--scene-avatar-x')
	element.style.removeProperty('--scene-avatar-y')
	element.style.removeProperty('--scene-character-x')
	element.style.removeProperty('--scene-character-y')
	element.style.removeProperty('--scene-planet-x')
	element.style.removeProperty('--scene-planet-y')
	element.style.removeProperty('--scene-orbit-x')
	element.style.removeProperty('--scene-orbit-y')
}

function deactivateSurface() {
	if (frame)
		cancelAnimationFrame(frame)

	frame = 0
	hasPending = false
	clearSurface()
	active = undefined
}

function updateSurface() {
	frame = 0
	if (!hasPending || !active)
		return

	hasPending = false
	const rect = active.getBoundingClientRect()
	if (!rect.width || !rect.height)
		return

	const x = Math.max(0, Math.min(100, (pendingX - rect.left) / rect.width * 100))
	const y = Math.max(0, Math.min(100, (pendingY - rect.top) / rect.height * 100))
	const normalizedX = (x - 50) / 50
	const normalizedY = (y - 50) / 50
	const compact = active.matches('.sidebar-nav-item, .pagination')
	const immersive = active.matches('.about-hero')
	const intensity = interactionIntensity.value
	const shiftX = normalizedX * (compact ? 0.8 : 1.4) * intensity
	const shiftY = normalizedY * (compact ? 0.6 : 1) * intensity

	active.style.setProperty('--surface-x', `${x.toFixed(2)}%`)
	active.style.setProperty('--surface-y', `${y.toFixed(2)}%`)
	active.style.setProperty('--surface-shift-x', `${shiftX.toFixed(2)}px`)
	active.style.setProperty('--surface-shift-y', `${shiftY.toFixed(2)}px`)
	active.style.setProperty('--surface-sheen-position', `${x.toFixed(2)}%`)

	if (immersive) {
		active.style.setProperty('--surface-tilt-x', `${(-normalizedY * 2.2 * intensity).toFixed(2)}deg`)
		active.style.setProperty('--surface-tilt-y', `${(normalizedX * 2.8 * intensity).toFixed(2)}deg`)
		active.style.setProperty('--scene-shift-x', `${(-normalizedX * 7 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-shift-y', `${(-normalizedY * 5 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-avatar-x', `${(-normalizedX * 9 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-avatar-y', `${(-normalizedY * 7 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-character-x', `${(normalizedX * 5 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-character-y', `${(normalizedY * 3.5 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-planet-x', `${(-normalizedX * 2.4 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-planet-y', `${(-normalizedY * 1.8 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-orbit-x', `${(-normalizedX * 4.5 * intensity).toFixed(2)}px`)
		active.style.setProperty('--scene-orbit-y', `${(-normalizedY * 3 * intensity).toFixed(2)}px`)
	}
}

useEventListener('pointermove', (event) => {
	if (!isFinePointer.value || prefersReducedMotion.value || isCompactPerformanceMode.value)
		return

	const eventTarget = event.target
	const target = active && eventTarget instanceof Node && active.contains(eventTarget)
		? active
		: eventTarget instanceof Element
			? eventTarget.closest<HTMLElement>(selector) ?? undefined
			: undefined

	if (target !== active) {
		clearSurface()
		active = target
		active?.classList.add('is-pointer-active')
	}

	if (!active)
		return

	pendingX = event.clientX
	pendingY = event.clientY
	hasPending = true
	if (!frame)
		frame = requestAnimationFrame(updateSurface)
}, { passive: true })

useEventListener('pointerdown', (event) => {
	if (event.button !== 0 || !isFinePointer.value || prefersReducedMotion.value || isCompactPerformanceMode.value)
		return

	const eventTarget = event.target
	const target = eventTarget instanceof Element
		? eventTarget.closest<HTMLElement>(selector) ?? undefined
		: undefined

	if (!target)
		return

	if (target !== active) {
		clearSurface()
		active = target
		active.classList.add('is-pointer-active')
	}
	active.classList.add('is-pressed')
}, { passive: true })

useEventListener('pointerup', () => active?.classList.remove('is-pressed'), { passive: true })

useEventListener('pointerout', (event) => {
	if (active && !(event.relatedTarget instanceof Node && active.contains(event.relatedTarget)))
		deactivateSurface()
}, { passive: true })

useEventListener('pointercancel', deactivateSurface, { passive: true })

watch([isFinePointer, prefersReducedMotion, isCompactPerformanceMode], ([fine, reduced, compact]) => {
	if (!fine || reduced || compact)
		deactivateSurface()
})

watch(() => route.fullPath, deactivateSurface)

onBeforeUnmount(deactivateSurface)
</script>

<template>
<div hidden aria-hidden="true" />
</template>
