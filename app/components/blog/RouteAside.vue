<script setup lang="ts">
const emit = defineEmits<{
	visibilityChange: [visible: boolean]
}>()

const appConfig = useAppConfig()
const route = useRoute()
const { post } = useArticle()
const isArticlePage = computed(() => route.meta.articlePage === true)
const widgetNames = computed<WidgetName[]>(() => {
	if (route.path === '/') {
		const homeWidgets: WidgetName[] = ['blog-stats', 'weather', 'domain-status']
		if (appConfig.profile.showGitHub)
			homeWidgets.push('comm-group')
		return homeWidgets
	}
	if (route.path === '/archive')
		return ['blog-stats', 'blog-log']
	if (route.path === '/preview')
		return ['blog-log']
	if (isArticlePage.value && post.value)
		return (post.value.meta?.aside as WidgetName[] | undefined) ?? ['toc']
	return []
})
const { widgets } = useWidgets(widgetNames)

watch(() => widgets.value.length, length => emit('visibilityChange', length > 0), { immediate: true })
</script>

<template>
<component :is="widget.comp" v-for="widget in widgets" :key="widget.name" />
</template>
