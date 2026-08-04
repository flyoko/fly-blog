<script setup lang="ts">
import type { CheckSummaryDto, DeploymentDto } from '#shared/admin/publishing'
import type { AdminPublishRunDto } from '~/types/admin'

const props = defineProps<{
	run: AdminPublishRunDto
	checks: CheckSummaryDto
	deployment: DeploymentDto | null
	canMerge: boolean
	reason?: string
}>()

type StepState = 'complete' | 'active' | 'waiting' | 'failed'

const steps = computed<Array<{ label: string, description: string, state: StepState }>>(() => {
	const checkStatus = props.checks.status
	const deploymentStatus = props.deployment?.status
	const completed = ['merged', 'published'].includes(props.run.status)
	return [
		{ label: '变更已提交', description: '内容或配置已经提交到安全发布流程。', state: 'complete' },
		{
			label: '自动检查',
			description: checkStatus === 'success' ? '类型、测试和构建检查已通过。' : checkStatus ? `当前状态：${checkStatus}` : '等待检查结果。',
			state: checkStatus === 'success' ? 'complete' : ['failure', 'failed', 'error'].includes(checkStatus) ? 'failed' : checkStatus ? 'active' : 'waiting',
		},
		{
			label: '预览站点',
			description: deploymentStatus === 'success' ? '预览已经生成，可以打开检查效果。' : deploymentStatus ? `当前状态：${deploymentStatus}` : '自动检查通过后生成预览。',
			state: deploymentStatus === 'success' ? 'complete' : deploymentStatus === 'failure' ? 'failed' : deploymentStatus ? 'active' : 'waiting',
		},
		{
			label: '确认上线',
			description: completed ? '这次变更已经上线。' : props.canMerge ? '全部条件已满足，等待你确认上线。' : props.reason || '等待检查和预览全部通过。',
			state: completed ? 'complete' : props.canMerge ? 'active' : props.reason ? 'failed' : 'waiting',
		},
	]
})

function iconName(state: StepState) {
	if (state === 'complete')
		return 'tabler:check'
	if (state === 'failed')
		return 'tabler:alert-triangle'
	if (state === 'active')
		return 'tabler:loader-2'
	return 'tabler:clock'
}
</script>

<template>
<section class="admin-release-checklist" aria-label="上线步骤">
	<article v-for="(step, index) in steps" :key="step.label" :data-state="step.state">
		<div class="admin-release-step-icon">
			<Icon :name="iconName(step.state)" />
		</div>
		<div class="admin-release-step-copy">
			<span>步骤 {{ index + 1 }}</span>
			<strong>{{ step.label }}</strong>
			<p>{{ step.description }}</p>
		</div>
	</article>
</section>
</template>

<style scoped lang="scss">
.admin-release-checklist {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 0.65rem;
}

.admin-release-checklist article {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-content: start;
	gap: 0.65rem;
	min-width: 0;
	padding: 0.8rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.85rem;
	background: var(--admin-surface-soft);
}

.admin-release-checklist article[data-state="active"] {
	border-color: color-mix(in srgb, var(--admin-accent) 45%, var(--admin-border));
	background: var(--admin-accent-soft);
}

.admin-release-checklist article[data-state="failed"] {
	border-color: color-mix(in srgb, var(--admin-danger) 35%, var(--admin-border));
}

.admin-release-step-icon {
	display: grid;
	place-items: center;
	width: 2rem;
	height: 2rem;
	border-radius: 50%;
	background: var(--admin-surface);
	color: var(--admin-muted);
}

[data-state="complete"] .admin-release-step-icon {
	background: color-mix(in srgb, var(--admin-positive) 12%, var(--admin-surface));
	color: var(--admin-positive);
}

[data-state="active"] .admin-release-step-icon {
	color: var(--admin-accent-strong);
}

[data-state="failed"] .admin-release-step-icon {
	background: color-mix(in srgb, var(--admin-danger) 10%, var(--admin-surface));
	color: var(--admin-danger);
}

.admin-release-step-copy span,
.admin-release-step-copy strong {
	display: block;
}

.admin-release-step-copy span {
	font-size: 0.58rem;
	color: var(--admin-muted);
}

.admin-release-step-copy strong {
	margin-top: 0.15rem;
	font-size: 0.72rem;
}

.admin-release-step-copy p {
	margin: 0.3rem 0 0;
	font-size: 0.63rem;
	line-height: 1.55;
	color: var(--admin-muted);
}

@media (max-width: 920px) {
	.admin-release-checklist {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 560px) {
	.admin-release-checklist {
		grid-template-columns: 1fr;
	}
}
</style>
