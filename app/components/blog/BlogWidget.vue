<script setup lang="ts">
defineProps<{
	title?: string
	card?: boolean
	shrink?: boolean
	grayscale?: boolean
	dim?: boolean
	bgImg?: string
	bgAside?: boolean
}>()

const body = useTemplateRef('widget-body')

defineExpose({ body })
</script>

<template>
<section
	class="blog-widget"
	:class="{ shrink, grayscale, dim }"
>
	<header v-if="title || $slots.title || $slots.action" class="widget-header text-creative">
		<h2 class="widget-title">
			<slot name="title">
				{{ title }}
			</slot>
		</h2>
		<span v-if="$slots.action" class="seperator" />
		<slot name="action" />
	</header>

	<div
		ref="widget-body"
		class="widget-body"
		:class="{ 'widget-card': card, 'with-bg': bgImg, 'scrollcheck-y scrollbar-hidden': shrink }"
	>
		<NuxtImg v-if="bgImg" class="bg-img" :class="{ 'bg-right': bgAside }" :src="bgImg" alt="" />
		<slot />
	</div>
</section>
</template>

<style lang="scss" scoped>
.blog-widget {
	flex-shrink: 1;
	font-size: 0.9em;

	&.shrink {
		display: flex;
		flex-direction: column;
		overflow: auto;
	}

	&.grayscale :where(.iconify, img) {
		transition: filter 0.2s;
		filter: grayscale(0.8);

		#blog-aside:hover &,
		&:focus-within,
		#blog-aside.show & {
			filter: grayscale(0);
		}
	}

	&.dim {
		transition: filter 0.2s;
		filter: saturate(0.85);

		#blog-aside:hover &,
		&:focus-within,
		#blog-aside.show & {
			filter: none;
		}
	}
}

.widget-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem;
	color: var(--c-text-2);

	> .seperator {
		flex-grow: 1;
	}

	> :deep(a) {
		transition: color 0.2s;

		&[href]:hover {
			color: var(--c-primary);
		}
	}
}

.widget-title {
	margin: 0;
	font: inherit;

	&:empty {
		display: none;
	}
}

.widget-body {
	overscroll-behavior: contain;

	&.with-bg {
		contain: paint; // overflow hidden + position relative
		z-index: 0;

		> .bg-img {
			position: absolute;
			opacity: 0.2;
			inset: 0;
			width: 100%;
			height: 100%;
			object-fit: cover;
			pointer-events: none;
			z-index: -1;

			&.bg-right {
				inset-inline-start: 50%;
				width: 50%;
				mask-image: linear-gradient(to var(--end), transparent, #FFF 50%);
			}
		}
	}

	&.widget-card {
		padding: 0.5rem 0.8rem;
		border-radius: 0.8rem;
		background-color: var(--c-bg-2);

		:deep(p) {
			padding: 0.2em 0;
		}
	}
}
</style>
