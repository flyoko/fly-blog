<script setup lang="ts">
withDefaults(defineProps<{
	tag?: string
	compact?: boolean
	scene?: boolean
}>(), {
	tag: 'div',
	compact: false,
	scene: true,
})
const appConfig = useAppConfig()
const { data: aboutProfile } = await useAsyncData('about:header-avatar', () =>
	queryCollection('content').path('/about/profile').first())
const profileAvatar = computed(() =>
	String((aboutProfile.value as Record<string, unknown> | null)?.avatar || ''),
)
const headerLogo = computed(() => profileAvatar.value || appConfig.header.logo)
const isRouteSettling = useState<boolean>('route-compositor-settling', () => false)
</script>

<template>
<UtilLink class="blog-header" :class="{ 'is-route-settling': isRouteSettling, 'is-compact': compact }">
	<div v-if="appConfig.header.emojiTail" class="emoji-tail">
		<span
			v-for="(emoji, emojiIndex) in appConfig.header.emojiTail"
			:key="emojiIndex"
			class="split-char"
			:style="getFixedDelay(emojiIndex * .6 - 3)"
			v-text="emoji"
		/>
	</div>

	<span class="blog-logo-shell round-cobblestone" :class="{ circle: appConfig.header.showTitle }">
		<span class="blog-logo-motion">
			<img
				:src="headerLogo"
				class="blog-logo"
				:class="{ 'is-profile-avatar': profileAvatar }"
				:alt="appConfig.title"
				width="96"
				height="96"
				decoding="async"
			>
		</span>
	</span>

	<div v-if="appConfig.header.showTitle" class="blog-text">
		<component :is="tag" class="header-title">
			<span
				v-for="(char, charIndex) in appConfig.title"
				:key="charIndex"
				class="split-char"
				:style="getFixedDelay((charIndex + 1) * .1)"
				v-text="char"
			/>
		</component>

		<div class="header-subtitle">
			{{ appConfig.header.subtitle }}
		</div>
	</div>

	<BlogShinchanScene v-if="scene" variant="header" />
</UtilLink>
</template>

<style lang="scss" scoped>
.blog-header {
	contain: layout paint;
	display: flex;
	align-items: center;
	gap: 0.5em;
	position: relative;
	margin: clamp(1rem, 2rem, 5vh) 1rem min(1rem, 5vh);
	line-height: 1.4;
	color: var(--c-text);
	isolation: isolate;
	user-select: none;
}

.blog-logo-shell,
.blog-text {
	position: relative;
	z-index: 1;
}

.blog-header {
	overflow: hidden;
	min-height: 5.4rem;
	padding: 0.8rem 5.2rem 0.8rem 0.85rem;
	border: 1px solid var(--c-surface-border);
	border-radius: 1.2rem;
	box-shadow:
		0 18px 46px var(--c-surface-shadow),
		inset 0 1px 0 var(--c-surface-highlight);
	background:
		radial-gradient(circle at 10% 35%, var(--c-atmosphere-lens-blue), transparent 38%),
		linear-gradient(112deg, var(--c-surface-fill), color-mix(in srgb, var(--c-surface-fill) 72%, var(--c-flow-blue) 8%));
}

.blog-header::before {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(108deg, transparent 20%, var(--c-surface-sheen) 46%, transparent 66%);
	background-size: 220% 100%;
	animation: header-scene-scan 4.8s ease-in-out infinite;
	pointer-events: none;
}

.blog-header::after {
	content: "";
	position: absolute;
	top: 58%;
	left: -12%;
	width: 72%;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--c-flow-cyan), transparent);
	transform: rotate(-8deg);
	animation: header-scene-line 3.6s ease-in-out infinite alternate;
	pointer-events: none;
}

:global(.light .blog-header) {
	--header-scene-opacity: 0.68;
}

:global(.dark .blog-header) {
	--header-scene-opacity: 0.82;
}

:global(.dynamic .blog-header) {
	--header-scene-opacity: 1;
}

.blog-header::before,
.blog-header::after {
	opacity: var(--header-scene-opacity, 0.72);
}

