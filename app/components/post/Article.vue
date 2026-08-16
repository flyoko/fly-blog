<script setup lang="ts">
import type { ArticleProps } from '~/types/article'

const props = defineProps<{ useUpdated?: boolean } & ArticleProps>()
const showAllDate = isTimeDiffSignificant(props.date, props.updated)
</script>

<template>
<UtilLink class="article-card card upraise">
	<NuxtImg
		v-if="image"
		class="article-cover"
		:src="image"
		:alt="title"
		loading="lazy"
		decoding="async"
		fetchpriority="low"
	/>
	<article>
		<h2 class="article-title text-creative">
			{{ title }}
		</h2>

		<p v-if="description" class="article-description">
			{{ description }}
		</p>

		<div class="article-info">
			<UtilDate
				v-if="date && (showAllDate || !useUpdated || !updated)"
				:date
				icon="tabler:pencil-minus"
			/>

			<UtilDate
				v-if="updated && (showAllDate || useUpdated)"
				:class="{ 'use-updated': useUpdated }"
				:date="updated"
				icon="tabler:clock-edit"
			/>

			<span
				v-if="categories"
				class="article-category"
				:style="{ '--category-color': getCategoryColor(categories[0]) }"
			>
				<Icon :name="getCategoryIcon(categories[0])" />
				{{ categories[0] }}
			</span>

			<span v-if="readingTime?.words" class="article-words">
				<Icon name="tabler:pilcrow" />
				{{ formatNumber(readingTime?.words) }}字
			</span>
		</div>
	</article>
</UtilLink>
</template>

<style lang="scss" scoped>
.article-card {
	container-type: inline-size;
	content-visibility: auto;
	contain-intrinsic-size: auto 8.5rem;
	position: relative;
	margin: 1.1em 0;
	border-radius: 0.875rem;
	color: var(--c-text);
	animation: float-in 0.28s var(--delay) backwards;

	> article {
		display: grid;
		gap: 0.55em;
		padding: 1.05rem 1.15rem;
	}
}

.article-info {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5em clamp(1em, 5%, 1.5em);
	font-size: 0.8em;
	color: var(--c-text-1);

	&:empty {
		display: none;
	}

	.use-updated {
		order: -1;
	}
}

.article-title {
	font-size: 1.18em;
	letter-spacing: -0.012em;
	color: var(--c-text);
}

.article-description {
	font-size: 0.9em;
	line-height: 1.65;
	color: var(--c-text-2);
}

.article-category {
	text-decoration-color: var(--category-color);
	text-decoration-line: underline;
	text-decoration-thickness: 0.12em;
	color: var(--c-text-1);
	text-underline-offset: 0.2em;
}

@media not (max-width: $breakpoint-widescreen) {
	.article-card {
		margin: 0.78rem 0;
		border-radius: 0.76rem;

		> article {
			gap: 0.45em;
			padding: 0.85rem 0.95rem;
		}
	}

	.article-title {
		font-size: 1.08em;
	}

	.article-description {
		font-size: 0.84em;
		line-height: 1.58;
	}

	.article-info {
		font-size: 0.75em;
	}
}

@media (prefers-reduced-motion: reduce) {
	.article-card {
		animation: none;
	}
}

.article-cover {
	position: absolute;
	opacity: 0.8;
	inset-inline-end: 0;
	top: 0;
	width: calc(40% + 2em);
	height: 100%;
	margin: 0;
	mask-image: linear-gradient(to var(--end), transparent, #FFF 50%);
	transition: opacity 0.2s;
	object-fit: cover;

	:hover > & {
		opacity: 1;
	}

	& + article {
		position: relative;
		width: 60%;
	}

	@mixin cover-narrow {
		position: revert;
		width: 100%;
		height: auto;
		max-width: none;
		max-height: 256px;
		aspect-ratio: 2.4;
		margin-bottom: -10%;
		mask-image: linear-gradient(#FFF 50%, transparent);

		& + article {
			width: auto;

			> .article-title {
				text-shadow: 0 0 0.2em var(--ld-bg-card), 0 0 0.5em var(--ld-bg-card), 0 0 1em var(--ld-bg-card);
			}
		}
	}

	@media (max-width: $breakpoint-phone) {
		@include cover-narrow;
	}

	@container (max-width: #{$breakpoint-phone}) {
		@include cover-narrow;
	}
}
</style>
