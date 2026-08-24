<script setup lang="ts">
import AdminEmptyState from '~/components/admin/AdminEmptyState.vue'
import AdminStatusPill from '~/components/admin/AdminStatusPill.vue'

interface NewsSourceState {
	source_id: string
	status: string
	enabled?: boolean
	available?: boolean
	item_count: number
	last_success_at: string | null
	last_error: string | null
}

defineProps<{
	sources: NewsSourceState[]
	loading: boolean
	error?: string | null
}>()
const emit = defineEmits<{ sync: [] }>()

function sourceLabel(sourceId: string) {
	if (sourceId.startsWith('ai-hot'))
		return 'AI HOT'
	if (sourceId === 'station-news')
		return '站长资讯'
	if (sourceId === 'manual')
		return '手动精选'
	if (sourceId === 'wallstreetcn-7x24')
		return '财经 7×24 · 华尔街见闻'
	if (sourceId === 'jin10-mcp-7x24')
		return '财经 7×24 · 金十数据'
	if (sourceId === 'cls-telegraph-7x24')
		return '财经 7×24 · 财联社'
	if (sourceId === 'prototype-finance-7x24')
		return '财经 7×24 · 原型回退'
	return sourceId
}

function statusMeta(source: NewsSourceState) {
	if (source.available === false && source.enabled !== false)
		return { label: '凭据未配置', tone: 'warning' as const }
	if (source.enabled === false)
		return { label: '未启用', tone: 'neutral' as const }
	if (source.status === 'success')
		return { label: '同步正常', tone: 'positive' as const }
	if (source.status === 'disabled')
		return { label: '未启用', tone: 'neutral' as const }
	if (source.status === 'pending')
		return { label: '待首次同步', tone: 'warning' as const }
	if (source.status === 'running')
		return { label: '同步中', tone: 'warning' as const }
	return { label: '需要处理', tone: 'danger' as const }
}
</script>

<template>
<section class="admin-panel admin-news-source-health">
	<header class="admin-panel-header">
		<div>
			<h2>来源健康</h2>
			<p>来源失败时，前台仍会使用最后成功快照，不会显示半成品。</p>
		</div>
		<button class="admin-button" type="button" @click="emit('sync')">
			<Icon name="tabler:refresh" />重新同步全部来源
		</button>
	</header>
	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>
	<div v-if="loading" class="admin-skeleton admin-list-skeleton" />
	<div v-else-if="sources.length" class="admin-news-source-list">
		<article v-for="source in sources" :key="source.source_id" class="admin-news-source-card">
			<header>
				<div><strong>{{ sourceLabel(source.source_id) }}</strong><span>{{ source.item_count }} 条内容</span></div>
				<AdminStatusPill :tone="statusMeta(source).tone">
					{{ statusMeta(source).label }}
				</AdminStatusPill>
			</header>
			<div class="admin-news-source-meta">
				<span>最近成功</span>
				<strong>{{ source.last_success_at || '尚未成功同步' }}</strong>
			</div>
			<p v-if="source.last_error" class="admin-news-source-error">
				{{ source.last_error }}
			</p>
		</article>
	</div>
	<AdminEmptyState v-else icon="tabler:database-off" title="还没有来源状态" description="执行一次同步后，这里会显示每个来源的健康情况。" />
</section>
</template>

<style scoped lang="scss">
.admin-news-source-health {
	display: grid;
	gap: 1rem;
	padding: 1rem;
}

.admin-news-source-list {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
}

.admin-news-source-card {
	display: grid;
	gap: 0.75rem;
	padding: 0.9rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.9rem;
	background: var(--admin-surface-soft);
}

.admin-news-source-card > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.75rem;
}

.admin-news-source-card header strong,
.admin-news-source-card header span {
	display: block;
}

.admin-news-source-card header span,
.admin-news-source-meta span {
	margin-top: 0.2rem;
	font-size: 0.64rem;
	color: var(--admin-muted);
}

.admin-news-source-meta {
	display: grid;
	gap: 0.2rem;
}

.admin-news-source-meta strong {
	font-size: 0.7rem;
	font-variant-numeric: tabular-nums;
}

.admin-news-source-error {
	margin: 0;
	padding: 0.65rem;
	border-radius: 0.65rem;
	background: color-mix(in srgb, var(--admin-danger) 8%, transparent);
	font-size: 0.68rem;
	line-height: 1.6;
	color: var(--admin-danger);
}

@media (max-width: 760px) {
	.admin-news-source-list {
		grid-template-columns: 1fr;
	}
}
</style>
