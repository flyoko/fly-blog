<script setup lang="ts">
import type { ArticleDocument, ArticleSummary } from '#shared/admin/articles'
import type { MediaObjectDto } from '#shared/admin/media'
import {
	insertMarkdownImage,
	updateArticleFrontmatter,
} from '~/composables/useAdminDraft'
import { renderAdminMarkdown } from '~/utils/admin-markdown'

const props = withDefaults(defineProps<{
	modelValue: ArticleDocument
	articles?: ArticleSummary[]
	categories: string[]
	saving?: boolean
	conflict?: boolean
	isNew?: boolean
	draftStatus?: string
}>(), {
	articles: () => [],
	saving: false,
	conflict: false,
	isNew: false,
	draftStatus: '',
})

const emit = defineEmits<{
	'update:modelValue': [document: ArticleDocument]
	'save': [mode: 'direct' | 'pull_request']
	'navigate': [id: string]
	'reloadRemote': []
	'compareRaw': []
}>()

const textarea = ref<HTMLTextAreaElement | null>(null)
const mediaPickerOpen = ref(false)
const previewError = ref<string | null>(null)
const previewLoading = ref(false)
const lastSuccessfulPreview = ref('')
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

function updateBody(body: string) {
	documentModel.value = { ...documentModel.value, body }
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
	const start = textarea.value?.selectionStart ?? documentModel.value.body.length
	const end = textarea.value?.selectionEnd ?? start
	const result = insertMarkdownImage(documentModel.value.body, start, end, media.originalName, media.url)
	updateBody(result.body)
	nextTick(() => {
		textarea.value?.focus()
		textarea.value?.setSelectionRange(result.cursor, result.cursor)
	})
}

function refreshPreview(body: string) {
	try {
		lastSuccessfulPreview.value = renderAdminMarkdown(body)
		previewError.value = null
	}
	catch (cause) {
		previewError.value = cause instanceof Error ? cause.message : 'Markdown 预览失败'
	}
	finally {
		previewLoading.value = false
	}
}

watch(() => documentModel.value.body, (body) => {
	if (previewTimer)
		clearTimeout(previewTimer)
	previewLoading.value = true
	previewTimer = setTimeout(refreshPreview, 300, body)
}, { immediate: true })

onBeforeUnmount(() => {
	if (previewTimer)
		clearTimeout(previewTimer)
})
</script>

<template>
<div class="admin-editor-shell">
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
				<strong>远端文章已经变化</strong>
				<span>当前草稿仍保留在浏览器中，请选择如何继续。</span>
			</div>
			<div class="admin-conflict-actions">
				<button class="admin-button" type="button" @click="emit('reloadRemote')">
					重新加载远端
				</button>
				<button class="admin-button" type="button" @click="emit('compareRaw')">
					比较原始 Markdown
				</button>
				<button class="admin-button admin-button-primary" type="button" @click="emit('save', 'pull_request')">
					改用 PR 发布
				</button>
			</div>
		</div>

		<header class="admin-editor-toolbar">
			<div>
				<span class="admin-badge">{{ isNew ? '新文章' : '编辑文章' }}</span>
				<small v-if="draftStatus">{{ draftStatus }}</small>
			</div>
			<div>
				<button class="admin-button" type="button" @click="mediaPickerOpen = true">
					<Icon name="tabler:photo-plus" />
					插入媒体
				</button>
				<button class="admin-button" type="button" :disabled="saving" @click="emit('save', 'pull_request')">
					创建 PR
				</button>
				<button class="admin-button admin-button-primary" type="button" :disabled="saving" @click="emit('save', 'direct')">
					{{ saving ? '正在发布…' : '直接发布' }}
				</button>
			</div>
		</header>

		<div class="admin-editor-workspace">
			<div class="admin-editor-pane">
				<label class="admin-field admin-field-grow">
					<span>Markdown 正文</span>
					<textarea
						ref="textarea"
						:value="documentModel.body"
						spellcheck="false"
						placeholder="开始写作…"
						@input="updateBody(($event.target as HTMLTextAreaElement).value)"
					/>
				</label>
			</div>
			<div class="admin-editor-pane admin-editor-preview">
				<div class="admin-preview-header">
					<span>实时预览</span>
					<small v-if="previewLoading">解析中…</small>
				</div>
				<p v-if="previewError" class="admin-error">
					预览更新失败，已保留上一次成功结果：{{ previewError }}
				</p>
				<article
					v-if="lastSuccessfulPreview"
					class="admin-preview-content"
					v-html="lastSuccessfulPreview"
				/>
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
</div>
</template>
