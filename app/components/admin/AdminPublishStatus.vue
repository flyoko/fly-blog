<script setup lang="ts">
import type { AdminPublishRunDto } from '~/types/admin'
import { publishStatusMeta } from '~/types/admin'

const props = withDefaults(defineProps<{
	run: AdminPublishRunDto
	showActions?: boolean
}>(), {
	showActions: true,
})

const meta = computed(() => publishStatusMeta(props.run.status ?? 'unknown'))
</script>

<template>
<article class="admin-publish-status">
	<div class="admin-publish-status-main">
		<span class="admin-status-pill" :data-tone="meta.tone">{{ meta.label }}</span>
		<div>
			<strong>{{ run.resourcePath || run.repositoryRef }}</strong>
			<span>{{ run.kind === 'pull_request' ? `PR #${run.pullNumber || '—'}` : '直接发布' }} · {{ new Date(run.updatedAt).toLocaleString() }}</span>
		</div>
	</div>
	<div v-if="showActions" class="admin-publish-status-actions">
		<a v-if="run.pullRequestUrl" class="admin-button" :href="run.pullRequestUrl" target="_blank" rel="noopener">查看 PR</a>
		<a v-if="run.deploymentUrl" class="admin-button" :href="run.deploymentUrl" target="_blank" rel="noopener">查看预览</a>
	</div>
	<p v-if="run.errorMessage" class="admin-error">
		{{ run.errorMessage }}
	</p>
</article>
</template>
