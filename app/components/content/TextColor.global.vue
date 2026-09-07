<script setup lang="ts">
const props = defineProps<{
	color?: string
}>()

const safeColor = computed(() => {
	const value = props.color?.trim().toUpperCase() || ''
	return /^#[0-9A-F]{6}$/u.test(value) ? value : null
})
</script>

<template>
<span
	class="article-text-color"
	:data-article-text-color="safeColor || undefined"
	:style="safeColor ? { color: safeColor } : undefined"
><slot /></span>
</template>
