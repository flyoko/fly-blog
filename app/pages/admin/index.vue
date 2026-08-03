<script setup lang="ts">
import type { AdminOverviewDto } from '~/types/admin'
import { serviceStatusMeta } from '~/types/admin'

const adminStore = useAdminStore()
const overview = ref<AdminOverviewDto | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

useSeoMeta({
	title: '创作工作台',
	robots: 'noindex, nofollow',
})

const greeting = computed(() => {
	const hour = new Date().getHours()
	if (hour < 6)
		return '夜深了'
	if (hour < 12)
		return '早上好'
	if (hour < 18)
		return '下午好'
	return '晚上好'
})

const stats = computed(() => [
	{ label: '文章', value: overview.value?.counts.articles ?? null, icon: 'tabler:file-text', note: '仓库内容' },
	{ label: '媒体', value: overview.value?.counts.activeMedia ?? null, icon: 'tabler:photo', note: 'R2 活跃对象' },
	{ label: '待审核', value: overview.value?.counts.openPullRequests ?? null, icon: 'tabler:git-pull-request', note: '开放的变更' },
	{ label: '发布中', value: overview.value?.counts.pendingPublishes ?? null, icon: 'tabler:loader-2', note: '构建与检查' },
	{
		label: '失败',
		value: overview.value?.counts.failedPublishes ?? null,
		icon: 'tabler:alert-triangle',
		note: '需要处理',
		tone: overview.value?.counts.failedPublishes ? 'danger' as const : 'neutral' as const,
	},
])

async function refresh() {
	loading.value = true
	error.value = null
	try {
		overview.value = await useAdminApi<AdminOverviewDto>('/api/admin/overview')
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '概览加载失败'
	}
	finally {
		loading.value = false
	}
}

onMounted(refresh)
</script>

<template>
<div>
	<section class="admin-hero">
		<div class="admin-hero-content">
			<span class="admin-hero-eyebrow">个人创作空间</span>
			<h1>{{ greeting }}，{{ adminStore.session.user?.login || 'fly' }}</h1>
			<p>记录技术、学习与生活，也记录此刻。今天可以从一篇文章、一次整理，或者一段轻松的瞬间开始。</p>
			<div class="admin-hero-actions">
				<NuxtLink class="admin-button admin-button-hero" to="/admin/articles/new">
					<Icon name="tabler:pencil-plus" />
					写文章
				</NuxtLink>
				<NuxtLink class="admin-button admin-button-ghost" to="/admin/moments">
					<Icon name="tabler:sparkles" />
					发瞬间
				</NuxtLink>
				<NuxtLink class="admin-button admin-button-ghost" to="/admin/ai-news">
					<Icon name="tabler:news" />
					整理阅闻
				</NuxtLink>
			</div>
		</div>
	</section>

	<p v-if="error" class="admin-error">
		{{ error }}
		<button type="button" class="admin-button" @click="refresh">
			重新加载
		</button>
	</p>

	<div v-if="loading" class="admin-grid admin-grid-stats">
		<div v-for="index in 5" :key="index" class="admin-skeleton" />
	</div>
	<div v-else class="admin-grid admin-grid-stats">
		<AdminStatusCard
			v-for="item in stats"
			:key="item.label"
			:label="item.label"
			:value="item.value"
			:icon="item.icon"
			:note="item.note"
			:tone="item.tone"
		/>
	</div>

	<div class="admin-grid admin-grid-dashboard">
		<section class="admin-panel">
			<header class="admin-panel-header">
				<div>
					<h2>继续创作</h2>
					<p>从最常用的内容入口开始。</p>
				</div>
			</header>
			<div class="admin-action-list">
				<NuxtLink class="admin-action-item" to="/admin/articles/new">
					<Icon name="tabler:file-plus" />
					<div><strong>新建文章</strong><span>编辑 Markdown、封面、分类和发布方式</span></div>
					<Icon name="tabler:chevron-right" />
				</NuxtLink>
				<NuxtLink class="admin-action-item" to="/admin/media">
					<Icon name="tabler:cloud-upload" />
					<div><strong>整理媒体</strong><span>上传图片、封面与音频文件</span></div>
					<Icon name="tabler:chevron-right" />
				</NuxtLink>
				<NuxtLink class="admin-action-item" to="/admin/reviews">
					<Icon name="tabler:git-pull-request" />
					<div><strong>查看发布与审核</strong><span>检查构建、预览与待合并变更</span></div>
					<Icon name="tabler:chevron-right" />
				</NuxtLink>
			</div>
		</section>

		<section class="admin-panel">
			<header class="admin-panel-header">
				<div>
					<h2>服务状态</h2>
					<p>数据来自当前依赖探针。</p>
				</div>
				<button class="admin-icon-button" type="button" aria-label="刷新服务状态" @click="refresh">
					<Icon name="tabler:refresh" />
				</button>
			</header>
			<div class="admin-service-list">
				<div
					v-for="service in overview?.services || []"
					:key="service.service"
					class="admin-service-item"
					:data-status="service.status"
				>
					<span class="admin-service-item-dot" aria-hidden="true" />
					<div>
						<strong>{{ service.service.toUpperCase() }}</strong>
						<span>{{ service.message || serviceStatusMeta(service.status).label }}</span>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>
</template>
