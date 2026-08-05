<script setup lang="ts">
import type { ModulesConfig } from '#shared/admin/site-config'
import modulesSource from '~~/config/site/modules.json'
import { toAdminUserMessage } from '#shared/admin/feedback'
import { isNavigationModuleId } from '#shared/admin/modules'
import { modulesConfigSchema, weatherConfigSchema } from '#shared/admin/site-config'
import AdminAdvancedDetails from '~/components/admin/AdminAdvancedDetails.vue'
import AdminTaskHeader from '~/components/admin/AdminTaskHeader.vue'
import { buildConfigPullRequest } from '~/types/admin'

interface PullRequestResult {
	pullRequestNumber: number
	pullRequestUrl: string
	branch: string
	resourcePath: string
}

interface ConfigResult {
	kind: string
	path: string
	sha: string
	content: unknown
}

const props = withDefaults(defineProps<{ embedded?: boolean, active?: boolean }>(), { embedded: false, active: true })

const emit = defineEmits<{
	dirtyChange: [dirty: boolean]
}>()

const labels: Record<ModulesConfig[number]['id'], { title: string, description: string, icon: string }> = {
	'articles': { title: '文章', description: '首页文章列表与文章详情。', icon: 'tabler:file-text' },
	'about': { title: '自述', description: '站长自述、时间线与链接。', icon: 'tabler:user-circle' },
	'moments': { title: '瞬间', description: '实时动态、点赞与评论入口。', icon: 'tabler:sparkles' },
	'ai-news': { title: 'AI 阅闻', description: '站长资讯、AI HOT 与每日早报。', icon: 'tabler:news' },
	'weather': { title: '城市天气', description: '右侧栏固定站长城市天气。', icon: 'ri:sun-cloudy-line' },
	'music': { title: '随心听', description: '全站持续播放的个人歌单。', icon: 'tabler:headphones' },
	'links': { title: '友链', description: '友链页面与订阅信息。', icon: 'tabler:friends' },
	'archive': { title: '归档', description: '按年份整理的文章归档。', icon: 'tabler:archive' },
}

const sortModules = (value: unknown) => modulesConfigSchema.parse(value).toSorted((left, right) => left.order - right.order)
const modules = ref<ModulesConfig>(sortModules(structuredClone(modulesSource) as unknown))
const baselineFingerprint = ref(JSON.stringify(modules.value))
const submittedFingerprint = ref('')
const currentFingerprint = computed(() => JSON.stringify(modules.value))
const hasChanges = computed(() => baselineFingerprint.value !== currentFingerprint.value && submittedFingerprint.value !== currentFingerprint.value)
const saving = ref(false)
const syncing = ref(false)
const error = ref<string | null>(null)
const syncError = ref<string | null>(null)
const result = ref<PullRequestResult | null>(null)
const deployedSha = ref<string | null>(null)
const syncedAt = ref<string | null>(null)
const loaded = ref(false)
const weatherCity = ref('')
const weatherReady = ref(false)
const articlesEnabled = computed(() => modules.value.find(module => module.id === 'articles')?.enabled ?? false)
const weatherDescription = computed(() => weatherReady.value
	? `右侧栏固定显示${weatherCity.value}天气。`
	: '模块已开启时，还需在站点设置中选择天气城市。')
const navigationPreview = computed(() => modules.value
	.filter(module => module.enabled && isNavigationModuleId(module.id))
	.map(module => labels[module.id].title))
const taskStatus = computed(() => {
	if (syncing.value)
		return '正在读取线上模块配置…'
	if (saving.value)
		return '正在生成预览…'
	if (hasChanges.value)
		return '存在未保存的模块改动'
	if (submittedFingerprint.value === currentFingerprint.value)
		return '这版模块设置已提交审核'
	if (syncedAt.value)
		return `已读取线上配置 · ${syncedAt.value}`
	return '正在使用页面内置配置'
})
const taskTone = computed(() => error.value || syncError.value ? 'danger' : hasChanges.value ? 'warning' : 'positive')

if (!props.embedded)
	useAdminUnsavedChanges(hasChanges)

watch(hasChanges, dirty => emit('dirtyChange', dirty), { immediate: true })

watch(articlesEnabled, (enabled) => {
	if (!enabled) {
		const archive = modules.value.find(module => module.id === 'archive')
		if (archive)
			archive.enabled = false
	}
})

async function loadDeployedModules() {
	if (syncing.value)
		return
	syncing.value = true
	syncError.value = null
	try {
		const [moduleConfig, weatherConfig] = await Promise.all([
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/modules'),
			useAdminApi<ConfigResult>('/api/admin/publishing/configs/weather'),
		])
		modules.value = sortModules(moduleConfig.content)
		baselineFingerprint.value = JSON.stringify(modules.value)
		submittedFingerprint.value = ''
		const deployedWeather = weatherConfigSchema.parse(weatherConfig.content)
		weatherCity.value = deployedWeather.city
		weatherReady.value = Boolean(
			deployedWeather.enabled
			&& deployedWeather.city
			&& deployedWeather.latitude !== null
			&& deployedWeather.longitude !== null,
		)
		deployedSha.value = moduleConfig.sha
		loaded.value = true
		syncedAt.value = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
	}
	catch (cause) {
		syncError.value = toAdminUserMessage(cause, '线上模块配置读取失败')
	}
	finally {
		syncing.value = false
	}
}

