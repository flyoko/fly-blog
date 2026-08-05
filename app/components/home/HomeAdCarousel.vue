<script setup lang="ts">
import type { ArticleHeaderAd } from '~/utils/article-ads'
import { normalizeCanonicalSiteHref } from '~/utils/site-link'

const props = defineProps<{ ads: ArticleHeaderAd[] }>()
const activeIndex = ref(0)
const pointerPaused = ref(false)
const focusPaused = ref(false)
const userPaused = ref(false)
const announcement = ref('')
const touchStartX = ref<number | null>(null)
const contactOpen = ref(false)
const copyStatus = ref<'idle' | 'copied' | 'failed'>('idle')
const contactTrigger = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const preferredReducedMotion = usePreferredReducedMotion()
const documentVisibility = useDocumentVisibility()

const currentAd = computed(() => props.ads[activeIndex.value] ?? null)
const href = computed(() => normalizeCanonicalSiteHref(currentAd.value?.href || ''))
const isExternal = computed(() => isExtLink(href.value))
const canAutoplay = computed(() => Boolean(
	props.ads.length > 1
	&& !pointerPaused.value
	&& !focusPaused.value
	&& !userPaused.value
	&& !contactOpen.value
	&& preferredReducedMotion.value !== 'reduce'
	&& documentVisibility.value === 'visible',
))

const { pause, resume } = useIntervalFn(() => move(1, false), 5_500, { immediate: false })

watch(canAutoplay, (enabled) => {
	if (!import.meta.client)
		return
	enabled ? resume() : pause()
}, { immediate: true })

watch(() => props.ads.length, (length) => {
	if (!length)
		activeIndex.value = 0
	else if (activeIndex.value >= length)
		activeIndex.value = length - 1
})

watch(contactOpen, (open) => {
	if (!import.meta.client)
		return
	document.documentElement.classList.toggle('has-home-ad-dialog', open)
})

onBeforeUnmount(() => {
	pause()
	if (import.meta.client)
		document.documentElement.classList.remove('has-home-ad-dialog')
})

function restartAutoplay() {
	pause()
	if (canAutoplay.value)
		resume()
}

function announceCurrentAd() {
	const ad = currentAd.value
	announcement.value = ad ? `第 ${activeIndex.value + 1} 条，共 ${props.ads.length} 条：${ad.title}` : ''
}

function move(direction: -1 | 1, restart = true) {
	const length = props.ads.length
	if (length < 2)
		return
	activeIndex.value = (activeIndex.value + direction + length) % length
	if (restart) {
		announceCurrentAd()
		restartAutoplay()
	}
}

function select(index: number) {
	activeIndex.value = index
	announceCurrentAd()
	restartAutoplay()
}

function toggleAutoplay() {
	userPaused.value = !userPaused.value
	if (!userPaused.value) {
		pointerPaused.value = false
		focusPaused.value = false
		restartAutoplay()
	}
}

function handleTouchStart(event: TouchEvent) {
	touchStartX.value = event.changedTouches[0]?.clientX ?? null
	pointerPaused.value = true
}

function handleTouchEnd(event: TouchEvent) {
	const start = touchStartX.value
	const end = event.changedTouches[0]?.clientX
	touchStartX.value = null
	pointerPaused.value = false
	if (start === null || end === undefined || Math.abs(end - start) < 40)
		return
	move(end < start ? 1 : -1)
}

function handleTouchCancel() {
	touchStartX.value = null
	pointerPaused.value = false
}

function handleFocusIn(event: FocusEvent) {
	const target = event.target as HTMLElement | null
	focusPaused.value = !target?.classList.contains('home-ad-carousel-autoplay')
}

function handleFocusOut(event: FocusEvent) {
	const root = event.currentTarget as HTMLElement
	const next = event.relatedTarget as Node | null
	if (!next || !root.contains(next))
		focusPaused.value = false
}

async function openContact() {
	copyStatus.value = 'idle'
	contactOpen.value = true
	await nextTick()
	closeButton.value?.focus()
}

async function closeContact() {
	contactOpen.value = false
	await nextTick()
	contactTrigger.value?.focus()
}

function handleDialogKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault()
		void closeContact()
		return
	}
	if (event.key !== 'Tab' || !dialog.value)
		return
	const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')]
	if (!focusable.length)
		return
	const first = focusable[0]!
	const last = focusable.at(-1)!
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault()
		last.focus()
	}
	else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault()
		first.focus()
	}
}

async function copyWechatId() {
	const value = currentAd.value?.wechatId.trim()
	if (!value)
		return
	try {
		await navigator.clipboard.writeText(value)
		copyStatus.value = 'copied'
	}
	catch {
		copyStatus.value = 'failed'
	}
}
</script>

<template>
<section
	v-if="currentAd"
	class="home-ad-carousel"
	aria-label="首页推广"
	aria-roledescription="轮播"
	@mouseenter="pointerPaused = true"
	@mouseleave="pointerPaused = false"
	@focusin="handleFocusIn"
	@focusout="handleFocusOut"
>
	<header class="home-ad-carousel-header">
		<span class="home-ad-carousel-heading text-creative">精选文章</span>
		<span class="home-ad-carousel-hint">
			<Icon name="tabler:sparkles" />
			站长推荐
		</span>
	</header>

	<div
		class="home-ad-carousel-frame"
		@touchstart.passive="handleTouchStart"
		@touchend.passive="handleTouchEnd"
		@touchcancel.passive="handleTouchCancel"
	>
		<Transition name="home-ad-fade" mode="out-in">
			<NuxtLink
				v-if="currentAd.action === 'link'"
				:key="currentAd.id"
				class="home-ad-carousel-main"
				:to="href"
				:target="isExternal ? '_blank' : undefined"
				:rel="isExternal ? 'noopener sponsored' : 'sponsored'"
			>
				<img class="home-ad-carousel-image" :src="currentAd.image" alt="" loading="eager" decoding="async" fetchpriority="high">
				<span class="home-ad-carousel-copy">
					<small>{{ currentAd.label || '广告' }}</small>
					<strong>{{ currentAd.title }}</strong>
					<span v-if="currentAd.description">{{ currentAd.description }}</span>
					<span class="home-ad-carousel-action">了解更多 <Icon name="tabler:arrow-up-right" /></span>
				</span>
			</NuxtLink>

			<button
				v-else
				:key="currentAd.id"
				ref="contactTrigger"
				class="home-ad-carousel-main"
				type="button"
				:aria-label="`微信联系：${currentAd.title}`"
				@click="openContact"
			>
				<img class="home-ad-carousel-image" :src="currentAd.image" alt="" loading="eager" decoding="async" fetchpriority="high">
				<span class="home-ad-carousel-copy">
					<small>{{ currentAd.label || '广告' }}</small>
					<strong>{{ currentAd.title }}</strong>
					<span v-if="currentAd.description">{{ currentAd.description }}</span>
					<span class="home-ad-carousel-action">微信联系 <Icon name="tabler:brand-wechat" /></span>
				</span>
			</button>
		</Transition>

		<button v-if="ads.length > 1" class="home-ad-carousel-control is-previous" type="button" aria-label="上一条广告" @click="move(-1)">
			<Icon name="tabler:chevron-left" />
		</button>
		<button v-if="ads.length > 1" class="home-ad-carousel-control is-next" type="button" aria-label="下一条广告" @click="move(1)">
			<Icon name="tabler:chevron-right" />
		</button>

		<button
			v-if="ads.length > 1"
			class="home-ad-carousel-autoplay"
			type="button"
			:aria-label="userPaused ? '继续自动轮播' : '暂停自动轮播'"
			:aria-pressed="userPaused"
			@click="toggleAutoplay"
		>
			<Icon :name="userPaused ? 'tabler:player-play-filled' : 'tabler:player-pause-filled'" />
		</button>

		<div v-if="ads.length > 1" class="home-ad-carousel-dots" role="tablist" aria-label="选择广告">
			<button
				v-for="(ad, index) in ads"
				:key="ad.id"
				class="home-ad-carousel-dot"
				:class="{ 'is-active': index === activeIndex }"
				type="button"
				role="tab"
				:aria-label="`第 ${index + 1} 条广告：${ad.title}`"
				:aria-selected="index === activeIndex"
				@click="select(index)"
			/>
		</div>
	</div>

	<p class="visually-hidden" aria-live="polite">
		{{ announcement }}
	</p>

	<Teleport to="body">
		<div v-if="contactOpen && currentAd.action === 'wechat'" class="home-ad-dialog-backdrop" @click.self="closeContact">
			<section
				ref="dialog"
				class="home-ad-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="home-ad-dialog-title"
				@keydown="handleDialogKeydown"
			>
				<button ref="closeButton" class="home-ad-dialog-close" type="button" aria-label="关闭微信联系" @click="closeContact">
					<Icon name="tabler:x" />
				</button>
				<small>{{ currentAd.label || '微信联系' }}</small>
				<h2 id="home-ad-dialog-title">
					{{ currentAd.title }}
				</h2>
				<p>{{ currentAd.wechatNote || '扫码添加微信，联系时请说明来自博客。' }}</p>
				<img class="home-ad-dialog-qr" :src="currentAd.wechatQr" :alt="`${currentAd.title} 微信二维码`">
				<div v-if="currentAd.wechatId" class="home-ad-dialog-id">
					<span>微信号：<strong>{{ currentAd.wechatId }}</strong></span>
					<button type="button" @click="copyWechatId">
						{{ copyStatus === 'copied' ? '已复制' : copyStatus === 'failed' ? '请手动复制' : '复制微信号' }}
					</button>
				</div>
			</section>
		</div>
	</Teleport>
