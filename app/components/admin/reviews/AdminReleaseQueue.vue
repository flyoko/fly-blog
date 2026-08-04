<script setup lang="ts">
import type { AdminPublishRunDto, AdminPublishRunGroup } from '~/types/admin'
import AdminEmptyState from '~/components/admin/AdminEmptyState.vue'
import AdminStatusPill from '~/components/admin/AdminStatusPill.vue'
import { publishNextAction, publishRunGroup, publishStatusMeta } from '~/types/admin'

const props = defineProps<{
	runs: AdminPublishRunDto[]
	selectedId: string | null
	loading: boolean
}>()
const emit = defineEmits<{ select: [run: AdminPublishRunDto] }>()

const groups: Array<{ id: AdminPublishRunGroup, label: string, description: string }> = [
	{ id: 'needs_action', label: '需要处理', description: '可以审核，或遇到需要解决的问题' },
	{ id: 'in_progress', label: '进行中', description: '系统正在执行检查和生成预览' },
	{ id: 'completed', label: '已完成', description: '已经上线或关闭的历史记录' },
]

function groupRuns(group: AdminPublishRunGroup) {
	return props.runs.filter(run => publishRunGroup(run) === group)
}

function resourceLabel(run: AdminPublishRunDto) {
	if (!run.resourcePath)
		return run.kind === 'direct' ? '直接发布' : '站点配置'
	return run.resourcePath.split('/').at(-1) || run.resourcePath
}
</script>

<template>
<section class="admin-panel admin-release-queue" aria-label="发布队列">
	<header class="admin-panel-header">
		<div><h2>发布队列</h2><p>{{ runs.length }} 项记录</p></div>
	</header>
	<div v-if="loading" class="admin-action-list">
		<div v-for="index in 6" :key="index" class="admin-skeleton admin-list-skeleton" />
	</div>
	<div v-else-if="runs.length" class="admin-release-groups">
		<section v-for="group in groups" :key="group.id" class="admin-release-group">
			<header>
				<div><strong>{{ group.label }}</strong><span>{{ group.description }}</span></div>
				<small>{{ groupRuns(group.id).length }}</small>
			</header>
			<div v-if="groupRuns(group.id).length" class="admin-release-list">
				<button v-for="run in groupRuns(group.id)" :key="run.id" type="button" :aria-label="`查看发布记录 ${resourceLabel(run)}，${publishStatusMeta(run.status).label}`" :class="{ 'is-active': selectedId === run.id }" @click="emit('select', run)">
					<span class="admin-release-list-main">
						<strong>{{ resourceLabel(run) }}</strong>
						<small>{{ new Date(run.updatedAt).toLocaleString('zh-CN') }}</small>
					</span>
					<AdminStatusPill :tone="publishStatusMeta(run.status).tone">
						{{ publishStatusMeta(run.status).label }}
					</AdminStatusPill>
					<span class="admin-release-next">{{ publishNextAction(run) }}</span>
				</button>
			</div>
			<p v-else class="admin-muted-copy">
				这个分组暂时为空。
			</p>
		</section>
	</div>
	<AdminEmptyState v-else icon="tabler:history-off" title="还没有发布记录" description="文章或配置提交后，会在这里显示检查和预览进度。" />
</section>
</template>

<style scoped lang="scss">
.admin-release-queue {
	display: grid;
	align-content: start;
	gap: 0.9rem;
	min-width: 0;
	padding: 1rem;
}

.admin-release-groups,
.admin-release-group,
.admin-release-list {
	display: grid;
	gap: 0.55rem;
}

.admin-release-group > header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.65rem;
	padding: 0.35rem 0.2rem;
}

.admin-release-group header strong,
.admin-release-group header span {
	display: block;
}

.admin-release-group header strong {
	font-size: 0.72rem;
}

.admin-release-group header span,
.admin-release-group header small {
	margin-top: 0.15rem;
	font-size: 0.61rem;
	color: var(--admin-muted);
}

.admin-release-list button {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.45rem 0.65rem;
	min-height: 4.5rem;
	padding: 0.65rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.8rem;
	background: var(--admin-surface);
	font: inherit;
	text-align: left;
	color: inherit;
	cursor: pointer;
}

.admin-release-list button:hover,
.admin-release-list button:focus-visible,
.admin-release-list button.is-active {
	border-color: color-mix(in srgb, var(--admin-accent) 40%, var(--admin-border));
	background: var(--admin-accent-soft);
}

.admin-release-list-main {
	min-width: 0;
}

.admin-release-list-main strong,
.admin-release-list-main small {
	display: block;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.admin-release-list-main strong {
	font-size: 0.75rem;
}

.admin-release-list-main small,
.admin-release-next {
	font-size: 0.62rem;
	color: var(--admin-muted);
}

.admin-release-list-main small {
	margin-top: 0.2rem;
	font-variant-numeric: tabular-nums;
}

.admin-release-next {
	grid-column: 1 / -1;
}
</style>
