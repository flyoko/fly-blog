<script setup lang="ts">
import categoriesRaw from '~~/config/taxonomy/categories.json'

const route = useRoute()
const router = useRouter()
const articleId = computed(() => route.params.id as string)
const editor = useAdminArticleEditor({ isNew: false, articleId: articleId.value })
const categories = categoriesRaw.map(item => item.name)
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
		:remote-document="editor.remoteDocument.value"
		:raw-comparison-open="editor.rawComparisonOpen.value"
		:diagnostics="editor.diagnostics.value"
		:initial-diagnostic="initialDiagnostic"
		:draft-status="editor.draftStatus.value"
		@save="editor.save"
		@navigate="editor.navigate"
		@reload-remote="editor.reloadRemote"
		@compare-raw="editor.compareRaw"
		@close-raw-comparison="editor.closeRawComparison"
	/>
</div>
</template>
