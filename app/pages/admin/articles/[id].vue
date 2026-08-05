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
		:diagnostics="editor.diagnostics.value"
		:initial-diagnostic="initialDiagnostic"
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
