<script setup lang="ts">
const ads = useAppConfig().article.headerAds
const visibleAds = computed(() => ads.filter(ad => Boolean(
	ad.enabled
	&& ad.title.trim()
	&& ad.href.trim(),
)))
const activeIndex = ref(0)
const currentAd = computed(() => visibleAds.value[activeIndex.value] ?? null)
const href = computed(() => normalizeCanonicalSiteHref(currentAd.value?.href || ''))
const isExternal = computed(() => isExtLink(href.value))

watch(() => visibleAds.value.length, (length) => {
	if (!length)
		activeIndex.value = 0
	else if (activeIndex.value >= length)
		activeIndex.value = length - 1
})

function move(direction: -1 | 1) {
	const length = visibleAds.value.length
	if (length < 2)
		return
	activeIndex.value = (activeIndex.value + direction + length) % length
}
</script>

<template>
<aside v-if="currentAd" class="post-header-ad" aria-label="文章推广">
	<button
		v-if="visibleAds.length > 1"
		class="post-header-ad-control is-previous"
		type="button"
		aria-label="上一条广告"
		@click="move(-1)"
	>
		<Icon name="tabler:chevron-left" />
	</button>

	<NuxtLink
		:key="currentAd.id"
		class="post-header-ad-link"
		:class="{ 'has-image': currentAd.image }"
		:to="href"
		:target="isExternal ? '_blank' : undefined"
		:rel="isExternal ? 'noopener sponsored' : 'sponsored'"
	>
		<span class="post-header-ad-copy">
			<small>{{ currentAd.label || '广告' }}</small>
			<strong>{{ currentAd.title }}</strong>
			<span v-if="currentAd.description">{{ currentAd.description }}</span>
			<span class="post-header-ad-action">
				了解更多
				<Icon name="tabler:arrow-up-right" />
			</span>
		</span>
		<span v-if="currentAd.image" class="post-header-ad-media" aria-hidden="true">
			<img
				class="post-header-ad-image"
				:src="currentAd.image"
				alt=""
				loading="lazy"
				decoding="async"
			>
		</span>
	</NuxtLink>

	<button
		v-if="visibleAds.length > 1"
		class="post-header-ad-control is-next"
		type="button"
		aria-label="下一条广告"
		@click="move(1)"
	>
		<Icon name="tabler:chevron-right" />
	</button>

	<div v-if="visibleAds.length > 1" class="post-header-ad-pagination" aria-hidden="true">
		<span>{{ activeIndex + 1 }}</span>
		<span>/</span>
		<span>{{ visibleAds.length }}</span>
	</div>
</aside>
</template>

<style scoped lang="scss">
.post-header-ad {
	position: relative;
	margin: 1rem;
}

.post-header-ad-link {
	display: grid;
	align-items: stretch;
	overflow: hidden;
	min-height: 9rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 28%, var(--c-border));
	border-radius: 1rem;
	box-shadow: 0 0.85rem 2.4rem color-mix(in srgb, var(--c-bg) 24%, transparent);
	background:
		linear-gradient(120deg, color-mix(in srgb, var(--c-primary-soft) 68%, transparent), transparent 58%),
		radial-gradient(circle at 86% 12%, var(--c-primary-soft), transparent 40%),
		var(--c-bg-2);
	text-decoration: none;
	color: var(--c-text-1);
	transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

	&.has-image {
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 36%);
	}

	&:hover,
	&:focus-visible {
		border-color: color-mix(in srgb, var(--c-primary) 64%, var(--c-border));
		box-shadow: 0 1.1rem 2.8rem color-mix(in srgb, var(--c-bg) 30%, transparent);
		transform: translateY(-2px);
	}
}

.post-header-ad-copy {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	justify-content: center;
	gap: 0.48rem;
	min-width: 0;
	padding: clamp(1.15rem, 3vw, 1.7rem) clamp(3.6rem, 6vw, 5rem);

	small {
		padding: 0.18rem 0.52rem;
		border-radius: 999px;
		background: var(--c-primary-soft);
		font-size: 0.65rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		color: var(--c-primary);
	}

	strong {
		font-family: "Noto Serif SC", serif;
		font-size: clamp(1.08rem, 2.6vw, 1.55rem);
		line-height: 1.4;
	}

	> span:not(.post-header-ad-action) {
		max-width: 38rem;
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

.post-header-ad-media {
	position: relative;
	overflow: hidden;
	min-height: 9rem;

	&::after {
		content: "";
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, var(--c-bg-2), transparent 42%);
	}
}

.post-header-ad-image {
	width: 100%;
	height: 100%;
	transition: transform 0.35s ease;
	object-fit: cover;
}

.post-header-ad-link:hover .post-header-ad-image,
.post-header-ad-link:focus-visible .post-header-ad-image {
	transform: scale(1.035);
}

.post-header-ad-control {
	display: grid;
	place-items: center;
	position: absolute;
	top: 50%;
	width: 2.55rem;
	height: 2.55rem;
	border: 1px solid color-mix(in srgb, var(--c-border) 82%, transparent);
	border-radius: 0.75rem;
	box-shadow: 0 0.4rem 1rem color-mix(in srgb, var(--c-bg) 28%, transparent);
	background: color-mix(in srgb, var(--c-bg-2) 88%, transparent);
	font: inherit;
	font-size: 1.35rem;
	color: var(--c-text-1);
	transform: translateY(-50%);
	cursor: pointer;
	z-index: 2;

	&:hover,
	&:focus-visible {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}

	&.is-previous {
		inset-inline-start: 0.85rem;
	}

	&.is-next {
		inset-inline-end: 0.85rem;
	}
}

.post-header-ad-pagination {
	display: flex;
	gap: 0.18rem;
	position: absolute;
	inset-inline-end: 1rem;
	bottom: 0.72rem;
	padding: 0.18rem 0.48rem;
	border-radius: 999px;
	background: color-mix(in srgb, var(--c-bg-2) 82%, transparent);
	font-size: 0.62rem;
	color: var(--c-text-2);
	z-index: 2;
	font-variant-numeric: tabular-nums;
}

@media (max-width: 680px) {
	.post-header-ad {
		margin: 0.8rem 0.5rem;
	}

	.post-header-ad-link.has-image {
		grid-template-columns: 1fr;
	}

	.post-header-ad-copy {
		padding: 1.1rem 3.6rem;
	}

	.post-header-ad-media {
		order: -1;
		min-height: 7rem;
		max-height: 10rem;

		&::after {
			background: linear-gradient(0deg, var(--c-bg-2), transparent 55%);
		}
	}

	.post-header-ad-control {
		width: 2.25rem;
		height: 2.25rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.post-header-ad-link,
	.post-header-ad-image {
		transition: none;
	}
}
</style>
