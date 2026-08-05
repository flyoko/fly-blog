<script setup lang="ts">
import type { ArticleSummary } from '#shared/admin/articles'
import categoriesRaw from '~~/config/taxonomy/categories.json'
import { toAdminUserMessage } from '#shared/admin/feedback'

const query = ref('')
const category = ref('')
const draft = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const result = ref<{ items: ArticleSummary[], total: number, page: number, pageSize: number }>({
	items: [],
	total: 0,
	page: 1,
	pageSize: 20,
})
const categories = categoriesRaw.map(item => item.name)
const hasFilters = computed(() => Boolean(query.value || category.value || draft.value))
const statusFilters = [
	{ value: '', label: '全部' },
	{ value: 'false', label: '已发布' },
	{ value: 'true', label: '草稿' },
] as const
let searchTimer: ReturnType<typeof setTimeout> | undefined

useSeoMeta({ title: '文章管理', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = null
	try {
		result.value = await useAdminApi('/api/admin/articles', {
			query: {
				page: result.value.page,
				pageSize: result.value.pageSize,
				query: query.value || undefined,
				category: category.value || undefined,
				draft: draft.value || undefined,
			},
		})
	}
	catch (cause) {
		error.value = toAdminUserMessage(cause, '文章列表加载失败')
	}
	finally {
		loading.value = false
	}
}

function clearFilters() {
	query.value = ''
	category.value = ''
	draft.value = ''
}

watch([query, category, draft], () => {
	result.value.page = 1
	if (searchTimer)
		clearTimeout(searchTimer)
	searchTimer = setTimeout(load, 250)
})

onMounted(load)
onBeforeUnmount(() => searchTimer && clearTimeout(searchTimer))
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">内容管理</span>
			<h1>文章</h1>
			<p>搜索、编辑和发布 Git 仓库中的 Markdown 内容。</p>
		</div>
		<NuxtLink class="admin-button admin-button-primary" to="/admin/articles/new">
			<Icon name="tabler:plus" />
			新建文章
		</NuxtLink>
	</header>

	<div class="admin-toolbar admin-toolbar-wrap">
		<label class="admin-search-field admin-search-field-wide">
			<Icon name="tabler:search" />
			<input v-model="query" type="search" placeholder="搜索标题、摘要、标签或路径">
		</label>
		<label class="admin-select-field">
			<span>分类</span>
			<select v-model="category">
				<option value="">全部分类</option>
				<option v-for="item in categories" :key="item" :value="item">{{ item }}</option>
			</select>
		</label>
		<div class="admin-tab-list" role="group" aria-label="文章状态">
			<button
				v-for="item in statusFilters"
				:key="item.value"
				class="admin-tab"
				:class="{ 'is-active': draft === item.value }"
				type="button"
				:aria-pressed="draft === item.value"
				@click="draft = item.value"
			>
				{{ item.label }}
			</button>
		</div>
		<button v-if="hasFilters" class="admin-button" type="button" @click="clearFilters">
			<Icon name="tabler:filter-off" />清空筛选
		</button>
		<span class="admin-muted-copy">{{ loading ? '正在查找…' : `找到 ${result.total} 篇` }}</span>
		<button class="admin-icon-button" type="button" aria-label="刷新文章列表" @click="load">
			<Icon name="tabler:refresh" />
		</button>
	</div>

	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<div v-if="loading" class="admin-content-list">
		<div v-for="index in 6" :key="index" class="admin-skeleton admin-list-skeleton" />
	</div>
	<div v-else-if="result.items.length" class="admin-content-list">
		<NuxtLink
			v-for="article in result.items"
			:key="article.id"
			:to="`/admin/articles/${article.id}`"
			class="admin-content-row"
		>
			<div class="admin-content-row-main">
				<div class="admin-content-row-title">
					<strong>{{ article.title }}</strong>
					<span v-if="article.draft" class="admin-badge">草稿</span>
				</div>
				<p>{{ article.description || article.path }}</p>
				<div class="admin-content-row-meta">
					<span v-for="item in article.categories" :key="item">{{ item }}</span>
					<span>{{ article.updated || article.date || '未设置日期' }}</span>
				</div>
			</div>
			<Icon name="tabler:chevron-right" />
		</NuxtLink>
	</div>
	<AdminEmptyState
		v-else
		icon="tabler:file-off"
		title="没有找到文章"
		description="调整搜索条件，或者创建第一篇文章。"
	>
		<NuxtLink class="admin-button admin-button-primary" to="/admin/articles/new">
			新建文章
		</NuxtLink>
	</AdminEmptyState>
</section>
</template>
