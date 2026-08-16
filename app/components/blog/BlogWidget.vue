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
		:class="{ 'widget-card': card, 'glass-elevated': card, 'with-bg': bgImg, 'scrollcheck-y scrollbar-hidden': shrink }"
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
		transition: filter 0.24s;
		filter: grayscale(0.35) saturate(0.8);

		#blog-aside:hover &,
		&:focus-within,
		#blog-aside.show & {
			filter: grayscale(0) saturate(1);
		}
	}

	&.dim {
		opacity: 0.68;
		transition: filter 0.2s, opacity 0.24s;
		filter: saturate(0.85);

		#blog-aside:hover &,
		&:focus-within,
		#blog-aside.show & {
			opacity: 1;
			filter: none;
		}
	}
}

.widget-header {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.45rem 0.25rem 0.55rem;
	font-size: 0.82em;
	letter-spacing: 0.04em;
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
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--glass-material-border);
		border-radius: 0.75rem;
		box-shadow:
			0 12px 30px var(--c-surface-shadow),
			inset 0 0 0 1px color-mix(in srgb, var(--glass-material-border) 58%, transparent),
			inset 0 1px 0 var(--c-surface-highlight);
		background:
			radial-gradient(190px circle at var(--surface-x) var(--surface-y), color-mix(in srgb, var(--surface-glow-color) 62%, transparent), transparent 72%),
			linear-gradient(145deg, var(--glass-material-highlight), transparent 34%),
			radial-gradient(120% 110% at 8% -12%, var(--glass-material-tint), transparent 50%),
			var(--glass-material-fill);
		backdrop-filter: none;

		:deep(p) {
			padding: 0.2em 0;
		}
	}
}

@media (prefers-reduced-transparency: reduce) {
	.widget-body.widget-card {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.blog-widget.dim,
	.blog-widget.grayscale :where(.iconify, img) {
		transition: none;
	}
}
</style>