@keyframes header-scene-scan {
	0%, 100% {
		opacity: 0.22;
		background-position: 160% 0;
	}

	50% {
		opacity: 0.76;
		background-position: -70% 0;
	}
}

@keyframes header-scene-line {
	from {
		opacity: 0.25;
		transform: translateX(-8%) rotate(-8deg);
	}

	to {
		opacity: 0.88;
		transform: translateX(18%) rotate(-5deg);
	}
}

.blog-logo-shell {
	contain: layout paint;
	display: block;
	flex: 0 0 auto;
	position: relative;
	overflow: hidden;
	height: 3em;
	backface-visibility: hidden;
	transform: translateZ(0);
	isolation: isolate;

	&.circle {
		width: 3em;
		border-radius: 50%;
		box-shadow:
			0 10px 24px var(--c-surface-shadow),
			inset 0 0 0 1px var(--c-surface-line),
			inset 0 1px 0 var(--c-surface-highlight);
		transition: box-shadow 0.2s ease;
	}
}

.blog-logo-shell::after {
	content: "";
	position: absolute;
	opacity: 0;
	inset: 2px;
	border: 1px solid color-mix(in srgb, var(--c-flow-cyan) 72%, transparent);
	border-radius: inherit;
	transform: translateZ(0) scale(0.84);
	transition: opacity 0.28s ease, transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
	pointer-events: none;
	z-index: 2;
}

.blog-logo-motion {
	contain: paint;
	display: block;
	width: 100%;
	height: 100%;
	backface-visibility: hidden;
	transform: translateZ(0);
	transform-origin: center;
	transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
	will-change: transform;
	isolation: isolate;
}

.blog-logo {
	display: block;
	width: 100%;
	height: 100%;
	backface-visibility: hidden;
	object-fit: cover;
}

.blog-logo.is-profile-avatar {
	width: 135%;
	height: 135%;
	max-width: none;
	margin: -17.5%;
}

.blog-header:hover .blog-logo-shell.circle,
.blog-header:focus-visible .blog-logo-shell.circle {
	box-shadow:
		0 12px 28px var(--c-surface-shadow),
		inset 0 0 0 1px var(--c-surface-border),
		inset 0 1px 0 var(--c-surface-highlight);
}

.blog-header:hover .blog-logo-motion,
.blog-header:focus-visible .blog-logo-motion {
	transform: translate3d(0, -1px, 0) scale(1.045) rotate(0.8deg);
	will-change: transform;
}

.blog-header:hover .blog-logo-shell::after,
.blog-header:focus-visible .blog-logo-shell::after {
	opacity: 0.72;
	transform: translateZ(0) scale(1);
}

.blog-header.is-route-settling::before,
.blog-header.is-route-settling::after {
	animation-play-state: paused;
}

.blog-header.is-route-settling .blog-logo-motion,
.blog-header.is-route-settling .blog-logo-shell::after,
.blog-header.is-route-settling .emoji-tail {
	transition: none;
}

@font-face {
	font-family: AlimamaFangYuanTi;
	src: url("/fonts/AlimamaFangYuanTi.woff2");
}

.header-title {
	font-family: AlimamaFangYuanTi, "Noto Sans SC", sans-serif;
	font-size: 1.5em;
	font-synthesis: none;
	font-variation-settings: "wght" 600, "BEVL" 100;
}

.header-subtitle {
	font-size: 0.8em;
	color: var(--c-text-2);
}

.emoji-tail {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	align-content: center;
	justify-items: center;
	position: absolute;
	opacity: 0;
	inset: -0.25rem -0.75rem;
	font-size: 2.5rem;
	transition: opacity 0.3s;
	filter: grayscale(0.85) saturate(0.4) blur(1px);
	pointer-events: none;
	z-index: -2;
}

.blog-header:hover {
	.emoji-tail {
		opacity: 0.14;
	}
}

