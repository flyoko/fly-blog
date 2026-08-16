<script setup lang="ts">
const props = withDefaults(defineProps<{
	to?: string
	compact?: boolean
	scene?: boolean
}>(), {
	to: '/',
	compact: false,
	scene: false,
})

const appConfig = useAppConfig()
</script>

<template>
<UtilLink
	:to="props.to"
	class="blog-nav-brand"
	:class="{ 'is-compact': props.compact, 'has-scene': props.scene }"
	:aria-label="`${appConfig.title} 首页`"
>
	<span class="blog-nav-brand-logo" aria-hidden="true">
		<img
			:src="appConfig.header.logo"
			alt=""
			width="64"
			height="64"
			decoding="async"
		>
	</span>
	<span class="blog-nav-brand-copy">
		<strong>{{ appConfig.title }}</strong>
		<small v-if="!props.compact">{{ appConfig.header.subtitle }}</small>
	</span>
	<span v-if="props.scene" class="blog-nav-brand-scene" aria-hidden="true">
		<span class="brand-scene-orbit brand-scene-orbit-a" />
		<span class="brand-scene-orbit brand-scene-orbit-b" />
		<span class="brand-scene-rocket">🚀</span>
		<img
			class="brand-scene-character"
			src="/assets/shinchan-user-cutout.webp"
			alt=""
			width="78"
			height="67"
			decoding="async"
			fetchpriority="low"
		>
	</span>
</UtilLink>
</template>

<style lang="scss" scoped>
.blog-nav-brand {
	contain: layout paint;
	display: flex;
	align-items: center;
	gap: 0.58rem;
	position: relative;
	overflow: hidden;
	min-width: 0;
	color: var(--c-text);
	isolation: isolate;
	user-select: none;
}

.blog-nav-brand-logo {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	overflow: hidden;
	width: 2.15rem;
	height: 2.15rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 50%;
	box-shadow: inset 0 1px 0 var(--c-surface-highlight);
	background: color-mix(in srgb, var(--c-surface-fill) 86%, transparent);
	z-index: 2;
}

.blog-nav-brand-logo img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.blog-nav-brand-copy {
	display: grid;
	gap: 0.08rem;
	min-width: 0;
	line-height: 1.16;
	z-index: 2;
}

.blog-nav-brand.has-scene {
	padding-inline-end: 3.7rem;
	background:
		linear-gradient(90deg, color-mix(in srgb, var(--c-surface-fill) 28%, transparent), transparent 72%),
		radial-gradient(circle at 86% 50%, color-mix(in srgb, var(--c-flow-blue) 14%, transparent), transparent 42%);
}

.blog-nav-brand.has-scene.is-compact {
	padding-inline-end: 0;
	background: transparent;
}

.blog-nav-brand.is-compact .blog-nav-brand-scene {
	display: none;
}

.blog-nav-brand-scene {
	position: absolute;
	overflow: hidden;
	inset: 0 0 0 38%;
	border-radius: inherit;
	pointer-events: none;
	z-index: 1;
}

.brand-scene-orbit {
	position: absolute;
	border: 1px solid color-mix(in srgb, var(--c-primary) 36%, transparent);
	border-radius: 50%;
	animation: brand-scene-orbit 13s linear infinite;
}

.brand-scene-orbit::after {
	content: "";
	position: absolute;
	top: -0.12rem;
	left: 46%;
	width: 0.25rem;
	aspect-ratio: 1;
	border-radius: 50%;
	box-shadow: 0 0 0.55rem color-mix(in srgb, var(--c-flow-cyan) 68%, transparent);
	background: color-mix(in srgb, var(--c-flow-cyan) 76%, white);
}

.brand-scene-orbit-a {
	inset: 8% -3% -45% 8%;
}

.brand-scene-orbit-b {
	inset: 30% 14% -62% 24%;
	border-style: dashed;
	animation-direction: reverse;
	animation-duration: 18s;
}

.brand-scene-rocket {
	position: absolute;
	top: 0.12rem;
	right: 2.45rem;
	font-size: 0.78rem;
	animation: brand-scene-rocket 4.8s ease-in-out infinite;
	filter: drop-shadow(0 0.2rem 0.4rem color-mix(in srgb, var(--c-primary) 28%, transparent));
}

.brand-scene-character {
	position: absolute;
	right: -0.15rem;
	bottom: -0.38rem;
	width: 3.45rem;
	height: auto;
	transform-origin: 55% 90%;
	animation: brand-scene-bob 4.2s ease-in-out infinite;
	object-fit: contain;
}

@keyframes brand-scene-orbit {
	to { transform: rotate(1turn); }
}

@keyframes brand-scene-rocket {
	0%, 100% { transform: translate3d(0, 0.1rem, 0) rotate(-8deg); }
	50% { transform: translate3d(0.35rem, -0.18rem, 0) rotate(5deg); }
}

@keyframes brand-scene-bob {
	0%, 100% { transform: translate3d(0, 0.08rem, 0) rotate(-1deg); }
	50% { transform: translate3d(-0.08rem, -0.16rem, 0) rotate(1deg); }
}

.blog-nav-brand-copy strong,
.blog-nav-brand-copy small {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.blog-nav-brand-copy strong {
	font-family: var(--font-creative);
	font-size: 0.95rem;
	font-weight: 760;
	letter-spacing: -0.01em;
}

.blog-nav-brand-copy small {
	max-width: 11rem;
	font-size: 0.62rem;
	font-weight: 520;
	color: var(--c-text-3);
}

.blog-nav-brand.is-compact .blog-nav-brand-logo {
	width: 2rem;
	height: 2rem;
}

.blog-nav-brand.is-compact .blog-nav-brand-copy strong {
	font-size: 0.9rem;
}

.blog-nav-brand.mobile-page-brand {
	margin: 0.55rem var(--mobile-page-gutter) 0.35rem;
	padding: 0.58rem 0.68rem;
	border: 1px solid var(--glass-floating-border);
	border-radius: 1rem;
	box-shadow:
		0 0.65rem 1.8rem color-mix(in srgb, var(--c-surface-shadow) 70%, transparent),
		inset 0 1px 0 var(--c-surface-highlight);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--glass-floating-highlight) 64%, transparent), transparent 42%),
		color-mix(in srgb, var(--glass-floating-fill) 96%, var(--c-bg-1) 4%);
}

@media (max-width: 390px) {
	.blog-nav-brand.mobile-page-brand {
		margin-inline: 0.55rem;
	}

	.blog-nav-brand-copy small {
		max-width: min(13rem, 62vw);
	}
}

@media (prefers-reduced-motion: reduce) {
	.brand-scene-orbit,
	.brand-scene-rocket,
	.brand-scene-character {
		animation: none;
	}
}
</style>