</section>
</template>

<style scoped lang="scss">
.home-ad-carousel {
	margin: 1rem;
}

.home-ad-carousel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	min-height: 3rem;
	margin-bottom: 0.55rem;
	padding-inline: 0.15rem;
	color: var(--c-text-2);
}

.home-ad-carousel-heading {
	font-size: clamp(1.65rem, 4.5vw, 2.4rem);
	font-weight: 800;
	letter-spacing: -0.025em;
	line-height: 1;
}

.home-ad-carousel-hint {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	font-size: 0.72rem;
}

.home-ad-carousel-frame {
	position: relative;
	overflow: hidden;
	height: 10.25rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 24%, var(--c-border));
	border-radius: 1rem;
	box-shadow: 0 0.85rem 2.4rem color-mix(in srgb, var(--c-bg) 22%, transparent);
	background: var(--c-bg-2);
	isolation: isolate;
}

.home-ad-carousel-main {
	display: block;
	position: relative;
	overflow: hidden;
	width: 100%;
	height: 100%;
	padding: 0;
	border: 0;
	background: var(--c-bg-2);
	font: inherit;
	text-align: start;
	text-decoration: none;
	color: var(--c-text-1);
	cursor: pointer;
	isolation: isolate;

	&::before,
	&::after {
		content: "";
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 1;
	}

	&::before {
		background:
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--c-bg-2) 98%, transparent) 0%,
				color-mix(in srgb, var(--c-bg-2) 92%, transparent) 31%,
				color-mix(in srgb, var(--c-bg-2) 44%, transparent) 58%,
				color-mix(in srgb, var(--c-bg-2) 8%, transparent) 100%
			);
	}

	&::after {
		background: linear-gradient(0deg, color-mix(in srgb, var(--c-bg) 22%, transparent), transparent 44%);
	}

	&:hover .home-ad-carousel-image,
	&:focus-visible .home-ad-carousel-image {
		transform: scale(1.025);
	}
}

.home-ad-carousel-image {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	transition: transform 0.35s ease;
	filter: saturate(0.94) contrast(1.02);
	object-fit: cover;
	object-position: center 31%;
}

