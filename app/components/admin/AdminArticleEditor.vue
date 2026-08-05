<script setup lang="ts">
import type { ArticleDiagnostic } from '#shared/admin/article-validation'
import type { ArticleDocument, ArticleSummary } from '#shared/admin/articles'
import type { MediaObjectDto } from '#shared/admin/media'
import type { MarkdownEdit, MarkdownHistorySnapshot } from '~/composables/useAdminDraft'
import { isChunkLoadError } from '#shared/admin/feedback'
import {
	applyMarkdownEdit,
	createMarkdownHistory,
	insertMacWindowBlock,
	insertMarkdownImage,
	recordMarkdownHistory,
	stepMarkdownHistory,
	updateArticleFrontmatter,
	updateMarkdownHistorySelection,
} from '~/composables/useAdminDraft'

const props = withDefaults(defineProps<{
	modelValue: ArticleDocument
	remoteDocument?: ArticleDocument | null
	articles?: ArticleSummary[]
	categories: string[]
	saving?: boolean
	conflict?: boolean
	isNew?: boolean
	draftStatus?: string
	diagnostics?: ArticleDiagnostic[]
	initialDiagnostic?: Pick<ArticleDiagnostic, 'bodyLine' | 'bodyColumn'>
	rawComparisonOpen?: boolean
}>(), {
	remoteDocument: null,
	articles: () => [],
	saving: false,
	conflict: false,
	isNew: false,
	draftStatus: '',
	diagnostics: () => [],
	initialDiagnostic: undefined,
	rawComparisonOpen: false,
})

const emit = defineEmits<{
	'update:modelValue': [document: ArticleDocument]
	'save': [mode: 'direct' | 'pull_request']
	'navigate': [id: string]
	'reloadRemote': []
	'regeneratePath': []
	'compareRaw': []
	'closeRawComparison': []
}>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const notifications = useAdminNotifications()
const mediaPickerOpen = ref(false)
const focusMode = useLocalStorage('fly_admin_editor_focus_mode', false)
const previewLoading = ref(false)
const previewMarkdown = ref('')
const previewRevision = ref(0)
const editorHistory = ref(createMarkdownHistory(props.modelValue.body))
let previewTimer: ReturnType<typeof setTimeout> | undefined

const documentModel = computed({
	get: () => props.modelValue,
	set: value => emit('update:modelValue', value),
})

const tagsText = computed({
	get: () => (documentModel.value.frontmatter.tags ?? []).join(', '),
	set: value => updateMetadata({
		tags: value.split(/[,，]/u).map(tag => tag.trim()).filter(Boolean),
	}),
})

