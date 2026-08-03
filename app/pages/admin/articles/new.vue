<script setup lang="ts">
import categoriesRaw from '~~/config/taxonomy/categories.json'

const editor = useAdminArticleEditor({ isNew: true })
const categories = categoriesRaw.map(item => item.name)

useSeoMeta({ title: '新建文章', robots: 'noindex, nofollow' })
</script>

<template>
<div>
	<p v-if="editor.error.value" class="admin-error">
		{{ editor.error.value }}
	</p>
	<p v-if="editor.success.value" class="admin-success">
		{{ editor.success.value }}
	</p>
	<div v-if="editor.loading.value" class="admin-skeleton admin-editor-loading" />
	<AdminArticleEditor
		v-else
		v-model="editor.document.value"
		:articles="editor.articles.value"
		:categories="categories"
		:saving="editor.saving.value"
		:conflict="editor.conflict.value"
		:draft-status="editor.draftStatus.value"
		is-new
		@save="editor.save"
		@navigate="editor.navigate"
		@reload-remote="editor.reloadRemote"
		@compare-raw="editor.compareRaw"
	/>
</div>
</template>