.home-ad-carousel-copy {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	position: relative;
	width: min(52%, 27rem);
	height: 100%;
	padding: 1.35rem 3.6rem 1.35rem 3.4rem;
	z-index: 2;

	> small {
		padding: 0.18rem 0.5rem;
		border-radius: 999px;
		background: var(--c-primary-soft);
		font-size: 0.62rem;
		font-weight: 750;
		color: var(--c-primary);
	}

	> strong {
		display: -webkit-box;
		overflow: hidden;
		margin-top: 0.48rem;
		font-size: clamp(1.08rem, 2.5vw, 1.55rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		-webkit-line-clamp: 2;
		line-height: 1.3;
		-webkit-box-orient: vertical;
	}

	> span:not(.home-ad-carousel-action) {
		display: -webkit-box;
		overflow: hidden;
		margin-top: 0.2rem;
		font-size: 0.76rem;
		-webkit-line-clamp: 1;
		line-height: 1.6;
		color: var(--c-text-2);
		-webkit-box-orient: vertical;
	}
}

.home-ad-carousel-action {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	margin-top: 0.55rem;
	font-size: 0.7rem;
	font-weight: 750;
	color: var(--c-primary);
}

.home-ad-carousel-control {
	display: grid;
	place-items: center;
	position: absolute;
	opacity: 0;
	top: 50%;
	width: 2.15rem;
	height: 2.15rem;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--c-border) 84%, transparent);
	border-radius: 0.65rem;
	box-shadow: 0 0.35rem 0.9rem color-mix(in srgb, var(--c-bg) 26%, transparent);
	background: color-mix(in srgb, var(--c-bg-2) 78%, transparent);
	backdrop-filter: blur(0.6rem);
	font-size: 1.15rem;
	color: var(--c-text-1);
	transform: translateY(-50%) scale(0.92);
	transition: opacity 0.18s ease, transform 0.18s ease, border-color 0.18s ease, color 0.18s ease;
	cursor: pointer;
	pointer-events: none;
	z-index: 4;

	&:hover,
	&:focus-visible {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}

	&.is-previous { inset-inline-start: 0.65rem; }
	&.is-next { inset-inline-end: 0.65rem; }
}

.home-ad-carousel-frame:hover .home-ad-carousel-control,
.home-ad-carousel-frame:focus-within .home-ad-carousel-control {
	opacity: 1;
	transform: translateY(-50%) scale(1);
	pointer-events: auto;
}

.home-ad-carousel-autoplay {
	display: grid;
	place-items: center;
	position: absolute;
	inset-inline-end: 0.65rem;
	bottom: 0.42rem;
	width: 1.65rem;
	height: 1.65rem;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--c-border) 84%, transparent);
	border-radius: 50%;
	background: color-mix(in srgb, var(--c-bg-2) 78%, transparent);
	backdrop-filter: blur(0.6rem);
	font-size: 0.72rem;
	color: var(--c-text-2);
	cursor: pointer;
	z-index: 4;

	&:hover,
	&:focus-visible,
	&[aria-pressed="true"] {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}
}

.home-ad-carousel-dots {
	display: flex;
	gap: 0.28rem;
	position: absolute;
	bottom: 0.45rem;
	left: 50%;
	transform: translateX(-50%);
	z-index: 4;
}

.home-ad-carousel-dot {
	width: 0.38rem;
	height: 0.38rem;
	padding: 0;
	border: 0;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c-text-1) 30%, transparent);
	transition: width 0.2s ease, background 0.2s ease;
	cursor: pointer;

	&.is-active {
		width: 1.25rem;
		background: var(--c-primary);
	}
}

.home-ad-fade-enter-active,
.home-ad-fade-leave-active {
	transition: opacity 0.24s ease;
}

.home-ad-fade-enter-from,
.home-ad-fade-leave-to {
	opacity: 0;
}

.home-ad-dialog-backdrop {
	display: grid;
	place-items: center;
	position: fixed;
	inset: 0;
	padding: 1rem;
	background: color-mix(in srgb, var(--c-bg) 68%, transparent);
	backdrop-filter: blur(0.7rem);
	z-index: 1000;
}

.home-ad-dialog {
	position: relative;
	width: min(23rem, 100%);
	padding: 1.35rem;
	border: 1px solid var(--c-border);
	border-radius: 1.2rem;
	box-shadow: 0 1.75rem 5rem color-mix(in srgb, var(--c-bg) 45%, transparent);
	background: var(--c-bg-2);
	text-align: center;
	color: var(--c-text-1);

	> small {
		display: inline-block;
		padding: 0.18rem 0.5rem;
		border-radius: 999px;
		background: var(--c-primary-soft);
		font-size: 0.62rem;
		font-weight: 750;
		color: var(--c-primary);
	}

	h2 {
		margin: 0.45rem 2rem 0.2rem;
		font-size: 1.3rem;
	}

	p {
		margin: 0 0 0.9rem;
		font-size: 0.76rem;
		line-height: 1.7;
		color: var(--c-text-2);
	}
}

