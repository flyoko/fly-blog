<script setup lang="ts">
import { delay } from 'es-toolkit/promise'

const props = defineProps<{
	excerpt: string
}>()

const appConfig = useAppConfig()

const excerpt = ref(props.excerpt)
const caret = ref('')

if (appConfig.component.excerpt?.animation !== false) {
	excerpt.value = ''
	onMounted(async () => {
		caret.value = appConfig.component.excerpt?.caret ?? '_'
		for (const char of props.excerpt) {
			excerpt.value += char
			await delay(50)
		}
		caret.value = ''
	})
}

if (import.meta.dev) {
	watch(() => props.excerpt, (newExcerpt) => {
		excerpt.value = newExcerpt
	})
}
</script>

<template>
<div class="md-excerpt gradient-card">
	<span class="dynamic"><Icon name="tabler:sparkles-2" />{{ excerpt }}{{ caret }}</span>
	<span class="static"><Icon name="tabler:sparkles-2" />{{ props.excerpt }}</span>
</div>
</template>

<style lang="scss" scoped>
.md-excerpt {
	opacity: 0.6;
	margin: 0.72rem 0.5rem;
	padding: 0.42rem 0.55rem;
	font-size: 0.84em;
	transition: opacity 0.2s;

	> .static {
		opacity: 0;
		pointer-events: none;
		user-select: none;
	}

	> .dynamic {
		position: absolute;
		width: calc(100% - 1rem);
	}

	.iconify {
		margin-inline-end: 0.3em;
	}

	&:hover {
		opacity: 1;
	}
}

@media (max-width: $breakpoint-mobile) {
	.md-excerpt {
		opacity: 0.78;
		margin: 0.5rem var(--mobile-page-gutter);
		padding: 0.52rem 0.65rem;
		border-radius: var(--mobile-surface-radius-inner);
		font-size: 0.82rem;
		line-height: 1.5;
	}
}
</style>