function requestReload() {
	if (hasChanges.value) {
		// eslint-disable-next-line no-alert -- replacing local edits requires explicit synchronous confirmation
		const confirmed = window.confirm('当前首页模块还有未保存的改动，重新读取会覆盖这些改动。确定继续吗？')
		if (!confirmed)
			return
	}
	void loadDeployedModules()
}

function normalize() {
	modules.value.forEach((module, index) => {
		module.order = index
	})
}

function moveTarget(index: number, direction: -1 | 1) {
	for (let target = index + direction; target >= 0 && target < modules.value.length; target += direction) {
		if (isNavigationModuleId(modules.value[target]!.id))
			return target
	}
	return -1
}

function navigationPosition(index: number) {
	return modules.value.slice(0, index + 1).filter(module => isNavigationModuleId(module.id)).length
}

function moduleStatus(module: ModulesConfig[number]) {
	if (module.id === 'archive' && !articlesEnabled.value)
		return '归档依赖文章，需先启用文章'
	return module.enabled ? '前台已显示' : '前台已隐藏'
}

function canMove(index: number, direction: -1 | 1) {
	return isNavigationModuleId(modules.value[index]!.id) && moveTarget(index, direction) >= 0
}

function move(index: number, direction: -1 | 1) {
	const target = moveTarget(index, direction)
	if (target < 0)
		return
	const current = modules.value[index]!
	modules.value[index] = modules.value[target]!
	modules.value[target] = current
	normalize()
}

async function save() {
	if (!hasChanges.value || saving.value)
		return
	saving.value = true
	error.value = null
	result.value = null
	try {
		normalize()
		const content = modulesConfigSchema.parse(modules.value)
		result.value = await useAdminApi('/api/admin/publishing/pull-requests', {
			method: 'POST',
			body: buildConfigPullRequest('modules', content, `modules-${crypto.randomUUID()}`),
		})
		submittedFingerprint.value = currentFingerprint.value
	}
	catch (cause) {
		error.value = toAdminUserMessage(cause, '首页模块保存失败')
	}
	finally {
		saving.value = false
	}
}

onMounted(() => {
	if (props.active)
		void loadDeployedModules()
})

watch(() => props.active, (active) => {
	if (active && !loaded.value)
		void loadDeployedModules()
})
</script>

