<script setup lang="ts">
import categoriesRaw from '~~/config/taxonomy/categories.json'

const editor = useAdminArticleEditor({ isNew: true })
const categories = categoriesRaw.map(item => item.name)
const notifications = useAdminNotifications()

watch(editor.error, (message) => {
	if (message && !editor.conflict.value)
		notifications.error(message, '文章没有保存成功。')
})

watch(editor.success, (message) => {
	if (message)
		notifications.success('文章已保存', message)
})

useSeoMeta({ title: '新建文章', robots: 'noindex, nofollow' })
</script>

<template>
<div>
	<div v-if="editor.loading.value" class="admin-skeleton admin-editor-loading" />
	<AdminArticleEditor
		v-else
		v-model="editor.document.value"
		:articles="editor.articles.value"
		:categories="categories"
		:saving="editor.saving.value"
		:conflict="editor.conflict.value"
		:remote-document="editor.remoteDocument.value"
		:raw-comparison-open="editor.rawComparisonOpen.value"
		:diagnostics="editor.diagnostics.value"
		:draft-status="editor.draftStatus.value"
		is-new
		@save="editor.save"
		@navigate="editor.navigate"
		@reload-remote="editor.reloadRemote"
		@regenerate-path="editor.regenerateNewPath"
		@compare-raw="editor.compareRaw"
		@close-raw-comparison="editor.closeRawComparison"
	/>
</div>
</template>
