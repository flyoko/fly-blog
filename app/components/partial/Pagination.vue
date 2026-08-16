<script setup lang="ts">
const props = defineProps<{
	totalPages: number
	expandPages?: number
	sticky?: boolean
	avoid?: boolean
}>()

const page = defineModel<number>({ required: true })
const pageArr = computed(() => getPaginationIndicator(page.value, props.totalPages, props.expandPages ?? 2))

const paginationEl = useTemplateRef('pagination')
const anchorEl = useTemplateRef('pagination-anchor')
const expand = useElementVisibility(anchorEl)

if (props.avoid) {
	useAvoidTarget(paginationEl, toRef(props, 'avoid'))
}
</script>

<template>
<nav
	ref="pagination"
	class="pagination glass-floating"
	:class="{ sticky, expand }"
	:aria-label="`第${page}页，共${totalPages}页`"
	:style="{ '--collapsed-width': `${pageArr.length * 2 + 6}em` }"
>
	<ZButton
		:disabled="page <= 1"
		class="pagination-button rtl-flip"
		icon="tabler:arrow-left"
		aria-label="上一页"
		@click="page--"
	/>
	<template v-for="i in pageArr" :key="i">
		<button
			v-if="Number.isFinite(i)"
			class="pagination-num"
			:class="{ active: i === page }"
			:aria-label="`第${i}页`"
			@click="page = i"
			v-text="i"
		/>
		<!-- TODO: 点击后自主选择目标页面 -->
		<button v-else disabled class="pagination-num">
			…
		</button>
	</template>
	<ZButton
		:disabled="page >= totalPages"
		class="pagination-button rtl-flip"
		icon="tabler:arrow-right"
		aria-label="下一页"
		@click="page++"
	/>
</nav>
<div ref="pagination-anchor" />
</template>

<style lang="scss" scoped>
.pagination {
	display: flex;
	width: fit-content;
	min-width: min(18rem, calc(100vw - 2rem));
	max-width: calc(100vw - 2rem);
	margin: 1.5rem auto;
	border: 1px solid var(--glass-material-border);
	border-radius: 0.75rem;
	box-shadow:
		0 12px 30px var(--c-surface-shadow),
		inset 0 0 0 1px color-mix(in srgb, var(--glass-material-border) 48%, transparent),
		inset 0 1px 0 var(--c-surface-highlight);
	background:
		linear-gradient(145deg, var(--glass-material-highlight), transparent 40%),
		radial-gradient(105% 160% at 15% -30%, var(--glass-material-tint), transparent 60%),
		var(--glass-material-fill);
	backdrop-filter: none;
	transition: max-width 0.2s var(--max-bezier-to-full);
	font-variant-numeric: tabular-nums;

	&.sticky {
		position: sticky;
		bottom: min(2em, 5%);

		&:not(.expand) {
			max-width: var(--collapsed-width);
			transition-timing-function: var(--max-bezier-to-collapse);
		}
	}

	> .pagination-button {
		width: 3rem;
		border: none;
		border-radius: 0;
		box-shadow: none;
		color: var(--c-text-2);

		&:first-child {
			margin-inline-end: auto;
			border-radius: 0.7rem 0 0 0.7rem;
		}

		&:last-child {
			margin-inline-start: auto;
			border-radius: 0 0.7rem 0.7rem 0;
		}
	}

	> .pagination-num {
		width: 2.5rem;
		height: 2.5rem;
		margin-block: 0.25rem;
		border-radius: 0.5rem;
		transition: background-color 0.2s, color 0.2s;

		&:hover { background-color: var(--c-bg-soft); }

		&:disabled { pointer-events: none; }

		&.active {
			box-shadow: inset 0 0 0 1px var(--c-surface-border);
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
		}
	}
}

@media (prefers-reduced-transparency: reduce) {
	.pagination {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.pagination,
	.pagination > :where(.pagination-button, .pagination-num) {
		transition: none;
	}
}
</style>