const contentLength = computed(() => documentModel.value.body
	.replace(/```[\s\S]*?```/gu, '')
	.replace(/[#>*_`[\]()!~-]/gu, '')
	.replace(/\s/gu, '')
	.length)
const readingMinutes = computed(() => Math.max(1, Math.ceil(contentLength.value / 400)))
const canSave = computed(() => Boolean(documentModel.value.frontmatter.title?.trim() && documentModel.value.body.trim()))

function rawMarkdown(value: ArticleDocument | null | undefined) {
	if (!value)
		return '远端版本尚未加载。'
	const frontmatter = Object.entries(value.frontmatter)
		.filter(([, field]) => field !== undefined)
		.map(([key, field]) => `${key}: ${JSON.stringify(field)}`)
		.join('\n')
	return ['---', frontmatter, '---', '', value.body].join('\n')
}

function focusDiagnostic(diagnostic: Pick<ArticleDiagnostic, 'bodyLine' | 'bodyColumn'>) {
	const lines = documentModel.value.body.split('\n')
	const lineOffset = lines
		.slice(0, diagnostic.bodyLine - 1)
		.reduce((total, line) => total + line.length + 1, 0)
	const position = lineOffset + diagnostic.bodyColumn - 1
	nextTick(() => {
		textarea.value?.focus()
		textarea.value?.setSelectionRange(position, position)
	})
}
const directSaveLabel = computed(() => documentModel.value.frontmatter.draft ? '保存草稿' : '发布文章')

const formattingActions: Array<{
	label: string
	ariaLabel?: string
	icon: string
	edit: MarkdownEdit | 'mac-window'
}> = [
	{ label: '二级标题', ariaLabel: 'H2', icon: 'tabler:h-2', edit: { type: 'line-prefix', prefix: '## ', placeholder: '二级标题' } },
	{ label: '三级标题', ariaLabel: 'H3', icon: 'tabler:h-3', edit: { type: 'line-prefix', prefix: '### ', placeholder: '三级标题' } },
	{ label: '粗体', icon: 'tabler:bold', edit: { type: 'wrap', before: '**', after: '**', placeholder: '粗体文本' } },
	{ label: '斜体', icon: 'tabler:italic', edit: { type: 'wrap', before: '*', after: '*', placeholder: '斜体文本' } },
	{ label: '链接', icon: 'tabler:link', edit: { type: 'wrap', before: '[', after: '](https://)', placeholder: '链接文字' } },
	{ label: '引用', icon: 'tabler:blockquote', edit: { type: 'line-prefix', prefix: '> ', placeholder: '引用内容' } },
	{ label: '行内代码', icon: 'tabler:code', edit: { type: 'wrap', before: '`', after: '`', placeholder: '代码' } },
	{ label: '代码块', icon: 'tabler:code-dots', edit: { type: 'block', before: '```text\n', after: '\n```', placeholder: '代码' } },
	{ label: '无序列表', icon: 'tabler:list', edit: { type: 'line-prefix', prefix: '- ', placeholder: '列表项' } },
	{ label: '有序列表', icon: 'tabler:list-numbers', edit: { type: 'line-prefix', prefix: '1. ', placeholder: '列表项' } },
	{ label: '分隔线', icon: 'tabler:separator-horizontal', edit: { type: 'insert', value: '\n\n---\n\n' } },
	{ label: '插入 macOS 窗口', icon: 'tabler:browser', edit: 'mac-window' },
]

function updateBody(body: string) {
	documentModel.value = { ...documentModel.value, body }
}

function editorSelection() {
	const start = textarea.value?.selectionStart ?? documentModel.value.body.length
	const end = textarea.value?.selectionEnd ?? start
	return { start, end }
}

function restoreEditorSnapshot(snapshot: MarkdownHistorySnapshot) {
	updateBody(snapshot.body)
	nextTick(() => {
		textarea.value?.focus()
		textarea.value?.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd)
	})
}

function recordEditorSnapshot(
	snapshot: MarkdownHistorySnapshot,
	group: string | null = null,
) {
	editorHistory.value = recordMarkdownHistory(editorHistory.value, snapshot, { group })
	restoreEditorSnapshot(snapshot)
}

function onEditorInput(event: Event) {
	const target = event.target as HTMLTextAreaElement
	const inputEvent = event as InputEvent
	editorHistory.value = recordMarkdownHistory(editorHistory.value, {
		body: target.value,
		selectionStart: target.selectionStart,
		selectionEnd: target.selectionEnd,
	}, { group: inputEvent.inputType || 'input' })
	updateBody(target.value)
}

function onEditorKeydown(event: KeyboardEvent) {
	if (!(event.metaKey || event.ctrlKey) || event.altKey)
		return
	const key = event.key.toLowerCase()
	const direction = key === 'y' || (key === 'z' && event.shiftKey)
		? 1
		: key === 'z'
			? -1
			: null
	if (!direction)
		return
	event.preventDefault()
	const result = stepMarkdownHistory(editorHistory.value, direction)
	if (!result)
		return
	editorHistory.value = result.history
	restoreEditorSnapshot(result.snapshot)
}

function updatePath(path: string) {
	documentModel.value = { ...documentModel.value, path }
}

function updateMetadata(patch: Partial<{
	title: string
	description: string
	categories: string[]
	tags: string[]
	draft: boolean
	image: string
	date: string
	updated: string
}>) {
	const current = documentModel.value.frontmatter
	documentModel.value = updateArticleFrontmatter(documentModel.value, {
		title: patch.title ?? current.title ?? '',
		description: patch.description ?? current.description,
		categories: patch.categories ?? current.categories ?? [],
		tags: patch.tags ?? current.tags ?? [],
		draft: patch.draft ?? Boolean(current.draft),
		image: patch.image ?? current.image,
		date: patch.date ?? current.date,
		updated: patch.updated ?? current.updated,
	})
}

function toggleCategory(category: string) {
	const categories = new Set(documentModel.value.frontmatter.categories ?? [])
	if (categories.has(category))
		categories.delete(category)
	else
		categories.add(category)
	updateMetadata({ categories: [...categories] })
}

function insertMedia(media: MediaObjectDto) {
	const { start, end } = editorSelection()
	editorHistory.value = updateMarkdownHistorySelection(editorHistory.value, start, end)
	const result = insertMarkdownImage(documentModel.value.body, start, end, media.originalName, media.url)
	recordEditorSnapshot({
		body: result.body,
		selectionStart: result.cursor,
		selectionEnd: result.cursor,
	})
}

function applyEditorEdit(edit: MarkdownEdit | 'mac-window') {
	const { start, end } = editorSelection()
	editorHistory.value = updateMarkdownHistorySelection(editorHistory.value, start, end)
	const result = edit === 'mac-window'
		? insertMacWindowBlock(documentModel.value.body, start, end)
		: applyMarkdownEdit(documentModel.value.body, start, end, edit)
	recordEditorSnapshot(result)
}

function onSaveShortcut(event: KeyboardEvent) {
	if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's')
		return
	event.preventDefault()
	if (!props.saving && canSave.value)
		emit('save', 'direct')
}

