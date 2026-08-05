<script setup lang="ts">
const ad = useAppConfig().article.headerAd
const href = computed(() => ad.href.trim())
const isExternal = computed(() => isExtLink(href.value))
const visible = computed(() => Boolean(
	ad.enabled
	&& ad.title.trim()
	&& href.value,
))
</script>

<template>
<aside v-if="visible" class="post-header-ad" aria-label="文章推广">
	<NuxtLink
		class="post-header-ad-link"
		:class="{ 'has-image': ad.image }"
		:to="href"
		:target="isExternal ? '_blank' : undefined"
		:rel="isExternal ? 'noopener sponsored' : 'sponsored'"
	>
		<span class="post-header-ad-copy">
			<small>{{ ad.label || '广告' }}</small>
			<strong>{{ ad.title }}</strong>
			<span v-if="ad.description">{{ ad.description }}</span>
			<span class="post-header-ad-action">
				了解更多
				<Icon name="tabler:arrow-up-right" />
			</span>
		</span>
		<img
			v-if="ad.image"
			class="post-header-ad-image"
			:src="ad.image"
			:alt="ad.title"
			loading="lazy"
			decoding="async"
		>
	</NuxtLink>
</aside>
</template>

<style scoped lang="scss">
.post-header-ad {
	margin: 1rem;
}

.post-header-ad-link {
	display: grid;
	align-items: stretch;
	overflow: hidden;
	border: 1px solid color-mix(in srgb, var(--c-primary) 24%, var(--c-border));
	border-radius: 1rem;
	box-shadow: 0 0.75rem 2rem color-mix(in srgb, var(--c-bg) 20%, transparent);
	background:
		radial-gradient(circle at 90% 15%, var(--c-primary-soft), transparent 42%),
		var(--c-bg-2);
	text-decoration: none;
	color: var(--c-text-1);
	transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

	&.has-image {
		grid-template-columns: minmax(0, 1fr) minmax(9rem, 13rem);
	}

	&:hover,
	&:focus-visible {
		border-color: color-mix(in srgb, var(--c-primary) 58%, var(--c-border));
		box-shadow: 0 1rem 2.6rem color-mix(in srgb, var(--c-bg) 28%, transparent);
		transform: translateY(-2px);
	}
}

.post-header-ad-copy {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	gap: 0.45rem;
	min-width: 0;
	padding: clamp(1rem, 2.6vw, 1.45rem);

	small {
		padding: 0.18rem 0.48rem;
		border-radius: 999px;
		background: var(--c-primary-soft);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: var(--c-primary);
	}

	strong {
		font-family: "Noto Serif SC", serif;
		font-size: clamp(1rem, 2.2vw, 1.3rem);
		line-height: 1.45;
	}

	> span:not(.post-header-ad-action) {
		font-size: 0.84rem;
		line-height: 1.7;
		color: var(--c-text-2);
	}
}

.post-header-ad-action {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	margin-top: 0.1rem;
	font-size: 0.75rem;
	font-weight: 700;
	color: var(--c-primary);
}

.post-header-ad-image {
	width: 100%;
	height: 100%;
	min-height: 8.5rem;
	object-fit: cover;
}

@media (max-width: 680px) {
	.post-header-ad {
		margin: 0.8rem 0.5rem;
	}

	.post-header-ad-link.has-image {
		grid-template-columns: 1fr;
	}

	.post-header-ad-image {
		order: -1;
		max-height: 10rem;
	}
}
</style>
