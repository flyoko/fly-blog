<script setup lang="ts">
import type { PullRequestDto, PullRequestFileDto } from '#shared/admin/publishing'
import type { AdminPublishRunDto } from '~/types/admin'
import AdminAdvancedDetails from '~/components/admin/AdminAdvancedDetails.vue'
import { reviewFileStatusLabel } from '~/types/admin'

defineProps<{
	run: AdminPublishRunDto | null
	pullRequest: PullRequestDto
	files: PullRequestFileDto[]
}>()
</script>

<template>
<AdminAdvancedDetails title="发布技术详情" description="PR、分支、SHA 和文件补丁，排查问题时再展开。">
	<div class="admin-release-technical-meta">
		<div><span>Pull Request</span><code>#{{ pullRequest.number }}</code></div>
		<div><span>目标分支</span><code>{{ pullRequest.baseBranch }}</code></div>
		<div><span>Head SHA</span><code>{{ pullRequest.headSha }}</code></div>
		<div><span>发布 Commit</span><code>{{ run?.commitSha || '未关联' }}</code></div>
	</div>
	<div class="admin-review-links">
		<a class="admin-button" :href="pullRequest.url" target="_blank" rel="noopener">打开 GitHub</a>
	</div>
	<section class="admin-review-files">
		<header><div><strong>变更文件</strong><span>GitHub 返回的结构化补丁</span></div><span class="admin-badge">{{ files.length }} 个文件</span></header>
		<article v-for="file in files" :key="file.filename" class="admin-review-file">
			<div class="admin-review-file-header">
				<code>{{ file.filename }}</code>
				<span>{{ reviewFileStatusLabel(file.status) }} · <b>+{{ file.additions }}</b> / <i>-{{ file.deletions }}</i></span>
			</div>
			<pre v-if="file.patch">{{ file.patch }}</pre>
			<p v-else>
				该文件没有可显示的文本补丁，可能是二进制文件或补丁过大。
			</p>
		</article>
	</section>
</AdminAdvancedDetails>
</template>

<style scoped lang="scss">
.admin-release-technical-meta {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.8rem;
}

.admin-release-technical-meta > div {
	display: grid;
	gap: 0.2rem;
	min-width: 0;
	padding: 0.65rem;
	border-radius: 0.7rem;
	background: var(--admin-surface);
}

.admin-release-technical-meta span {
	font-size: 0.62rem;
	color: var(--admin-muted);
}

.admin-release-technical-meta code {
	overflow: hidden;
	font-size: 0.68rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

@media (max-width: 680px) {
	.admin-release-technical-meta {
		grid-template-columns: 1fr;
	}
}
</style>
