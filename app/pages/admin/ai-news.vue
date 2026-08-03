<script setup lang="ts">
import type { NewsItemDto } from '#shared/admin/news'

interface NewsAdminData {
	items: NewsItemDto[]
	total: number
	briefing: Record<string, unknown> | null
	sources: Array<{
		source_id: string
		status: string
		item_count: number
		last_success_at: string | null
		last_error: string | null
	}>
}
const data = ref<NewsAdminData | null>(null)
const loading = ref(true)
const working = ref(false)
const error = ref('')
const success = ref('')
const form = reactive({
	title: '',
	summary: '',
	url: '',
	category: '手动精选',
})
useSeoMeta({ title: 'AI 阅闻管理', robots: 'noindex, nofollow' })

async function load() {
	loading.value = true
	error.value = ''
	try {
		data.value = await useAdminApi<NewsAdminData>('/api/admin/news')
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '阅闻数据加载失败'
	}
	finally {
		loading.value = false
	}
}
async function sync() {
	working.value = true
	error.value = ''
	success.value = ''
	try {
		await useAdminApi('/api/admin/news/sync', { method: 'POST' })
		success.value = '来源同步完成。'
		await load()
	}
	catch (cause) {
		error.value
			= cause instanceof Error ? cause.message : '同步失败，已保留上次快照。'
	}
	finally {
		working.value = false
	}
}
async function addManual() {
	working.value = true
	error.value = ''
	success.value = ''
	try {
		await useAdminApi('/api/admin/news/manual', {
			method: 'POST',
			body: { ...form, idempotencyKey: `news-manual-${crypto.randomUUID()}` },
		})
		Object.assign(form, {
			title: '',
			summary: '',
			url: '',
			category: '手动精选',
		})
		success.value = '手动精选卡片已添加。'
		await load()
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '手动卡片保存失败'
	}
	finally {
		working.value = false
	}
}
onMounted(load)
</script>

<template>
<section>
	<header class="admin-page-heading">
		<div>
			<span class="admin-badge">CRON · D1 · SOURCES</span>
			<h1>AI 阅闻</h1>
			<p>聚合 AI HOT 和在花 RSS，也可添加低风险手动精选。</p>
		</div>
		<div class="admin-heading-actions">
			<a class="admin-button" href="/ai.news" target="_blank" rel="noopener"><Icon name="tabler:external-link" />查看页面</a><button
				class="admin-button admin-button-primary"
				type="button"
				:disabled="working"
				@click="sync"
			>
				<Icon name="tabler:refresh" />立即同步
			</button>
		</div>
	</header>
	<p v-if="error" class="admin-error">
		{{ error }}
	</p>
	<p v-if="success" class="admin-success">
		{{ success }}
	</p>
	<div class="admin-news-layout">
		<section class="admin-panel admin-news-manual">
			<header class="admin-panel-header">
				<div>
					<h2>手动精选</h2>
					<p>只保存摘要与原文链接，不镜像全文。</p>
				</div>
			</header>
			<label class="admin-field"><span>标题</span><input v-model="form.title" maxlength="500"></label><label class="admin-field"><span>摘要</span><textarea v-model="form.summary" rows="5" maxlength="5000" /></label><label class="admin-field"><span>原文链接</span><input
				v-model="form.url"
				type="url"
				placeholder="https://..."
			></label><label class="admin-field"><span>分类</span><input v-model="form.category" maxlength="120"></label><button
				class="admin-button admin-button-primary"
				type="button"
				:disabled="working || !form.title || !form.url"
				@click="addManual"
			>
				添加卡片
			</button>
		</section>
		<section class="admin-panel admin-news-sources">
			<header class="admin-panel-header">
				<div>
					<h2>来源状态</h2>
					<p>失败时前台继续使用最后成功快照。</p>
				</div>
			</header>
			<div v-if="loading" class="admin-skeleton admin-list-skeleton" />
			<ul v-else class="admin-action-list">
				<li
					v-for="source in data?.sources"
					:key="source.source_id"
					class="admin-service-row"
				>
					<div>
						<strong>{{ source.source_id }}</strong><span>{{ source.item_count }} 条 ·
							{{ source.last_success_at || "尚未成功" }}</span>
					</div>
					<AdminStatusPill
						:tone="source.status === 'success' ? 'positive' : 'danger'"
					>
						{{ source.status }}
					</AdminStatusPill>
				</li>
			</ul>
		</section>
	</div>
	<section class="admin-panel admin-news-items">
		<header class="admin-panel-header">
			<div>
				<h2>当前候选池</h2>
				<p>{{ data?.total || 0 }} 条公开卡片</p>
			</div>
		</header>
		<div v-if="loading" class="admin-action-list">
			<div
				v-for="i in 6"
				:key="i"
				class="admin-skeleton admin-list-skeleton"
			/>
		</div>
		<div v-else class="admin-content-list">
			<a
				v-for="item in data?.items"
				:key="item.id"
				class="admin-news-item"
				:href="item.url"
				target="_blank"
				rel="noopener noreferrer"
			><span>{{ item.category || item.kind }}</span><strong>{{ item.title }}</strong><small>{{ item.sourceId }} ·
				{{ item.publishedAt || item.fetchedAt }}</small></a>
		</div>
	</section>
</section>
</template>

<style scoped lang="scss">
.admin-news-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.8fr);
	gap: 1rem;
}

.admin-news-manual,
.admin-news-sources,
.admin-news-items {
	padding: 1rem;
}

.admin-news-items {
	margin-top: 1rem;
}

.admin-news-item {
	display: grid;
	grid-template-columns: 7rem minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.7rem;
	padding: 0.8rem;
	border: 1px solid var(--admin-border);
	border-radius: 0.8rem;
}

.admin-news-item span {
	font-size: 0.68rem;
	color: var(--admin-accent);
}

.admin-news-item small {
	color: var(--admin-muted);
}

@media (max-width: 900px) {
	.admin-news-layout {
		grid-template-columns: 1fr;
	}

	.admin-news-item {
		grid-template-columns: 1fr;
	}
}
</style>
