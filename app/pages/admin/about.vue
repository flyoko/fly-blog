<script setup lang="ts">
import type {
	AboutLinks,
	AboutProfile,
	AboutTimeline,
} from '#shared/admin/about'
import type { MediaObjectDto } from '#shared/admin/media'
import { insertMarkdownImage } from '~/composables/useAdminDraft'
import { buildConfigPullRequest } from '~/types/admin'
import { renderAdminMarkdown } from '~/utils/admin-markdown'

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
const profileExtras = ref<Record<string, unknown>>({})
const timelineText = ref('[]')
const linksText = ref('[]')
const bodyTextarea = ref<HTMLTextAreaElement | null>(null)
const mediaPickerOpen = ref(false)
const previewError = ref<string | null>(null)
const previewLoading = ref(false)
const lastSuccessfulPreview = ref('')
let previewTimer: ReturnType<typeof setTimeout> | undefined

useSeoMeta({ title: '自述管理', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = ''
	try {
		data.value = await useAdminApi<AboutPayload>('/api/admin/about')
		const editableKeys = new Set(['title', 'summary', 'body', 'avatar', 'updatedAt', 'sha'])
		profileExtras.value = Object.fromEntries(
			Object.entries(data.value.profile).filter(([key]) => !editableKeys.has(key)),
		)
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
				profile: {
					...profileExtras.value,
					...profile,
					updatedAt: new Date().toISOString(),
				},
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

function insertMedia(media: MediaObjectDto) {
	const start = bodyTextarea.value?.selectionStart ?? profile.body.length
	const end = bodyTextarea.value?.selectionEnd ?? start
	const result = insertMarkdownImage(profile.body, start, end, media.originalName, media.url)
	profile.body = result.body
	nextTick(() => {
		bodyTextarea.value?.focus()
		bodyTextarea.value?.setSelectionRange(result.cursor, result.cursor)
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

watch(() => profile.body, (body) => {
	if (previewTimer)
		clearTimeout(previewTimer)
	previewLoading.value = true
	previewTimer = setTimeout(refreshPreview, 300, body)
}, { immediate: true })

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
onBeforeUnmount(() => {
	if (previewTimer)
		clearTimeout(previewTimer)
})
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
					<p>Markdown 内容，可上传图片并实时预览，保存后直接提交 Git。</p>
				</div>
				<button class="admin-button" type="button" @click="mediaPickerOpen = true">
					<Icon name="tabler:photo-plus" />插入图片
				</button>
			</header>
			<label class="admin-field"><span>标题</span><input v-model="profile.title" maxlength="120"></label>
			<label class="admin-field"><span>摘要</span><textarea v-model="profile.summary" rows="3" maxlength="500" />
			</label>
			<label class="admin-field"><span>头像 URL（可选）</span><input v-model="profile.avatar" type="url" placeholder="https://..."></label>
			<div class="admin-about-editor-workspace">
				<label class="admin-field admin-about-editor-pane">
					<span>正文 Markdown</span>
					<textarea ref="bodyTextarea" v-model="profile.body" rows="22" spellcheck="false" />
				</label>
				<div class="admin-about-editor-pane admin-editor-preview">
					<div class="admin-preview-header">
						<span>实时预览</span>
						<small v-if="previewLoading">解析中…</small>
					</div>
					<p v-if="previewError" class="admin-error">
						预览更新失败，已保留上一次成功结果：{{ previewError }}
					</p>
					<article v-if="lastSuccessfulPreview" class="admin-preview-content" v-html="lastSuccessfulPreview" />
				</div>
			</div>
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
	<AdminMediaPicker
		:open="mediaPickerOpen"
		kind="image"
		upload-purpose="profile"
		@close="mediaPickerOpen = false"
		@select="insertMedia"
	/>
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

.admin-about-editor-workspace {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.8rem;
}

.admin-about-editor-pane {
	min-width: 0;
	min-height: 30rem;
}

.admin-field.admin-about-editor-pane textarea {
	min-height: 30rem;
	font-family: "JetBrains Mono", monospace;
	resize: vertical;
}

.admin-about-editor-pane.admin-editor-preview {
	max-height: 38rem;
	padding: 0.75rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.72rem;
	background: var(--admin-surface-soft);
}

.admin-field textarea {
	min-height: auto;
}

@media (max-width: 980px) {
	.admin-about-grid {
		grid-template-columns: 1fr;
	}

	.admin-about-editor-workspace {
		grid-template-columns: 1fr;
	}

	.admin-about-editor-pane,
	.admin-field.admin-about-editor-pane textarea {
		min-height: 22rem;
	}
}
</style>
