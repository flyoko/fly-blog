<script setup lang="ts">
const emit = defineEmits<{
	visibilityChange: [visible: boolean]
}>()

const route = useRoute()
const { post } = useArticle()
const widgetNames = computed<WidgetName[]>(() => {
	if (route.path === '/')
		return ['blog-stats', 'blog-tech', 'comm-group']
	if (route.path === '/archive')
		return ['blog-stats', 'blog-log']
	if (route.path === '/preview')
		return ['blog-log']
	if (post.value)
		return (post.value.meta?.aside as WidgetName[] | undefined) ?? ['toc']
	return []
})
const { widgets } = useWidgets(widgetNames)

watch(() => widgets.value.length, length => emit('visibilityChange', length > 0), { immediate: true })
</script>

<template>
<component :is="widget.comp" v-for="widget in widgets" :key="widget.name" />
</template>