function onPreviewError(error: unknown) {
	notifications.warning(
		'预览暂时没有更新',
		isChunkLoadError(error)
			? '页面资源正在恢复，正文已安全保存在这台设备。'
			: '正文已安全保存在这台设备，可以继续写作或稍后重试。',
	)
}

function retryPreview(clearError: () => void) {
	clearError()
	previewRevision.value += 1
	previewMarkdown.value = documentModel.value.body
}

onMounted(() => window.addEventListener('keydown', onSaveShortcut))

watch(
	() => `${documentModel.value.path}::${documentModel.value.sha || 'new'}`,
	() => {
		editorHistory.value = createMarkdownHistory(documentModel.value.body)
	},
)

watch(() => documentModel.value.body, (body) => {
	const current = editorHistory.value.entries[editorHistory.value.index]
	if (current?.body !== body) {
		const { start, end } = editorSelection()
		editorHistory.value = createMarkdownHistory(body, start, end)
	}
})

watch(
	() => props.initialDiagnostic,
	(diagnostic) => {
		if (diagnostic)
			focusDiagnostic(diagnostic)
	},
	{ immediate: true, flush: 'post' },
)

defineExpose({ focusDiagnostic })

watch(() => documentModel.value.body, (body) => {
	if (previewTimer)
		clearTimeout(previewTimer)
	previewLoading.value = true
	previewTimer = setTimeout(() => {
		previewMarkdown.value = body
		previewLoading.value = false
	}, 300)
}, { immediate: true })

onBeforeUnmount(() => {
	window.removeEventListener('keydown', onSaveShortcut)
	if (previewTimer)
		clearTimeout(previewTimer)
})
</script>