.home-ad-dialog-close {
	display: grid;
	place-items: center;
	position: absolute;
	inset-inline-end: 0.7rem;
	top: 0.7rem;
	width: 2rem;
	height: 2rem;
	padding: 0;
	border: 1px solid var(--c-border);
	border-radius: 50%;
	background: var(--c-bg-3);
	color: var(--c-text-1);
	cursor: pointer;
}

.home-ad-dialog-qr {
	display: block;
	width: min(13rem, 72vw);
	aspect-ratio: 1;
	margin: 0 auto 0.9rem;
	padding: 0.45rem;
	border-radius: 0.9rem;
	background: white;
	object-fit: contain;
}

.home-ad-dialog-id {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.7rem;
	padding: 0.65rem 0.75rem;
	border: 1px solid var(--c-border);
	border-radius: 0.8rem;
	background: var(--c-bg-3);
	font-size: 0.72rem;
	text-align: start;

	button {
		flex: none;
		padding: 0.42rem 0.65rem;
		border: 0;
		border-radius: 0.55rem;
		background: var(--c-primary);
		font-weight: 750;
		color: var(--c-bg);
		cursor: pointer;
	}
}

:global(html.has-home-ad-dialog) {
	overflow: hidden;
}

@media (hover: none), (pointer: coarse) {
	.home-ad-carousel-control {
		opacity: 1;
		transform: translateY(-50%) scale(1);
		pointer-events: auto;
	}
}

@media (max-width: 680px) {
	.home-ad-carousel {
		margin: 0.8rem 0.5rem;
	}

	.home-ad-carousel-header {
		min-height: 2.35rem;
		margin-bottom: 0.45rem;
	}

	.home-ad-carousel-heading {
		font-size: 1.55rem;
	}

	.home-ad-carousel-hint {
		display: none;
	}

	.home-ad-carousel-frame {
		height: 8.25rem;
		border-radius: 0.85rem;
	}

	.home-ad-carousel-main::before {
		background:
			linear-gradient(
				90deg,
				color-mix(in srgb, var(--c-bg-2) 98%, transparent) 0%,
				color-mix(in srgb, var(--c-bg-2) 87%, transparent) 47%,
				color-mix(in srgb, var(--c-bg-2) 18%, transparent) 100%
			);
	}

	.home-ad-carousel-image {
		object-position: 62% 30%;
	}

	.home-ad-carousel-copy {
		width: 72%;
		padding: 1rem 2.9rem 1rem 2.75rem;

		> small { font-size: 0.55rem; }

		> strong {
			margin-top: 0.35rem;
			font-size: 1.02rem;
		}
		> span:not(.home-ad-carousel-action) { font-size: 0.65rem; }
	}

	.home-ad-carousel-action {
		margin-top: 0.35rem;
		font-size: 0.64rem;
	}

	.home-ad-carousel-control {
		width: var(--touch-target);
		height: var(--touch-target);
		border-radius: 0.7rem;
		font-size: 1rem;

		&.is-previous { inset-inline-start: 0.35rem; }
		&.is-next { inset-inline-end: 0.35rem; }
	}

	.home-ad-carousel-autoplay {
		inset-inline-end: 0.35rem;
		bottom: 0.35rem;
		width: var(--touch-target);
		height: var(--touch-target);
	}

	.home-ad-dialog-backdrop {
		place-items: end center;
		padding: 0.5rem;
	}

	.home-ad-dialog {
		width: 100%;
		border-radius: 1.2rem 1.2rem 0.8rem 0.8rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.home-ad-carousel-image,
	.home-ad-carousel-control,
	.home-ad-carousel-dot,
	.home-ad-fade-enter-active,
	.home-ad-fade-leave-active {
		transition: none;
	}
}
</style>