<template>
<section class="admin-module-workbench" :class="{ 'is-embedded': embedded }">
	<AdminTaskHeader
		v-if="!embedded"
		eyebrow="公开站点"
		title="首页模块"
		description="控制模块是否展示，并调整公开导航中的先后顺序。天气和随心听使用固定位置，归档依赖文章。"
		:status="taskStatus"
		:status-tone="taskTone"
	>
		<template #actions>
			<button class="admin-button" type="button" :disabled="syncing" @click="requestReload">
				<Icon name="tabler:refresh" />{{ syncing ? '读取中…' : '重新读取线上配置' }}
			</button>
			<button class="admin-button admin-button-primary" type="button" :disabled="saving || !hasChanges" @click="save">
				<Icon name="tabler:eye-check" />{{ saving ? '正在生成…' : hasChanges ? '保存并生成预览' : '没有改动' }}
			</button>
		</template>
	</AdminTaskHeader>

	<header v-else class="admin-panel-header admin-module-embedded-header">
		<div>
			<h2>首页模块</h2>
			<p>控制公开模块和导航顺序。保存后先生成预览，不会直接影响线上。</p>
		</div>
		<div class="admin-heading-actions">
			<NuxtLink class="admin-button" to="/admin/modules">
				<Icon name="tabler:external-link" />前往模块管理
			</NuxtLink>
			<button class="admin-button" type="button" :disabled="syncing" @click="requestReload">
				<Icon name="tabler:refresh" />{{ syncing ? '读取中…' : '读取线上配置' }}
			</button>
			<button class="admin-button admin-button-primary" type="button" :disabled="saving || !hasChanges" @click="save">
				<Icon name="tabler:eye-check" />{{ saving ? '正在生成…' : hasChanges ? '保存并生成预览' : '没有改动' }}
			</button>
		</div>
	</header>

	<div v-if="embedded" class="admin-task-status" :data-tone="taskTone" aria-live="polite">
		<span class="admin-task-status-dot" aria-hidden="true" />{{ taskStatus }}
	</div>
	<p v-if="syncError" class="admin-error" role="alert">
		{{ syncError }}
	</p>
	<p v-if="error" class="admin-error" role="alert">
		{{ error }}
	</p>

	<div v-if="result" class="admin-success admin-module-success">
		<div>
			<strong>预览任务已创建</strong>
			<span>自动检查通过后，可在发布与审核中查看预览并确认上线。</span>
		</div>
		<NuxtLink class="admin-button" to="/admin/reviews">
			前往发布与审核
		</NuxtLink>
	</div>

	<section class="admin-panel admin-module-preview">
		<div>
			<span>公开导航顺序</span>
			<strong>{{ navigationPreview.length ? navigationPreview.join(' → ') : '当前没有启用的导航模块' }}</strong>
		</div>
		<small>天气和随心听位于固定区域，不参与左侧导航排序。</small>
	</section>

	<div class="admin-module-grid">
		<article v-for="(module, index) in modules" :key="module.id" class="admin-panel admin-module-card">
			<div class="admin-module-icon">
				<Icon :name="labels[module.id].icon" />
			</div>
			<div class="admin-module-copy">
				<strong>{{ labels[module.id].title }}</strong>
				<span>{{ module.id === 'weather' ? weatherDescription : labels[module.id].description }}</span>
			</div>
			<label class="admin-module-switch">
				<input v-model="module.enabled" type="checkbox" :disabled="module.id === 'archive' && !articlesEnabled">
				<span>{{ moduleStatus(module) }}</span>
			</label>
			<div class="admin-module-order">
				<span>{{ isNavigationModuleId(module.id) ? `导航顺序 ${navigationPosition(index)}` : '固定位置' }}</span>
				<template v-if="isNavigationModuleId(module.id)">
					<button class="admin-icon-button" type="button" :aria-label="`上移${labels[module.id].title}`" :disabled="!canMove(index, -1)" @click="move(index, -1)">
						<Icon name="tabler:arrow-up" />
					</button>
					<button class="admin-icon-button" type="button" :aria-label="`下移${labels[module.id].title}`" :disabled="!canMove(index, 1)" @click="move(index, 1)">
						<Icon name="tabler:arrow-down" />
					</button>
				</template>
			</div>
		</article>
	</div>

	<AdminAdvancedDetails v-if="result || deployedSha" title="发布与配置详情">
		<div class="admin-module-technical-grid">
			<div><span>线上配置</span><code>{{ deployedSha || '尚未读取' }}</code></div>
			<div><span>Pull Request</span><code>{{ result ? `#${result.pullRequestNumber}` : '尚未创建' }}</code></div>
			<div><span>配置路径</span><code>{{ result?.resourcePath || 'config/site/modules.json' }}</code></div>
			<div><span>分支</span><code>{{ result?.branch || '—' }}</code></div>
		</div>
		<a v-if="result" class="admin-button" :href="result.pullRequestUrl" target="_blank" rel="noopener">在 GitHub 查看</a>
	</AdminAdvancedDetails>
</section>
</template>

<style scoped lang="scss">
.admin-module-workbench {
	display: grid;
	gap: 1rem;
}

.admin-module-embedded-header {
	align-items: center;
	margin-bottom: 0;
}

.admin-module-success span {
	display: block;
	margin-top: 0.2rem;
	font-size: 0.68rem;
}

.admin-module-preview {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.admin-module-preview span,
.admin-module-preview strong {
	display: block;
}

.admin-module-preview span,
.admin-module-preview small {
	font-size: 0.68rem;
	color: var(--admin-muted);
}

.admin-module-preview strong {
	margin-top: 0.3rem;
	font-size: 0.84rem;
	line-height: 1.6;
}

.admin-module-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.85rem;
}

.admin-module-card {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.8rem;
	padding: 1rem;
}

.admin-module-icon {
	display: grid;
	place-items: center;
	width: 3rem;
	height: 3rem;
	border-radius: 1rem;
	background: var(--admin-accent-soft);
	font-size: 1.4rem;
	color: var(--admin-accent-strong);
}

.admin-module-copy {
	display: grid;
	gap: 0.25rem;
}

.admin-module-copy span,
.admin-module-order,
.admin-module-switch {
	font-size: 0.7rem;
	color: var(--admin-muted);
}

.admin-module-switch {
	display: grid;
	justify-items: center;
	gap: 0.25rem;
}

.admin-module-order {
	display: flex;
	grid-column: 2 / -1;
	align-items: center;
	justify-content: flex-end;
	gap: 0.35rem;
}

.admin-module-technical-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.65rem;
	margin-bottom: 0.8rem;
}

.admin-module-technical-grid > div {
	display: grid;
	gap: 0.2rem;
	min-width: 0;
	padding: 0.65rem;
	border-radius: 0.7rem;
	background: var(--admin-surface);
}

.admin-module-technical-grid span {
	font-size: 0.62rem;
	color: var(--admin-muted);
}

.admin-module-technical-grid code {
	overflow: hidden;
	font-size: 0.68rem;
	white-space: nowrap;
	text-overflow: ellipsis;
}

@media (max-width: 800px) {
	.admin-module-grid,
	.admin-module-technical-grid {
		grid-template-columns: 1fr;
	}

	.admin-module-embedded-header,
	.admin-module-preview {
		flex-direction: column;
		align-items: stretch;
	}
}
</style>