@media (max-width: $breakpoint-widescreen) {
	.blog-header.mobile-page-header {
		width: calc(100% - var(--mobile-page-gutter, 0.75rem) - var(--mobile-page-gutter, 0.75rem));
		min-height: clamp(5rem, 23vw, 5.8rem);
		margin: 0.55rem var(--mobile-page-gutter, 0.75rem) 0.35rem;
		padding:
			clamp(0.68rem, 2.2vw, 0.82rem)
			clamp(4.8rem, 24vw, 6rem)
			clamp(0.68rem, 2.2vw, 0.82rem)
			clamp(0.72rem, 3vw, 0.9rem);
		border-radius: clamp(1rem, 4vw, 1.3rem);
		box-sizing: border-box;
	}

	.blog-header.mobile-page-header .blog-logo-shell {
		height: clamp(2.7rem, 12vw, 3rem);
	}

	.blog-header.mobile-page-header .blog-logo-shell.circle {
		width: clamp(2.7rem, 12vw, 3rem);
	}

	.blog-header.mobile-page-header .blog-text {
		min-width: 0;
	}

	.blog-header.mobile-page-header .header-title {
		overflow: hidden;
		font-size: clamp(1.2rem, 6vw, 1.55rem);
		line-height: 1.08;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.blog-header.mobile-page-header .header-subtitle {
		max-width: min(7.5rem, 52vw);
		margin-top: 0.08rem;
		font-size: clamp(0.74rem, 3.3vw, 0.86rem);
		line-height: 1.22;
	}

	.blog-header.mobile-page-header :deep(.is-header .scene-character) {
		right: -0.35rem;
		bottom: -0.85rem;
		width: clamp(4.8rem, 24vw, 6rem);
	}

	.blog-header.mobile-page-header :deep(.is-header .scene-rocket) {
		top: 9%;
		right: clamp(34%, 37vw, 40%);
		font-size: clamp(0.82rem, 3vw, 1rem);
	}

	.blog-header.mobile-page-header :deep(.is-header .scene-orbit-one) {
		inset: 5% -12% -34% 52%;
	}

	.blog-header.mobile-page-header :deep(.is-header .scene-orbit-two) {
		inset: -25% 10% 20% 30%;
	}

	.blog-header.mobile-page-header :deep(.is-header .scene-track) {
		top: 27%;
		right: -6%;
		width: 66%;
	}
}

@media (max-width: 600px) {
	.blog-header.is-compact {
		gap: 0.4em;
		min-height: 4.2rem;
		margin: 0.4rem 0.5rem 0.25rem;
		padding: 0.55rem 4.4rem 0.55rem 0.65rem;
		border-radius: 0.95rem;
		box-shadow:
			0 10px 28px var(--c-surface-shadow),
			inset 0 1px 0 var(--c-surface-highlight);
	}

	.blog-header.is-compact .blog-logo-shell {
		height: 2.35em;
	}

	.blog-header.is-compact .blog-logo-shell.circle {
		width: 2.35em;
	}

	.blog-header.is-compact .header-title {
		font-size: 1.15em;
		line-height: 1.08;
	}

	.blog-header.is-compact .header-subtitle {
		margin-top: 0.08rem;
		font-size: 0.68em;
		line-height: 1.22;
	}

	.blog-header.is-compact :deep(.is-header .scene-character) {
		right: -0.35rem;
		bottom: -0.8rem;
		width: 4.5rem;
	}

	.blog-header.is-compact :deep(.is-header .scene-rocket) {
		top: 10%;
		right: 31%;
		font-size: 0.85rem;
	}

	.blog-header.is-compact :deep(.is-header .scene-orbit-one) {
		inset: 6% -14% -36% 55%;
	}

	.blog-header.is-compact :deep(.is-header .scene-orbit-two) {
		inset: -28% 8% 20% 34%;
	}

	.blog-header.is-compact :deep(.is-header .scene-track) {
		top: 27%;
		right: -8%;
		width: 62%;
	}
}

@media (prefers-reduced-motion: reduce) {
	:global(.dynamic .blog-header::before),
	.blog-header::after {
		animation: none;
	}

	.blog-logo-motion,
	.blog-logo-shell::after {
		transition: none;
	}

	.blog-header:hover .blog-logo-motion,
	.blog-header:focus-visible .blog-logo-motion {
		transform: translateZ(0);
	}
}
</style>
