<script setup lang="ts">
import categoriesRaw from '~~/config/taxonomy/categories.json'

const route = useRoute()
const articleId = computed(() => route.params.id as string)
const editor = useAdminArticleEditor({ isNew: false, articleId: articleId.value })
const categories = categoriesRaw.map(item => item.name)

useSeoMeta({ title: '编辑文章', robots: 'noindex, nofollow' })
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
		@save="editor.save"
		@navigate="editor.navigate"
		@reload-remote="editor.reloadRemote"
		@compare-raw="editor.compareRaw"
	/>

	<Teleport to="body">
		<div v-if="editor.rawComparisonOpen.value" class="admin-modal" role="dialog" aria-modal="true" aria-label="比较原始 Markdown">
			<button class="admin-modal-backdrop" type="button" aria-label="关闭比较" @click="editor.rawComparisonOpen.value = false" />
			<section class="admin-modal-panel admin-raw-compare">
				<header class="admin-modal-header">
					<div><span class="admin-badge">冲突比较</span><h2>原始 Markdown</h2></div>
					<button class="admin-icon-button" type="button" aria-label="关闭" @click="editor.rawComparisonOpen.value = false">
						<Icon name="tabler:x" />
					</button>
				</header>
				<div class="admin-compare-grid">
					<div><strong>本地草稿</strong><pre>{{ editor.document.value.body }}</pre></div>
					<div><strong>远端版本</strong><pre>{{ editor.remoteDocument.value?.body || '无法读取远端内容' }}</pre></div>
				</div>
			</section>
		</div>
	</Teleport>
</div>
</template>
