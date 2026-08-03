<script setup lang="ts">
import type { ModulesConfig } from '#shared/admin/site-config'
import modulesSource from '~~/config/site/modules.json'
import { isNavigationModuleId } from '#shared/admin/modules'
import { modulesConfigSchema } from '#shared/admin/site-config'
import { buildConfigPullRequest } from '~/types/admin'

interface PullRequestResult {
	pullRequestNumber: number
	pullRequestUrl: string
	branch: string
	resourcePath: string
}

const labels: Record<ModulesConfig[number]['id'], { title: string, description: string, icon: string }> = {
	'articles': { title: '文章', description: '首页文章列表与文章详情。', icon: 'tabler:file-text' },
	'about': { title: '自述', description: '站长自述、时间线与链接。', icon: 'tabler:user-circle' },
	'moments': { title: '瞬间', description: '实时动态、点赞与评论入口。', icon: 'tabler:sparkles' },
	'ai-news': { title: 'AI 阅闻', description: '站长资讯、AI HOT 与每日早报。', icon: 'tabler:news' },
	'weather': { title: '城市天气', description: '右侧栏固定站长城市天气。', icon: 'tabler:cloud-sun' },
	'music': { title: '随心听', description: '全站持续播放的个人歌单。', icon: 'tabler:headphones' },
	'links': { title: '友链', description: '友链页面与订阅信息。', icon: 'tabler:friends' },
	'archive': { title: '归档', description: '按年份整理的文章归档。', icon: 'tabler:archive' },
}

const modules = ref<ModulesConfig>(modulesConfigSchema.parse(structuredClone(modulesSource) as unknown).toSorted((left, right) => left.order - right.order))
const saving = ref(false)
const error = ref<string | null>(null)
const result = ref<PullRequestResult | null>(null)
const articlesEnabled = computed(() => modules.value.find(module => module.id === 'articles')?.enabled ?? false)

useSeoMeta({ title: '模块管理', robots: 'noindex, nofollow' })

watch(articlesEnabled, (enabled) => {
	if (!enabled) {
		const archive = modules.value.find(module => module.id === 'archive')
		if (archive)
			archive.enabled = false
	}
})

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
		return '需先启用文章'
	return module.enabled ? '已启用' : '已停用'
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
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '模块配置 Pull Request 创建失败'
	}
	finally {
		saving.value = false
	}
}
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">可视化配置 · PR 审核</span>
			<h1>模块管理</h1>
			<p>控制公开模块的启用状态；导航模块可调整左侧栏顺序，天气和随心听使用固定位置。归档依赖文章模块。创建 PR 后需审核、合并并部署后生效。</p>
		</div>
		<button class="admin-button admin-button-primary" type="button" :disabled="saving" @click="save">
			<Icon name="tabler:git-pull-request" />
			{{ saving ? '正在创建…' : '创建模块 PR' }}
		</button>
	</header>

	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<div v-if="result" class="admin-success admin-pr-result">
		<div>
			<strong>Pull Request #{{ result.pullRequestNumber }} 已创建</strong>
			<span>{{ result.resourcePath }} · {{ result.branch }} · 合并并部署后生效</span>
		</div>
		<a class="admin-button" :href="result.pullRequestUrl" target="_blank" rel="noopener">查看 PR</a>
	</div>

	<div class="module-grid">
		<article v-for="(module, index) in modules" :key="module.id" class="admin-panel module-card">
			<div class="module-icon">
				<Icon :name="labels[module.id].icon" />
			</div>
			<div class="module-copy">
				<strong>{{ labels[module.id].title }}</strong>
				<span>{{ labels[module.id].description }}</span>
			</div>
			<label class="module-switch">
				<input v-model="module.enabled" type="checkbox" :disabled="module.id === 'archive' && !articlesEnabled">
				<span>{{ moduleStatus(module) }}</span>
			</label>
			<div class="module-order">
				<span>{{ isNavigationModuleId(module.id) ? `导航顺序 ${navigationPosition(index)}` : '固定位置' }}</span>
				<template v-if="isNavigationModuleId(module.id)">
					<button class="admin-icon-button" type="button" aria-label="上移模块" :disabled="!canMove(index, -1)" @click="move(index, -1)">
						<Icon name="tabler:arrow-up" />
					</button>
					<button class="admin-icon-button" type="button" aria-label="下移模块" :disabled="!canMove(index, 1)" @click="move(index, 1)">
						<Icon name="tabler:arrow-down" />
					</button>
				</template>
			</div>
		</article>
	</div>
</section>
</template>

<style scoped lang="scss">
.module-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
}

.module-card {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 1rem;
	padding: 1rem;
}

.module-icon {
	display: grid;
	place-items: center;
	width: 3rem;
	height: 3rem;
	border-radius: 1rem;
	background: var(--admin-accent-soft);
	font-size: 1.5rem;
	color: var(--admin-accent);
}

.module-copy {
	display: grid;
	gap: 0.25rem;
}

.module-copy span,
.module-order {
	font-size: 0.75rem;
	color: var(--admin-muted);
}

.module-switch {
	display: grid;
	justify-items: center;
	gap: 0.2rem;
	font-size: 0.7rem;
}

.module-order {
	display: flex;
	grid-column: 2 / -1;
	align-items: center;
	justify-content: flex-end;
	gap: 0.35rem;
}

@media (max-width: 800px) {
	.module-grid {
		grid-template-columns: 1fr;
	}
}
</style>
