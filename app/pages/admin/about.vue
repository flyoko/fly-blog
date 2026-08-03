<script setup lang="ts">
import type {
	AboutLinks,
	AboutProfile,
	AboutTimeline,
} from '#shared/admin/about'
import { buildConfigPullRequest } from '~/types/admin'

interface AboutPayload {
	profile: AboutProfile & { sha: string }
	timeline: { items: AboutTimeline, sha: string }
	links: { items: AboutLinks, sha: string }
}

const data = ref<AboutPayload | null>(null)
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')
const profile = reactive<AboutProfile>({ title: '', summary: '', body: '' })
const timelineText = ref('[]')
const linksText = ref('[]')

useSeoMeta({ title: '自述管理', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = ''
	try {
		data.value = await useAdminApi<AboutPayload>('/api/admin/about')
		Object.assign(profile, {
			title: data.value.profile.title,
			summary: data.value.profile.summary,
			body: data.value.profile.body,
			avatar: data.value.profile.avatar,
			updatedAt: data.value.profile.updatedAt,
		})
		timelineText.value = JSON.stringify(data.value.timeline.items, null, 2)
		linksText.value = JSON.stringify(data.value.links.items, null, 2)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '自述加载失败'
	}
	finally {
		loading.value = false
	}
}

async function saveProfile() {
	if (!data.value)
		return
	saving.value = true
	error.value = ''
	success.value = ''
	try {
		await useAdminApi('/api/admin/about/profile', {
			method: 'PUT',
			body: {
				profile: { ...profile, updatedAt: new Date().toISOString() },
				expectedSha: data.value.profile.sha,
				idempotencyKey: `about-profile-${crypto.randomUUID()}`,
			},
		})
		success.value = '自述正文已直接提交，生产构建已触发。'
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '自述保存失败'
	}
	finally {
		saving.value = false
	}
}

async function createStructurePr(kind: 'aboutTimeline' | 'aboutLinks') {
	saving.value = true
	error.value = ''
	success.value = ''
	try {
		const content = JSON.parse(
			kind === 'aboutTimeline' ? timelineText.value : linksText.value,
		)
		const result = await useAdminApi<{
			pullRequestNumber: number
			pullRequestUrl: string
		}>('/api/admin/publishing/pull-requests', {
			method: 'POST',
			body: buildConfigPullRequest(
				kind,
				content,
				`about-structure-${crypto.randomUUID()}`,
			),
		})
		success.value = `Pull Request #${result.pullRequestNumber} 已创建，请到发布与审核查看预览。`
	}
	catch (cause) {
		error.value
			= cause instanceof Error
				? cause.message
				: '结构变更提交失败，请检查 JSON 格式。'
	}
	finally {
		saving.value = false
	}
}

onMounted(load)
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">ABOUT · GIT</span>
			<h1>自述</h1>
			<p>正文直接发布；时间线与链接通过 Pull Request 预览。</p>
		</div>
		<a class="admin-button" href="/me" target="_blank" rel="noopener"><Icon name="tabler:external-link" />查看页面</a>
	</header>
	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<p v-if="success" class="admin-success">
		{{ success }}
	</p>
	<div v-if="loading" class="admin-skeleton admin-editor-loading" />
	<div v-else class="admin-about-grid">
		<section class="admin-panel admin-about-profile">
			<header class="admin-panel-header">
				<div>
					<h2>自述正文</h2>
					<p>Markdown 内容，保存后直接提交 Git。</p>
				</div>
			</header>
			<label class="admin-field"><span>标题</span><input v-model="profile.title" maxlength="120"></label>
			<label class="admin-field"><span>摘要</span><textarea v-model="profile.summary" rows="3" maxlength="500" />
			</label>
			<label class="admin-field"><span>头像 URL（可选）</span><input v-model="profile.avatar" type="url" placeholder="https://..."></label>
			<label class="admin-field"><span>正文 Markdown</span><textarea v-model="profile.body" rows="22" />
			</label>
			<button
				class="admin-button admin-button-primary"
				type="button"
				:disabled="saving"
				@click="saveProfile"
			>
				<Icon name="tabler:device-floppy" />保存正文
			</button>
		</section>
		<div class="admin-about-structures">
			<section class="admin-panel">
				<header class="admin-panel-header">
					<div>
						<h2>时间线</h2>
						<p>结构变更走 PR。</p>
					</div>
				</header>
				<label class="admin-field"><span>JSON</span><textarea
					v-model="timelineText"
					rows="16"
					spellcheck="false"
				/></label><button
					class="admin-button"
					type="button"
					:disabled="saving"
					@click="createStructurePr('aboutTimeline')"
				>
					创建时间线 PR
				</button>
			</section>
			<section class="admin-panel">
				<header class="admin-panel-header">
					<div>
						<h2>外部链接</h2>
						<p>仅允许 HTTP(S) 地址。</p>
					</div>
				</header>
				<label class="admin-field"><span>JSON</span><textarea
					v-model="linksText"
					rows="16"
					spellcheck="false"
				/></label><button
					class="admin-button"
					type="button"
					:disabled="saving"
					@click="createStructurePr('aboutLinks')"
				>
					创建链接 PR
				</button>
			</section>
		</div>
	</div>
</section>
</template>

<style scoped lang="scss">
.admin-about-grid {
	display: grid;
	grid-template-columns: minmax(0, 1.3fr) minmax(20rem, 0.9fr);
	gap: 1rem;
}

.admin-about-profile,
.admin-about-structures > section {
	padding: 1rem;
}

.admin-about-structures {
	display: grid;
	gap: 1rem;
}

.admin-field textarea {
	min-height: auto;
}

@media (max-width: 980px) {
	.admin-about-grid {
		grid-template-columns: 1fr;
	}
}
</style>
