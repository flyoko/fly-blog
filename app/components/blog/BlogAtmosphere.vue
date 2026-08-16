<script setup lang="ts">
import { useEventListener, useMediaQuery, useRafFn } from '@vueuse/core'

const route = useRoute()
const nuxtApp = useNuxtApp()
const colorMode = useColorMode()
const root = useTemplateRef<HTMLElement>('root')
const pointer = useTemplateRef<HTMLElement>('pointer')
const isFinePointer = useMediaQuery('(pointer: fine)')
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isMobilePerformanceMode = useMediaQuery('(max-width: 768px), (hover: none) and (pointer: coarse)')
const isDynamic = computed(() => colorMode.value === 'dynamic')
const isRouteSettling = useState<boolean>('route-compositor-settling', () => false)
let targetX = 50
let targetY = 26
let currentX = 50
let currentY = 26
const routePointerSettleMs = 360
const routePointerFailSafeMs = 4_000

let pointerResumeAt = 0
let routeSettleTimer: ReturnType<typeof setTimeout> | undefined

const { isActive, pause, resume } = useRafFn(() => {
	const element = root.value
	const pointerElement = pointer.value
	if (!element || !pointerElement || !isDynamic.value || !isFinePointer.value || prefersReducedMotion.value || isMobilePerformanceMode.value || isRouteSettling.value) {
		pause()
		return
	}

	const deltaX = targetX - currentX
	const deltaY = targetY - currentY
	currentX += deltaX * 0.09
	currentY += deltaY * 0.09

	const pointerX = currentX / 100 * window.innerWidth
	const pointerY = currentY / 100 * window.innerHeight

	// 只移动独立的指针光晕，避免整张 SVG 背景随鼠标重合成。
	pointerElement.style.transform = `translate3d(${pointerX.toFixed(2)}px, ${pointerY.toFixed(2)}px, 0)`

	if (Math.abs(deltaX) + Math.abs(deltaY) < 0.02)
		pause()
}, { immediate: false })

function canAnimatePointer() {
	return isDynamic.value
		&& isFinePointer.value
		&& !prefersReducedMotion.value
		&& !isMobilePerformanceMode.value
		&& !isRouteSettling.value
}

function resumePointerAnimation() {
	if (canAnimatePointer() && !isActive.value)
		resume()
}

function resetPointer() {
	targetX = 50
	targetY = 26
	if (!isRouteSettling.value)
		resumePointerAnimation()
}

function freezePointerAnimation(resumeAt = Number.POSITIVE_INFINITY) {
	pause()
	pointerResumeAt = resumeAt
}

function clearRouteSettleTimer() {
	if (routeSettleTimer !== undefined) {
		clearTimeout(routeSettleTimer)
		routeSettleTimer = undefined
	}
}

function releaseRouteSettling() {
	const remaining = pointerResumeAt - performance.now()
	if (remaining > 0) {
		routeSettleTimer = setTimeout(releaseRouteSettling, remaining + 34)
		return
	}

	routeSettleTimer = undefined
	pointerResumeAt = 0
	isRouteSettling.value = false
	resumePointerAnimation()
}

function beginRouteSettling() {
	clearRouteSettleTimer()
	isRouteSettling.value = true
	freezePointerAnimation()
	// Abort/error paths should never leave the pointer compositor locked.
	routeSettleTimer = setTimeout(scheduleRouteResume, routePointerFailSafeMs)
}

function scheduleRouteResume() {
	clearRouteSettleTimer()
	isRouteSettling.value = true
	const nextResumeAt = performance.now() + routePointerSettleMs
	freezePointerAnimation(Number.isFinite(pointerResumeAt) ? Math.max(pointerResumeAt, nextResumeAt) : nextResumeAt)
	routeSettleTimer = setTimeout(releaseRouteSettling, routePointerSettleMs + 34)
}

const unhookLoadingStart = nuxtApp.hook('page:loading:start', beginRouteSettling)
const unhookLoadingEnd = nuxtApp.hook('page:loading:end', scheduleRouteResume)
const unhookPageStart = nuxtApp.hook('page:start', beginRouteSettling)
const unhookPageFinish = nuxtApp.hook('page:finish', scheduleRouteResume)

useEventListener('pointermove', (event) => {
	if (!canAnimatePointer())
		return
	if (performance.now() < pointerResumeAt)
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
	// Keep the ambient CSS animation alive during route swaps. Only freeze the
	// two pointer-driven transform layers until the incoming page has mounted.
	scheduleRouteResume()
})

watch([isDynamic, isFinePointer, prefersReducedMotion, isMobilePerformanceMode], ([dynamic, fine, reduced, mobile]) => {
	if (dynamic && fine && !reduced && !mobile) {
		pointerResumeAt = 0
		resumePointerAnimation()
		return
	}

	pause()
	targetX = 50
	targetY = 26
	currentX = 50
	currentY = 26
	pointer.value?.style.removeProperty('transform')
}, { immediate: true })

onBeforeUnmount(() => {
	unhookLoadingStart()
	unhookLoadingEnd()
	unhookPageStart()
	unhookPageFinish()
	clearRouteSettleTimer()
	pointerResumeAt = 0
	isRouteSettling.value = false
	pause()
})
</script>

<template>
<div ref="root" class="blog-atmosphere" :class="{ 'is-route-settling': isRouteSettling }" aria-hidden="true">
	<div class="atmosphere-lens atmosphere-lens-a" />
	<div class="atmosphere-lens atmosphere-lens-b" />
	<div class="atmosphere-stars atmosphere-stars-far" />
	<div class="atmosphere-stars atmosphere-stars-near" />
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
		<g class="flow-ribbon flow-ribbon-tertiary">
			<path class="flow-halo" d="M -160 470 C 220 250 430 790 760 520 S 1220 260 1600 680" stroke="url(#flow-secondary-gradient)" />
			<path class="flow-thread" pathLength="100" d="M -160 470 C 220 250 430 790 760 520 S 1220 260 1600 680" stroke="url(#flow-secondary-gradient)" />
			<path class="flow-signal" pathLength="100" d="M -160 470 C 220 250 430 790 760 520 S 1220 260 1600 680" stroke="var(--c-flow-signal-alt)" />
		</g>
	</svg>
	<div ref="pointer" class="atmosphere-pointer" />
	<div class="atmosphere-grain" />
	<div class="atmosphere-vignette" />
</div>
<div class="reading-progress" aria-hidden="true" />
</template>
