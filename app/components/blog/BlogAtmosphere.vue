<script setup lang="ts">
import { useEventListener, useMediaQuery, useRafFn } from '@vueuse/core'

const route = useRoute()
const colorMode = useColorMode()
const root = useTemplateRef<HTMLElement>('root')
const isFinePointer = useMediaQuery('(pointer: fine)')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isMobilePerformanceMode = useMediaQuery('(max-width: 768px), (hover: none) and (pointer: coarse)')
const pointerIntensity = computed(() => {
	if (colorMode.value === 'dynamic')
		return 1
	if (colorMode.value === 'dark')
		return 0.72
	return 0.56
})

let targetX = 50
let targetY = 26
let currentX = 50
let currentY = 26

const { isActive, pause, resume } = useRafFn(() => {
	const element = root.value
	if (!element || !isFinePointer.value || prefersReducedMotion.value || isMobilePerformanceMode.value) {
		pause()
		return
	}

	const deltaX = targetX - currentX
	const deltaY = targetY - currentY
	currentX += deltaX * 0.09
	currentY += deltaY * 0.09

	const shiftX = (currentX - 50) / 50 * 22 * pointerIntensity.value
	const shiftY = (currentY - 50) / 50 * 14 * pointerIntensity.value
	element.style.setProperty('--pointer-x', `${currentX.toFixed(2)}%`)
	element.style.setProperty('--pointer-y', `${currentY.toFixed(2)}%`)
	element.style.setProperty('--pointer-shift-x', `${shiftX.toFixed(2)}px`)
	element.style.setProperty('--pointer-shift-y', `${shiftY.toFixed(2)}px`)

	if (Math.abs(deltaX) + Math.abs(deltaY) < 0.02)
		pause()
}, { immediate: false })

function resumePointerAnimation() {
	if (!isActive.value)
		resume()
}

function resetPointer() {
	targetX = 50
	targetY = 26
	resumePointerAnimation()
}

useEventListener('pointermove', (event) => {
	if (!isFinePointer.value || prefersReducedMotion.value || isMobilePerformanceMode.value)
		return

	targetX = event.clientX / window.innerWidth * 100
	targetY = event.clientY / window.innerHeight * 100
	resumePointerAnimation()
}, { passive: true })

useEventListener('pointerout', (event) => {
	if (event.relatedTarget === null)
		resetPointer()
}, { passive: true })

watch(() => route.fullPath, () => {
	// Route swaps already replace a large painted area. Stop the full-screen
	// pointer chase on that frame so macOS browsers do not recompose both the
	// background and the incoming page at the same time. The next real pointer
	// movement resumes the RAF loop normally.
	pause()
	targetX = currentX
	targetY = currentY
})

watch([isFinePointer, prefersReducedMotion, isMobilePerformanceMode], ([fine, reduced, mobile]) => {
	if (fine && !reduced && !mobile)
		return

	pause()
	targetX = 50
	targetY = 26
	currentX = 50
	currentY = 26
	root.value?.style.removeProperty('--pointer-x')
	root.value?.style.removeProperty('--pointer-y')
	root.value?.style.removeProperty('--pointer-shift-x')
	root.value?.style.removeProperty('--pointer-shift-y')
}, { immediate: true })

onBeforeUnmount(() => {
	pause()
})
</script>

<template>
<div ref="root" class="blog-atmosphere" aria-hidden="true">
	<div class="atmosphere-lens atmosphere-lens-a" />
	<div class="atmosphere-lens atmosphere-lens-b" />
	<svg class="atmosphere-flow" viewBox="0 0 1440 900" preserveAspectRatio="none" focusable="false">
		<defs>
			<linearGradient id="flow-primary-gradient" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="var(--c-flow-blue)" stop-opacity="0" />
				<stop offset="0.24" stop-color="var(--c-flow-blue)" />
				<stop offset="0.56" stop-color="var(--c-flow-cyan)" />
				<stop offset="0.82" stop-color="var(--c-flow-violet)" />
				<stop offset="1" stop-color="var(--c-flow-violet)" stop-opacity="0" />
			</linearGradient>
			<linearGradient id="flow-secondary-gradient" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0" stop-color="var(--c-flow-violet)" stop-opacity="0" />
				<stop offset="0.3" stop-color="var(--c-flow-violet)" />
				<stop offset="0.66" stop-color="var(--c-flow-blue)" />
				<stop offset="1" stop-color="var(--c-flow-cyan)" stop-opacity="0" />
			</linearGradient>
		</defs>
		<g class="flow-ribbon flow-ribbon-primary">
			<path class="flow-halo" d="M -140 770 C 150 650 260 235 610 382 S 1055 700 1580 92" stroke="url(#flow-primary-gradient)" />
			<path class="flow-thread" pathLength="100" d="M -140 770 C 150 650 260 235 610 382 S 1055 700 1580 92" stroke="url(#flow-primary-gradient)" />
			<path class="flow-signal" pathLength="100" d="M -140 770 C 150 650 260 235 610 382 S 1055 700 1580 92" stroke="var(--c-flow-signal)" />
		</g>
		<g class="flow-ribbon flow-ribbon-secondary">
			<path class="flow-halo" d="M -110 118 C 245 35 395 510 748 332 S 1182 96 1560 532" stroke="url(#flow-secondary-gradient)" />
			<path class="flow-thread" pathLength="100" d="M -110 118 C 245 35 395 510 748 332 S 1182 96 1560 532" stroke="url(#flow-secondary-gradient)" />
			<path class="flow-signal" pathLength="100" d="M -110 118 C 245 35 395 510 748 332 S 1182 96 1560 532" stroke="var(--c-flow-signal-alt)" />
		</g>
	</svg>
	<div class="atmosphere-pointer" />
	<div class="atmosphere-grain" />
	<div class="atmosphere-vignette" />
</div>
<div class="reading-progress" aria-hidden="true" />
</template>
