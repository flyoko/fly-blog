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
		inset-inline-end: 0;
		top: 0;
		width: min(320px, 100vw);
		height: 100dvh;
		max-width: 100%;
		max-height: 100dvh;
		padding-bottom: calc(5rem + env(safe-area-inset-bottom));
		background-color: var(--c-bg-1);
		background-color: color-mix(in srgb, var(--c-bg-1) 96%, transparent);
		transform: var(--transform-end-far);
		transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);

		> :deep(.blog-widget) {
			padding: 0.65rem;
			border-radius: 0.75rem;
			box-shadow:
				0 14px 36px var(--c-surface-shadow),
				inset 0 0 0 1px var(--c-surface-line),
				inset 0 1px 0 var(--c-surface-highlight);
			background-color: var(--c-surface-fill);
			backdrop-filter: blur(16px) saturate(114%);
		}

		&.show {
			transform: none;
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
		background-color: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	#blog-aside {
		transition: none;
	}
}
</style>