<template>
<div class="admin-editor-shell" :class="{ 'is-focus-mode': focusMode }">
	<h1 class="visually-hidden">
		{{ isNew ? '新建文章' : `编辑文章：${documentModel.frontmatter.title || '未命名文章'}` }}
	</h1>
	<aside class="admin-editor-list">
		<header>
			<div>
				<span>内容</span>
				<strong>文章列表</strong>
			</div>
			<NuxtLink class="admin-icon-button" to="/admin/articles/new" aria-label="新建文章">
				<Icon name="tabler:plus" />
			</NuxtLink>
		</header>
		<nav>
			<button
				v-for="article in articles"
				:key="article.id"
				class="admin-editor-list-item"
				:class="{ 'is-active': article.path === documentModel.path }"
				type="button"
				@click="emit('navigate', article.id)"
			>
				<strong>{{ article.title }}</strong>
				<span>{{ article.draft ? '草稿' : article.date || '未设置日期' }}</span>
			</button>
			<p v-if="!articles.length" class="admin-muted-copy">
				暂时没有其他文章。
			</p>
		</nav>
	</aside>

	<section class="admin-editor-center">
		<div v-if="conflict" class="admin-conflict-banner">
			<div>
				<strong>{{ isNew ? '仓库路径已经存在' : '远端文章已经变化' }}</strong>
				<span>{{ isNew ? '这个路径已被另一篇文章使用。旧文章已受到保护，当前标题、正文和图片都还在。换一个新路径即可继续发布。' : '当前草稿仍保留在浏览器中，请选择如何继续。' }}</span>
			</div>
			<div class="admin-conflict-actions">
				<button v-if="isNew" class="admin-button admin-button-primary" type="button" @click="emit('regeneratePath')">
					<Icon name="tabler:wand" />
					换用安全新路径
				</button>
				<button class="admin-button" type="button" @click="emit('reloadRemote')">
					{{ isNew ? '在新标签打开已有文章' : '重新加载远端' }}
				</button>
				<template v-if="!isNew">
					<button class="admin-button" type="button" @click="emit('compareRaw')">
						比较原始 Markdown
					</button>
					<button class="admin-button admin-button-primary" type="button" :disabled="saving" @click="emit('save', 'pull_request')">
						{{ saving ? '正在提交…' : '改用 PR 发布' }}
					</button>
				</template>
			</div>
		</div>
		<section v-if="diagnostics.length" class="admin-error" role="alert" aria-label="文章诊断">
			<strong>文章格式需要修正</strong>
			<button v-for="diagnostic in diagnostics" :key="`${diagnostic.code}-${diagnostic.bodyLine}-${diagnostic.bodyColumn}`" class="admin-button" type="button" @click="focusDiagnostic(diagnostic)">
				第 {{ diagnostic.bodyLine }} 行：{{ diagnostic.message }}（{{ diagnostic.suggestion }}）
			</button>
		</section>

		<header class="admin-editor-toolbar">
			<div class="admin-editor-state">
				<span class="admin-badge">{{ isNew ? '新文章' : '编辑文章' }}</span>
				<span class="admin-editor-state-copy">
					<strong>{{ documentModel.frontmatter.draft ? '仅自己可见' : '准备公开' }}</strong>
					<small>{{ draftStatus }}</small>
				</span>
				<span class="admin-editor-metrics">{{ contentLength }} 字 · 约 {{ readingMinutes }} 分钟</span>
			</div>
			<div class="admin-editor-actions">
				<button class="admin-button" type="button" :aria-pressed="focusMode" @click="focusMode = !focusMode">
					<Icon :name="focusMode ? 'tabler:layout-sidebar-right-expand' : 'tabler:focus-2'" />
					{{ focusMode ? '退出专注' : '专注写作' }}
				</button>
				<button class="admin-button" type="button" @click="mediaPickerOpen = true">
					<Icon name="tabler:photo-plus" />
					插入媒体
				</button>
				<button class="admin-button" type="button" :disabled="saving || !canSave" @click="emit('save', 'pull_request')">
					<Icon name="tabler:git-pull-request" />
					提交审核
				</button>
				<button class="admin-button admin-button-primary" type="button" :disabled="saving || !canSave" title="快捷键：⌘/Ctrl + S" @click="emit('save', 'direct')">
					<Icon :name="documentModel.frontmatter.draft ? 'tabler:device-floppy' : 'tabler:send'" />
					{{ saving ? '正在保存…' : directSaveLabel }}
				</button>
			</div>
		</header>

		<div class="admin-format-toolbar" role="toolbar" aria-label="Markdown 格式工具">
			<button
				v-for="action in formattingActions"
				:key="action.label"
				class="admin-format-button"
				type="button"
				:aria-label="action.ariaLabel || action.label"
				:title="action.label"
				@click="applyEditorEdit(action.edit)"
			>
				<Icon :name="action.icon" />
				<span>{{ action.label }}</span>
			</button>
		</div>

		<div class="admin-editor-workspace">
			<div class="admin-editor-pane">
				<label class="admin-field admin-field-grow">
					<span>Markdown 正文</span>
					<textarea
						ref="textarea"
						:value="documentModel.body"
						spellcheck="false"
						placeholder="开始写作…"
						@input="onEditorInput"
						@keydown="onEditorKeydown"
					/>
				</label>
			</div>
			<div class="admin-editor-pane admin-editor-preview">
				<div class="admin-preview-header">
					<span>实时预览</span>
					<small v-if="previewLoading">解析中…</small>
				</div>
				<NuxtErrorBoundary
					v-if="previewMarkdown"
					@error="onPreviewError"
				>
					<MDC
						:key="previewRevision"
						:value="previewMarkdown"
						tag="article"
						class="article admin-preview-content"
					/>
					<template #error="{ clearError }">
						<div class="admin-preview-fallback" role="status">
							<Icon name="tabler:refresh-alert" aria-hidden="true" />
							<strong>预览暂时没有更新</strong>
							<p>正文仍会自动保存在这台设备，不影响继续写作。</p>
							<button class="admin-button" type="button" @click="retryPreview(clearError)">
								<Icon name="tabler:refresh" aria-hidden="true" />重新加载预览
							</button>
						</div>
					</template>
				</NuxtErrorBoundary>
				<div v-else class="admin-preview-fallback admin-preview-empty">
					<Icon name="tabler:file-text" aria-hidden="true" />
					<strong>开始写作后，这里会显示预览</strong>
				</div>
			</div>
		</div>
	</section>

	<aside class="admin-editor-meta">
		<h2>文章信息</h2>
		<label class="admin-field">
			<span>标题</span>
			<input
				:value="documentModel.frontmatter.title || ''"
				type="text"
				placeholder="文章标题"
				@input="updateMetadata({ title: ($event.target as HTMLInputElement).value })"
			>
		</label>
		<label class="admin-field">
			<span>仓库路径</span>
			<input
				:value="documentModel.path"
				type="text"
				:disabled="!isNew"
				placeholder="content/posts/2026/example.md"
				@input="updatePath(($event.target as HTMLInputElement).value)"
			>
		</label>
		<label class="admin-field">
			<span>摘要</span>
			<textarea
				:value="documentModel.frontmatter.description || ''"
				rows="3"
				placeholder="简短介绍这篇文章"
				@input="updateMetadata({ description: ($event.target as HTMLTextAreaElement).value })"
			/>
		</label>
		<div class="admin-field">
			<span>分类</span>
			<div class="admin-chip-list">
				<button
					v-for="category in categories"
					:key="category"
					class="admin-chip"
					:class="{ 'is-selected': documentModel.frontmatter.categories?.includes(category) }"
					type="button"
					@click="toggleCategory(category)"
				>
					{{ category }}
				</button>
			</div>
		</div>
		<label class="admin-field">
			<span>标签</span>
			<input v-model="tagsText" type="text" placeholder="Nuxt, Cloudflare">
		</label>
		<label class="admin-field">
			<span>封面地址</span>
			<input
				:value="documentModel.frontmatter.image || ''"
				type="url"
				placeholder="https://media…"
				@input="updateMetadata({ image: ($event.target as HTMLInputElement).value })"
			>
		</label>
		<label class="admin-switch-row">
			<input
				:checked="Boolean(documentModel.frontmatter.draft)"
				type="checkbox"
				@change="updateMetadata({ draft: ($event.target as HTMLInputElement).checked })"
			>
			<span><strong>保存为草稿</strong><small>前台不会公开展示</small></span>
		</label>
	</aside>

	<AdminMediaPicker :open="mediaPickerOpen" kind="image" @close="mediaPickerOpen = false" @select="insertMedia" />

	<Teleport to="body">
		<div v-if="rawComparisonOpen" class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="article-raw-comparison-title">
			<div class="admin-modal-backdrop" aria-hidden="true" @click="emit('closeRawComparison')" />
			<section class="admin-modal-panel admin-article-comparison">
				<header>
					<div>
						<span>版本比较</span>
						<h2 id="article-raw-comparison-title">
							原始 Markdown
						</h2>
					</div>
					<button class="admin-button" type="button" @click="emit('closeRawComparison')">
						关闭
					</button>
				</header>
				<div class="admin-article-comparison-grid">
					<section>
						<h3>当前草稿</h3>
						<pre>{{ rawMarkdown(documentModel) }}</pre>
					</section>
					<section>
						<h3>远端版本</h3>
						<pre>{{ rawMarkdown(remoteDocument) }}</pre>
					</section>
				</div>
			</section>
		</div>
	</Teleport>
</div>
</template>

<style scoped lang="scss">
.admin-article-comparison {
	display: grid;
	gap: 1rem;
	width: min(92vw, 76rem);
	max-height: min(88vh, 54rem);
	padding: 1rem;
}

.admin-article-comparison > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.admin-article-comparison h2,
.admin-article-comparison h3 {
	margin: 0;
}

.admin-article-comparison header span {
	font-size: 0.75rem;
	color: var(--admin-muted);
}

.admin-article-comparison-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
	min-height: 0;
}

.admin-article-comparison-grid section {
	display: grid;
	gap: 0.6rem;
	min-width: 0;
	min-height: 0;
}

.admin-article-comparison pre {
	overflow: auto;
	overflow-wrap: anywhere;
	min-height: 22rem;
	max-height: 66vh;
	margin: 0;
	padding: 1rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.9rem;
	background: var(--admin-surface-soft);
	white-space: pre-wrap;
}

@media (max-width: 820px) {
	.admin-article-comparison-grid {
		grid-template-columns: 1fr;
	}

	.admin-article-comparison pre {
		min-height: 14rem;
		max-height: 32vh;
	}
}
</style>
