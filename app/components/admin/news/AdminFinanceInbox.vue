<script setup lang="ts">
import type { AdminFinanceFlashDto, FinanceAdminVisibility, FinanceFilter, FinanceSourceSettingDto } from '#shared/admin/finance'
import AdminEmptyState from '~/components/admin/AdminEmptyState.vue'
import AdminStatusPill from '~/components/admin/AdminStatusPill.vue'

defineProps<{
	items: AdminFinanceFlashDto[]
	total: number
	visibleTotal: number
	hiddenTotal: number
	loading: boolean
	query: string
	category: FinanceFilter
	visibility: FinanceAdminVisibility
	importantOnly: boolean
	workingId: string | null
	sources: FinanceSourceSettingDto[]
	sourceLoading: boolean
	sourceWorkingId: string | null
}>()

const emit = defineEmits<{
	'update:query': [value: string]
	'update:category': [value: FinanceFilter]
	'update:visibility': [value: FinanceAdminVisibility]
	'update:importantOnly': [value: boolean]
	'hide': [item: AdminFinanceFlashDto]
	'restore': [item: AdminFinanceFlashDto]
	'toggleSource': [source: FinanceSourceSettingDto]
}>()

const categoryOptions: Array<{ value: FinanceFilter, label: string }> = [
	{ value: 'all', label: '全部分类' },
	{ value: 'market', label: '市场' },
	{ value: 'company', label: '公司' },
	{ value: 'macro', label: '宏观' },
	{ value: 'overseas', label: '海外' },
	{ value: 'tech', label: '科技' },
]

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return value
	return new Intl.DateTimeFormat('zh-CN', {
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(date)
}
</script>

<template>
<section class="admin-panel admin-finance-inbox">
	<header class="admin-panel-header">
		<div>
			<h2>财经内容</h2>
			<p>检查实时快讯，隐藏不适合公开的内容；隐藏记录会跨自动同步保留。</p>
		</div>
		<div class="admin-finance-counts" aria-label="财经内容统计">
			<AdminStatusPill tone="positive">
				公开 {{ visibleTotal }}
			</AdminStatusPill>
			<AdminStatusPill :tone="hiddenTotal ? 'warning' : 'neutral'">
				隐藏 {{ hiddenTotal }}
			</AdminStatusPill>
		</div>
	</header>

	<section class="admin-finance-sources" aria-labelledby="admin-finance-sources-title">
		<div class="admin-finance-source-heading">
			<div>
				<h3 id="admin-finance-sources-title">
					来源开关
				</h3>
				<p>关闭后停止后续同步，公开聚合立即隐藏，历史内容保留。</p>
			</div>
		</div>
		<div v-if="sourceLoading" class="admin-finance-source-grid" aria-label="财经来源加载中">
			<div v-for="index in 3" :key="index" class="admin-skeleton admin-finance-source-skeleton" />
		</div>
		<div v-else class="admin-finance-source-grid">
			<article v-for="source in sources" :key="source.sourceId" class="admin-finance-source-card">
				<div class="admin-finance-source-copy">
					<strong>{{ source.sourceName }}</strong>
					<div class="admin-finance-source-status">
						<AdminStatusPill :tone="source.enabled ? 'positive' : 'neutral'">
							{{ source.enabled ? '已启用' : '已关闭' }}
						</AdminStatusPill>
						<AdminStatusPill v-if="!source.available" tone="warning">
							凭据未配置
						</AdminStatusPill>
					</div>
				</div>
				<button
					class="admin-finance-source-toggle"
					type="button"
					role="switch"
					:aria-label="`${source.sourceName}来源同步`"
					:aria-checked="source.enabled"
					:disabled="sourceWorkingId !== null"
					@click="emit('toggleSource', source)"
				>
					<span class="admin-finance-source-toggle-track" aria-hidden="true">
						<span />
					</span>
					{{ sourceWorkingId === source.sourceId ? '处理中…' : source.enabled ? '关闭' : '开启' }}
				</button>
			</article>
		</div>
	</section>

	<div class="admin-toolbar admin-toolbar-wrap admin-finance-toolbar">
		<label class="admin-search-field admin-search-field-wide">
			<Icon name="tabler:search" aria-hidden="true" />
			<input :value="query" type="search" placeholder="搜索标题、摘要、主题或来源" @input="emit('update:query', ($event.target as HTMLInputElement).value)">
		</label>
		<label class="admin-select-field">
			<span>分类</span>
			<select :value="category" @change="emit('update:category', ($event.target as HTMLSelectElement).value as FinanceFilter)">
				<option v-for="option in categoryOptions" :key="option.value" :value="option.value">
					{{ option.label }}
				</option>
			</select>
		</label>
		<label class="admin-select-field">
			<span>展示状态</span>
			<select :value="visibility" @change="emit('update:visibility', ($event.target as HTMLSelectElement).value as FinanceAdminVisibility)">
				<option value="all">全部状态</option>
				<option value="visible">仅公开</option>
				<option value="hidden">仅隐藏</option>
			</select>
		</label>
		<label class="admin-finance-important-filter">
			<input :checked="importantOnly" type="checkbox" @change="emit('update:importantOnly', ($event.target as HTMLInputElement).checked)">
			<span>只看重要</span>
		</label>
	</div>

	<div v-if="loading" class="admin-action-list">
		<div v-for="index in 6" :key="index" class="admin-skeleton admin-list-skeleton" />
	</div>
	<div v-else-if="items.length" class="admin-finance-list">
		<article v-for="item in items" :key="item.id" class="admin-finance-item" :class="{ 'is-hidden': item.hidden }">
			<div class="admin-finance-item-main">
				<div class="admin-finance-item-meta">
					<AdminStatusPill v-if="item.important" tone="danger">
						重要
					</AdminStatusPill>
					<AdminStatusPill :tone="item.hidden ? 'warning' : 'positive'">
						{{ item.hidden ? '已隐藏' : '公开中' }}
					</AdminStatusPill>
					<span>{{ item.categoryLabel }}</span>
					<span v-if="item.topic">{{ item.topic }}</span>
					<time :datetime="item.publishedAt">{{ formatTime(item.publishedAt) }}</time>
				</div>
				<strong>{{ item.title }}</strong>
				<p v-if="item.summary">
					{{ item.summary }}
				</p>
				<div class="admin-finance-item-source">
					<span>来源：{{ item.sourceName }}</span>
					<a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">查看原文</a>
					<span v-if="item.hiddenAt">隐藏于 {{ formatTime(item.hiddenAt) }}</span>
				</div>
			</div>
			<button
				class="admin-button admin-finance-action"
				:class="{ 'admin-button-primary': item.hidden }"
				type="button"
				:disabled="workingId === item.id"
				@click="item.hidden ? emit('restore', item) : emit('hide', item)"
			>
				<Icon :name="item.hidden ? 'tabler:eye' : 'tabler:eye-off'" />
				{{ workingId === item.id ? '处理中…' : item.hidden ? '恢复公开' : '隐藏' }}
			</button>
		</article>
	</div>
	<AdminEmptyState
		v-else
		icon="tabler:filter-off"
		title="没有匹配的财经快讯"
		:description="total ? '调整搜索、分类或展示状态后重试。' : '当前还没有财经快讯，先执行一次来源同步。'"
	/>
</section>
</template>

<style scoped lang="scss">
.admin-finance-inbox {
	display: grid;
	gap: 1rem;
	padding: 1rem;
}

.admin-finance-counts {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.admin-finance-sources {
	display: grid;
	gap: 0.75rem;
	padding: 0.85rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.9rem;
	background: var(--admin-surface-soft);
}

.admin-finance-source-heading h3 {
	margin: 0;
	font-size: 0.82rem;
}

.admin-finance-source-heading p {
	margin: 0.25rem 0 0;
	font-size: 0.66rem;
	line-height: 1.55;
	color: var(--admin-muted);
}

.admin-finance-source-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.65rem;
}

.admin-finance-source-card {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
	min-width: 0;
	padding: 0.75rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.75rem;
	background: var(--admin-surface);
}

.admin-finance-source-copy {
	display: grid;
	gap: 0.45rem;
	min-width: 0;
}

.admin-finance-source-copy > strong {
	overflow: hidden;
	font-size: 0.72rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-finance-source-status {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35rem;
}

.admin-finance-source-toggle {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	gap: 0.4rem;
	padding: 0.35rem 0.45rem;
	border: 0;
	border-radius: 0.55rem;
	background: transparent;
	font: inherit;
	font-size: 0.65rem;
	color: var(--admin-text);
	cursor: pointer;
}

.admin-finance-source-toggle:focus-visible {
	outline: 2px solid var(--admin-accent-strong);
	outline-offset: 2px;
}

.admin-finance-source-toggle:disabled {
	opacity: 0.65;
	cursor: wait;
}

.admin-finance-source-toggle-track {
	display: flex;
	align-items: center;
	width: 1.75rem;
	height: 1rem;
	padding: 0.12rem;
	border-radius: 999px;
	background: var(--admin-border);
	transition: background 160ms ease;
}

.admin-finance-source-toggle-track > span {
	width: 0.76rem;
	height: 0.76rem;
	border-radius: 50%;
	background: var(--admin-surface);
	transition: transform 160ms ease;
}

.admin-finance-source-toggle[aria-checked="true"] .admin-finance-source-toggle-track {
	background: var(--admin-accent-strong);
}

.admin-finance-source-toggle[aria-checked="true"] .admin-finance-source-toggle-track > span {
	transform: translateX(0.75rem);
}

.admin-finance-source-skeleton {
	min-height: 4.2rem;
}

.admin-finance-toolbar {
	align-items: end;
}

.admin-finance-important-filter {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	min-height: 2.35rem;
	padding: 0 0.75rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.65rem;
	background: var(--admin-surface-soft);
	font-size: 0.7rem;
	color: var(--admin-text);
	cursor: pointer;
}

.admin-finance-important-filter input {
	margin: 0;
}

.admin-finance-list {
	display: grid;
	gap: 0.65rem;
}

.admin-finance-item {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.85rem;
	padding: 0.85rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.9rem;
	background: var(--admin-surface);
}

.admin-finance-item.is-hidden {
	opacity: 0.82;
	background: var(--admin-surface-soft);
}

.admin-finance-item-main {
	display: grid;
	gap: 0.5rem;
	min-width: 0;
}

.admin-finance-item-main > strong {
	font-size: 0.78rem;
	line-height: 1.55;
}

.admin-finance-item-main > p {
	display: -webkit-box;
	overflow: hidden;
	margin: 0;
	font-size: 0.68rem;
	-webkit-line-clamp: 2;
	line-height: 1.6;
	color: var(--admin-muted);
	-webkit-box-orient: vertical;
}

.admin-finance-item-meta,
.admin-finance-item-source {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4rem 0.65rem;
	font-size: 0.64rem;
	color: var(--admin-muted);
}

.admin-finance-item-meta time {
	font-variant-numeric: tabular-nums;
}

.admin-finance-item-source a {
	color: var(--admin-accent-strong);
}

.admin-finance-action {
	white-space: nowrap;
}

@media (max-width: 760px) {
	.admin-finance-inbox {
		padding: 0.8rem;
	}

	.admin-finance-toolbar,
	.admin-finance-item {
		grid-template-columns: 1fr;
	}

	.admin-finance-source-grid {
		grid-template-columns: 1fr;
	}

	.admin-finance-important-filter,
	.admin-finance-action {
		justify-content: center;
		width: 100%;
	}

	.admin-finance-item-main > strong {
		font-size: 0.76rem;
	}
}
</style>
