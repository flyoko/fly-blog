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
		<BlogShinchanScene variant="header" />
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
	z-index: 4;
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
	z-index: 4;
}

.blog-nav-brand.has-scene {
	min-height: 3rem;
	padding: 0.22rem 4.8rem 0.22rem 0.24rem;
	border: 1px solid color-mix(in srgb, var(--c-flow-cyan) 44%, var(--c-surface-border));
	border-radius: 0.95rem;
	box-shadow:
		inset 0 1px 0 color-mix(in srgb, var(--c-surface-highlight) 88%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--c-flow-blue) 8%, transparent),
		0 0.45rem 1.5rem color-mix(in srgb, var(--c-surface-shadow) 38%, transparent);
	background:
		radial-gradient(circle at 10% 36%, var(--c-atmosphere-lens-blue), transparent 40%),
		radial-gradient(circle at 84% 45%, color-mix(in srgb, var(--c-flow-blue) 18%, transparent), transparent 45%),
		linear-gradient(112deg, color-mix(in srgb, var(--c-surface-fill) 88%, transparent), color-mix(in srgb, var(--c-surface-fill) 66%, var(--c-flow-blue) 10%));
}

.blog-nav-brand.has-scene::before,
.blog-nav-brand.has-scene::after {
	content: "";
	position: absolute;
	pointer-events: none;
	z-index: 2;
}

.blog-nav-brand.has-scene::before {
	inset: 0;
	border-radius: inherit;
	background: linear-gradient(108deg, transparent 18%, var(--c-surface-sheen) 46%, transparent 68%);
	background-size: 220% 100%;
	animation: nav-brand-scene-scan 5.2s ease-in-out infinite;
}

.blog-nav-brand.has-scene::after {
	top: 59%;
	left: -11%;
	width: 76%;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--c-flow-cyan), transparent);
	transform: rotate(-8deg);
	animation: nav-brand-scene-line 3.8s ease-in-out infinite alternate;
}

.blog-nav-brand.has-scene.is-compact {
	padding-inline-end: 0;
	border: 0;
	box-shadow: none;
	background: transparent;
}

.blog-nav-brand.is-compact .blog-nav-brand-scene {
	display: none;
}

.blog-nav-brand-scene {
	position: absolute;
	overflow: hidden;
	inset: 0;
	border-radius: inherit;
	pointer-events: none;
	z-index: 3;
}

.blog-nav-brand-scene :deep(.shinchan-scene) {
	position: absolute;
	inset: 0;
}

.blog-nav-brand-scene :deep(.is-header .scene-character) {
	right: -0.28rem;
	bottom: -0.9rem;
	width: 5.5rem;
}

.blog-nav-brand-scene :deep(.is-header .scene-orbit-one) {
	inset: 5% -12% -32% 42%;
}

.blog-nav-brand-scene :deep(.is-header .scene-orbit-two) {
	inset: -28% 10% 18% 16%;
}

.blog-nav-brand-scene :deep(.is-header .scene-track) {
	top: 31%;
	right: -4%;
	width: 79%;
}

.blog-nav-brand-scene :deep(.is-header .scene-rocket) {
	top: 5%;
	right: 35%;
	font-size: 0.9rem;
}

.blog-nav-brand-scene :deep(.is-header .scene-spark-one) {
	top: 66%;
	right: 48%;
}

@keyframes nav-brand-scene-scan {
	0%, 100% {
		opacity: 0.18;
		background-position: 160% 0;
	}

	50% {
		opacity: 0.68;
		background-position: -70% 0;
	}
}

@keyframes nav-brand-scene-line {
	from {
		opacity: 0.2;
		transform: translateX(-8%) rotate(-8deg);
	}

	to {
		opacity: 0.82;
		transform: translateX(18%) rotate(-5deg);
	}
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
	.blog-nav-brand.has-scene::before,
	.blog-nav-brand.has-scene::after {
		animation: none;
	}
}
</style>
