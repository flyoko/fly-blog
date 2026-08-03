<script setup lang="ts">
import { useEventListener, useMediaQuery } from '@vueuse/core'

const route = useRoute()
const colorMode = useColorMode()
const selector = '.card, .gradient-card, .widget-card, .sidebar-nav-item, .pagination'
const isFinePointer = useMediaQuery('(pointer: fine)')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isDynamic = computed(() => colorMode.value === 'dynamic')

let active: HTMLElement | undefined
let frame = 0
let pending: PointerEvent | undefined

function clearSurface(element = active) {
	if (!element)
		return

	element.classList.remove('is-pointer-active', 'is-pressed')
	element.style.removeProperty('--surface-x')
	element.style.removeProperty('--surface-y')
	element.style.removeProperty('--surface-shift-x')
	element.style.removeProperty('--surface-shift-y')
	element.style.removeProperty('--surface-sheen-position')
}

function deactivateSurface() {
	if (frame)
		cancelAnimationFrame(frame)

	frame = 0
	pending = undefined
	clearSurface()
	active = undefined
}

function updateSurface() {
	frame = 0
	if (!pending || !active)
		return

	const rect = active.getBoundingClientRect()
	if (!rect.width || !rect.height)
		return

	const x = Math.max(0, Math.min(100, (pending.clientX - rect.left) / rect.width * 100))
	const y = Math.max(0, Math.min(100, (pending.clientY - rect.top) / rect.height * 100))
	const normalizedX = (x - 50) / 50
	const normalizedY = (y - 50) / 50
	const compact = active.matches('.sidebar-nav-item, .pagination')
	const shiftX = normalizedX * (compact ? 2 : 4.5)
	const shiftY = normalizedY * (compact ? 1.5 : 3.25)

	active.style.setProperty('--surface-x', `${x.toFixed(2)}%`)
	active.style.setProperty('--surface-y', `${y.toFixed(2)}%`)
	active.style.setProperty('--surface-shift-x', `${shiftX.toFixed(2)}px`)
	active.style.setProperty('--surface-shift-y', `${shiftY.toFixed(2)}px`)
	active.style.setProperty('--surface-sheen-position', `${x.toFixed(2)}%`)
}

useEventListener('pointermove', (event) => {
	if (!isDynamic.value || !isFinePointer.value || prefersReducedMotion.value)
		return

	const eventTarget = event.target
	const target = eventTarget instanceof Element
		? eventTarget.closest<HTMLElement>(selector) ?? undefined
		: undefined

	if (target !== active) {
		clearSurface()
		active = target
		active?.classList.add('is-pointer-active')
	}

	if (!active)
		return

	pending = event
	if (!frame)
		frame = requestAnimationFrame(updateSurface)
}, { passive: true })

useEventListener('pointerdown', (event) => {
	if (event.button !== 0 || !isDynamic.value || !isFinePointer.value || prefersReducedMotion.value)
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

watch([isFinePointer, prefersReducedMotion, isDynamic], ([fine, reduced, dynamic]) => {
	if (!dynamic || !fine || reduced)
		deactivateSurface()
})

watch(() => route.fullPath, deactivateSurface)

onBeforeUnmount(deactivateSurface)
</script>

<template>
<div hidden aria-hidden="true" />
</template>
