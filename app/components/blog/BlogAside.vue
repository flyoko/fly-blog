<script setup lang="ts">
const props = defineProps<{
	hasContent: boolean
}>()

const layoutStore = useLayoutStore()

watch(() => props.hasContent, (hasContent) => {
	if (!hasContent && layoutStore.state === 'aside')
		layoutStore.close()
})
</script>

<template>
<BlogMask
	:show="hasContent && layoutStore.state === 'aside'"
	class="aside-mask widescreen-only"
	@click="layoutStore.close()"
/>

<!-- 不能用 Transition 实现弹出收起动画，因为宽屏状态始终显示 -->
<!-- 如果为空数组则隐藏 -->
<aside id="blog-aside" :class="{ 'show': layoutStore.state === 'aside', 'has-content': hasContent }" aria-label="补充信息">
	<slot />
</aside>
</template>

<style lang="scss" scoped>
#blog-aside {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	overflow: auto;
	padding: 0.5rem;
	z-index: calc(var(--z-index-popover) + 5);

	@media (max-width: $breakpoint-widescreen) {
		position: fixed;
		visibility: hidden;
		inset-inline-end: 0;
		top: 0;
		width: min(20rem, calc(100vw - 3rem));
		height: 100dvh;
		max-width: calc(100vw - 3rem);
		max-height: 100dvh;
		padding-bottom: var(--mobile-content-clearance);
		background-color: var(--c-bg-1);
		background-color: color-mix(in srgb, var(--c-bg-1) 96%, transparent);
		transform: var(--transform-end-far);
		transition:
			transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
			visibility 0s linear 0.24s;
		pointer-events: none;

		> :deep(.blog-widget) {
			padding: 0.65rem;
			border: 1px solid var(--glass-elevated-border);
			border-radius: 0.75rem;
			box-shadow:
				0 14px 36px var(--c-surface-shadow),
				inset 0 0 0 1px color-mix(in srgb, var(--glass-elevated-border) 52%, transparent),
				inset 0 1px 0 var(--c-surface-highlight);
			background:
				linear-gradient(145deg, var(--glass-elevated-highlight), transparent 36%),
				radial-gradient(120% 110% at 10% -12%, var(--glass-elevated-tint), transparent 52%),
				var(--glass-elevated-fill);
			backdrop-filter: var(--glass-elevated-filter);
		}

		&.show {
			visibility: visible;
			transform: none;
			transition-delay: 0s;
			pointer-events: auto;
		}
	}

	&:not(.has-content) {
		display: none;
	}
}

.aside-mask {
	z-index: calc(var(--z-index-popover) + 4);
}

@media (prefers-reduced-transparency: reduce) {
	#blog-aside > :deep(.blog-widget) {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	#blog-aside {
		transition: none;
	}
}
</style>
