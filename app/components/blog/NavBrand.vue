<script setup lang="ts">
const props = withDefaults(defineProps<{
	to?: string
	compact?: boolean
}>(), {
	to: '/',
	compact: false,
})

const appConfig = useAppConfig()
</script>

<template>
<UtilLink
	:to="props.to"
	class="blog-nav-brand"
	:class="{ 'is-compact': props.compact }"
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
</UtilLink>
</template>

<style lang="scss" scoped>
.blog-nav-brand {
	contain: layout paint;
	display: flex;
	align-items: center;
	gap: 0.58rem;
	min-width: 0;
	color: var(--c-text);
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
</style>
