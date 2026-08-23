<script setup lang="ts">
import categoriesRaw from '~~/config/taxonomy/categories.json'

const route = useRoute()
const router = useRouter()
const articleId = computed(() => route.params.id as string)
const editor = useAdminArticleEditor({ isNew: false, articleId: articleId.value })
const categories = categoriesRaw.map(item => item.name)
const notifications = useAdminNotifications()

watch(editor.error, (message) => {
	if (!message || editor.conflict.value)
		return
	if (editor.deleted.value)
		notifications.warning('页面跳转失败', message)
	else
		notifications.error(message, '文章没有保存成功。')
})

watch(editor.success, (message) => {
	if (message)
		notifications.success(editor.deleted.value ? '文章已删除' : '文章已保存', message)
})
const line = Number(route.query.line)
const column = Number(route.query.column)
const initialDiagnostic = ref(
	Number.isInteger(line) && line > 0 && Number.isInteger(column) && column > 0
		? { bodyLine: line, bodyColumn: column }
		: undefined,
)

onMounted(async () => {
	if (!initialDiagnostic.value)
		return
	const { line: _line, column: _column, ...query } = route.query
	await router.replace({ query })
})

useSeoMeta({ title: '编辑文章', robots: 'noindex, nofollow' })
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
		:deleting="editor.deleting.value"
		:deleted="editor.deleted.value"
		:conflict="editor.conflict.value"
		:remote-document="editor.remoteDocument.value"
		:raw-comparison-open="editor.rawComparisonOpen.value"
		:diagnostics="editor.diagnostics.value"
		:initial-diagnostic="initialDiagnostic"
		:draft-status="editor.draftStatus.value"
		@save="editor.save"
		@delete="editor.deleteArticle"
		@navigate="editor.navigate"
		@reload-remote="editor.reloadRemote"
		@compare-raw="editor.compareRaw"
		@close-raw-comparison="editor.closeRawComparison"
	/>
</div>
</template>
