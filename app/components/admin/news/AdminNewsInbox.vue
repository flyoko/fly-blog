<script setup lang="ts">
import type { NewsItemDto } from '#shared/admin/news'
import AdminEmptyState from '~/components/admin/AdminEmptyState.vue'
import AdminStatusPill from '~/components/admin/AdminStatusPill.vue'

const props = defineProps<{
	items: NewsItemDto[]
	loading: boolean
	query: string
	sourceFilter: string
	deleting: boolean
}>()

const emit = defineEmits<{
	'update:query': [value: string]
	'update:sourceFilter': [value: string]
	'delete': [item: NewsItemDto]
}>()

const sourceOptions = computed(() => [...new Set(props.items.map(item => item.sourceId))])
const normalizedQuery = computed(() => props.query.trim().toLocaleLowerCase('zh-CN'))
const filteredItems = computed(() => props.items.filter((item) => {
	if (props.sourceFilter && item.sourceId !== props.sourceFilter)
		return false
	if (!normalizedQuery.value)
		return true
	return [item.title, item.summary, item.category, item.sourceId]
		.filter(Boolean)
		.some(value => value!.toLocaleLowerCase('zh-CN').includes(normalizedQuery.value))
}))

function sourceLabel(sourceId: string) {
	if (sourceId.startsWith('ai-hot'))
		return 'AI HOT'
	if (sourceId === 'station-news')
		return '站长资讯'
	if (sourceId === 'manual')
		return '手动精选'
	return sourceId
}

function itemHref(item: NewsItemDto) {
	return item.readerPath || item.originalUrl || item.url
}
</script>

<template>
<section class="admin-panel admin-news-inbox">
	<header class="admin-panel-header">
		<div>
			<h2>内容管理</h2>
			<p>筛选公开卡片，检查阅读页，并移除不适合展示的内容。</p>
		</div>
		<AdminStatusPill tone="neutral">
			{{ filteredItems.length }} / {{ items.length }} 条
		</AdminStatusPill>
	</header>

	<div class="admin-toolbar admin-toolbar-wrap">
		<label class="admin-search-field admin-search-field-wide">
			<Icon name="tabler:search" aria-hidden="true" />
			<input :value="query" type="search" placeholder="搜索标题、摘要或分类" @input="emit('update:query', ($event.target as HTMLInputElement).value)">
		</label>
		<label class="admin-select-field">
			<span>来源筛选</span>
			<select :value="sourceFilter" @change="emit('update:sourceFilter', ($event.target as HTMLSelectElement).value)">
				<option value="">全部来源</option>
				<option v-for="source in sourceOptions" :key="source" :value="source">{{ sourceLabel(source) }}</option>
			</select>
		</label>
	</div>

	<div v-if="loading" class="admin-action-list">
		<div v-for="index in 6" :key="index" class="admin-skeleton admin-list-skeleton" />
	</div>
	<div v-else-if="filteredItems.length" class="admin-news-inbox-list">
		<article v-for="item in filteredItems" :key="item.id" class="admin-news-inbox-item">
			<a :href="itemHref(item)" target="_blank" rel="noopener noreferrer">
				<span>{{ item.category || item.kind }}</span>
				<strong>{{ item.title }}</strong>
				<small>{{ sourceLabel(item.sourceId) }} · {{ item.publishedAt || item.fetchedAt }}</small>
			</a>
			<button class="admin-icon-button" type="button" :disabled="deleting" :aria-label="`删除 ${item.title}`" title="删除条目" @click="emit('delete', item)">
				<Icon name="tabler:trash" />
			</button>
		</article>
	</div>
	<AdminEmptyState v-else icon="tabler:news-off" title="没有匹配的内容" description="调整搜索或来源筛选，或者去手动精选添加一条内容。" />
</section>
</template>

<style scoped lang="scss">
.admin-news-inbox {
	display: grid;
	gap: 1rem;
	padding: 1rem;
}

.admin-news-inbox-list {
	display: grid;
	gap: 0.55rem;
}

.admin-news-inbox-item {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.65rem;
	padding: 0.65rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.85rem;
}

.admin-news-inbox-item > a {
	display: grid;
	grid-template-columns: minmax(6rem, 0.3fr) minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.65rem;
	min-width: 0;
	color: inherit;
}

.admin-news-inbox-item span {
	font-size: 0.66rem;
	color: var(--admin-accent-strong);
}

.admin-news-inbox-item strong {
	overflow: hidden;
	font-size: 0.75rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-news-inbox-item small {
	font-size: 0.64rem;
	color: var(--admin-muted);
}

@media (max-width: 760px) {
	.admin-news-inbox-item,
	.admin-news-inbox-item > a {
		grid-template-columns: 1fr;
	}

	.admin-news-inbox-item .admin-icon-button {
		width: 100%;
	}
}
</style>
