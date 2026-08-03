<script setup lang="ts">
import type { NewsItemDto } from '#shared/admin/news'

interface Briefing {
	date: string
	title: string
	lead: string | null
	content_json: string
	source_url: string
	generated_at: string
}

interface NewsSourceState {
	source_id: string
	status: 'success' | 'failed'
	item_count: number
	last_success_at: string | null
	last_error: string | null
	next_sync_at: string | null
}

interface NewsPayload {
	items: NewsItemDto[]
	total: number
	briefing: Briefing | null
	sources: NewsSourceState[]
}

interface DailySection {
	label: string
	items: Array<{
		title: string
		summary?: string
	}>
}

interface DailyHighlight {
	sectionLabel: string
	title: string
	summary?: string
}

type NewsFilter = 'all' | 'hot' | 'rss' | 'manual'

const filterOptions: Array<{ id: NewsFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'hot', label: 'AI 精选' },
	{ id: 'rss', label: '站长资讯' },
	{ id: 'manual', label: '手动精选' },
]

const sourceLabels: Record<NewsItemDto['kind'], string> = {
	hot: 'AI 精选',
	daily: 'AI 日报',
	rss: '站长资讯',
	manual: '手动精选',
}

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
})

const data = ref<NewsPayload | null>(null)
const loading = ref(true)
const error = ref('')
const filter = ref<NewsFilter>('all')
const query = ref('')

const dailySections = computed<DailySection[]>(() => {
	if (!data.value?.briefing)
		return []
	try {
		const parsed = JSON.parse(data.value.briefing.content_json) as unknown
		if (!Array.isArray(parsed))
			return []
		return parsed.filter((section): section is DailySection => Boolean(
			section
			&& typeof section === 'object'
			&& 'label' in section
			&& typeof section.label === 'string'
			&& 'items' in section
			&& Array.isArray(section.items),
		))
	}
	catch {
		return []
	}
})

const dailyHighlights = computed<DailyHighlight[]>(() => dailySections.value
	.flatMap(section => section.items.map(item => ({
		sectionLabel: section.label,
		title: item.title,
		summary: item.summary,
	})))
	.filter(item => item.title)
	.slice(0, 5),
)

const visibleItems = computed<NewsItemDto[]>(() => {
	const normalizedQuery = query.value.trim().toLocaleLowerCase('zh-CN')
	return (data.value?.items || []).filter((item) => {
		if (filter.value !== 'all' && item.kind !== filter.value)
			return false
		if (!normalizedQuery)
			return true
		return [item.title, item.summary, item.category, sourceLabels[item.kind]]
			.filter((value): value is string => Boolean(value))
			.join('\n')
			.toLocaleLowerCase('zh-CN')
			.includes(normalizedQuery)
	})
})

const degradedSources = computed(() =>
	data.value?.sources.filter(source => source.status === 'failed') || [],
)

const latestSyncAt = computed(() => {
	const timestamps = (data.value?.sources || [])
		.map(source => source.last_success_at)
		.filter((value): value is string => Boolean(value))
		.map(value => Date.parse(value))
		.filter(value => Number.isFinite(value))
	return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null
})

const briefingDate = computed(() => data.value?.briefing?.date.replaceAll('-', '.') || '')

useSeoMeta({
	title: 'AI 阅闻',
	description: '在 fly living 内阅读 AI 精选、站长资讯和每日简报，保留来源与原文入口。',
	ogTitle: 'AI 阅闻 · fly living',
	ogDescription: '站内阅读 AI 精选、站长资讯和每日简报。',
})

function sourceLabel(item: NewsItemDto) {
	return sourceLabels[item.kind]
}

function categoryLabel(item: NewsItemDto) {
	return item.category || sourceLabel(item)
}

function contentModeLabel(item: NewsItemDto) {
	if (item.contentMode === 'full')
		return '全文'
	if (item.contentMode === 'summary')
		return '摘要'
	return null
}

function formatDateTime(value: string | null) {
	if (!value)
		return '等待首次同步'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '时间未知'
	return dateTimeFormatter.format(date).replaceAll('/', '.')
}

function clearSearch() {
	query.value = ''
}

async function load() {
	loading.value = true
	error.value = ''
	try {
		data.value = await $fetch<{ data: NewsPayload }>('/api/news').then(result => result.data)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '阅闻加载失败'
	}
	finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="AI 阅闻" tag="h1" />
</div>
<section class="news-workbench">
	<header class="news-header">
		<div>
			<p class="news-eyebrow">
				AI · SIGNALS · DAILY
			</p>
			<h1>AI 阅闻</h1>
			<p class="news-intro">
				少一些跳转，多一些连续阅读。AI HOT 与站长资讯优先在博客内打开，同时保留原始来源。
			</p>
		</div>
		<div class="news-sync" :class="{ degraded: degradedSources.length }">
			<span class="news-sync-dot" aria-hidden="true" />
			<div>
				<strong>{{ degradedSources.length ? '部分来源暂不可用' : '自动聚合运行中' }}</strong>
				<span>最近更新 {{ formatDateTime(latestSyncAt) }}</span>
				<small>AI HOT 每 30 分钟 · 站长资讯每 60 分钟</small>
			</div>
		</div>
	</header>

	<div v-if="error || degradedSources.length" class="news-notices" aria-live="polite">
		<div v-if="degradedSources.length" class="news-notice card">
			<Icon name="tabler:cloud-off" aria-hidden="true" />
			<p>
				{{ degradedSources.map(source => source.source_id).join('、') }} 暂时同步失败，当前继续展示最后一次成功快照。
			</p>
		</div>
		<div v-if="error" class="news-notice news-notice-error card" role="alert">
			<Icon name="tabler:alert-circle" aria-hidden="true" />
			<p>{{ error }}</p>
			<button type="button" @click="load">
				重新加载
			</button>
		</div>
	</div>

	<section class="news-controls card" aria-label="阅闻筛选与搜索">
		<nav class="news-filter" aria-label="来源筛选">
			<button
				v-for="option in filterOptions"
				:key="option.id"
				type="button"
				:class="{ active: filter === option.id }"
				:aria-pressed="filter === option.id"
				@click="filter = option.id"
			>
				{{ option.label }}
			</button>
		</nav>
		<label class="news-search">
			<Icon name="tabler:search" aria-hidden="true" />
			<span class="sr-only">搜索标题或摘要</span>
			<input v-model="query" type="search" placeholder="搜索标题或摘要" autocomplete="off">
			<button v-if="query" type="button" aria-label="清空搜索" @click="clearSearch">
				<Icon name="tabler:x" aria-hidden="true" />
			</button>
		</label>
	</section>

	<div class="news-layout">
		<main class="news-feed card" aria-labelledby="news-feed-title">
			<header class="news-feed-header">
				<div>
					<h2 id="news-feed-title">
						最新收录
					</h2>
					<p>按发布时间排列，支持站内阅读的内容会优先留在博客中。</p>
				</div>
				<strong>{{ loading ? '同步中' : `${visibleItems.length} 条` }}</strong>
			</header>

			<div v-if="loading" class="news-skeletons" aria-label="正在加载资讯">
				<div v-for="index in 6" :key="index" class="news-skeleton" />
			</div>

			<div v-else-if="visibleItems.length" class="news-list" aria-live="polite">
				<article v-for="item in visibleItems" :key="item.id" class="news-row">
					<div class="news-row-rail" aria-hidden="true">
						<span />
					</div>
					<div class="news-row-body">
						<header class="news-row-meta">
							<span>{{ sourceLabel(item) }}</span>
							<span>{{ categoryLabel(item) }}</span>
							<span v-if="contentModeLabel(item)" class="news-content-mode">{{ contentModeLabel(item) }}</span>
							<time v-if="item.publishedAt" :datetime="item.publishedAt">{{ formatDateTime(item.publishedAt) }}</time>
							<span v-else>最近收录</span>
						</header>
						<h3>
							<NuxtLink v-if="item.readerPath" :to="item.readerPath">
								{{ item.title }}
							</NuxtLink>
							<a v-else :href="item.originalUrl || item.url" target="_blank" rel="noopener noreferrer">
								{{ item.title }}
							</a>
						</h3>
						<p v-if="item.summary" class="news-row-summary">
							{{ item.summary }}
						</p>
						<footer class="news-row-actions">
							<NuxtLink v-if="item.readerPath" class="news-primary-action" :to="item.readerPath">
								站内阅读<Icon name="tabler:arrow-right" aria-hidden="true" />
							</NuxtLink>
							<a
								v-else
								class="news-primary-action"
								:href="item.originalUrl || item.url"
								target="_blank"
								rel="noopener noreferrer"
							>
								访问原文<Icon name="tabler:arrow-up-right" aria-hidden="true" />
							</a>
							<a
								v-if="item.readerPath"
								class="news-source-action"
								:href="item.originalUrl || item.url"
								target="_blank"
								rel="noopener noreferrer"
							>
								原始来源
							</a>
						</footer>
					</div>
				</article>
			</div>

			<div v-else class="news-empty">
				<Icon name="tabler:search-off" aria-hidden="true" />
				<h3>没有匹配的资讯</h3>
				<p>调整来源筛选或清空搜索词后再试。</p>
				<button v-if="query" type="button" @click="clearSearch">
					清空搜索
				</button>
			</div>
		</main>

		<aside class="news-digest card" aria-labelledby="news-digest-title">
			<header class="news-digest-header">
				<div>
					<p>{{ briefingDate || '今日' }}</p>
					<h2 id="news-digest-title">
						今日日报
					</h2>
				</div>
				<Icon name="tabler:notes" aria-hidden="true" />
			</header>

			<template v-if="data?.briefing">
				<p v-if="data.briefing.lead" class="news-digest-lead">
					{{ data.briefing.lead }}
				</p>
				<ol v-if="dailyHighlights.length" class="news-digest-list">
					<li v-for="(highlight, index) in dailyHighlights" :key="`${highlight.sectionLabel}:${highlight.title}`">
						<span>{{ String(index + 1).padStart(2, '0') }}</span>
						<div>
							<small>{{ highlight.sectionLabel }}</small>
							<strong>{{ highlight.title }}</strong>
							<p v-if="highlight.summary">
								{{ highlight.summary }}
							</p>
						</div>
					</li>
				</ol>
				<a
					class="news-digest-source"
					:href="data.briefing.source_url"
					target="_blank"
					rel="noopener noreferrer"
				>
					查看 AI HOT 原始日报<Icon name="tabler:external-link" aria-hidden="true" />
				</a>
			</template>
			<div v-else-if="loading" class="news-digest-loading" aria-label="正在加载日报">
				<span v-for="index in 4" :key="index" />
			</div>
			<p v-else class="news-digest-empty">
				今日日报尚未生成，资讯流仍可正常阅读。
			</p>
		</aside>
	</div>
</section>
</template>

<style scoped lang="scss">
.news-workbench {
	display: grid;
	gap: 1rem;
	margin: clamp(0.8rem, 2vw, 1.4rem);
}

.news-header {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: end;
	gap: 2rem;
	padding: 0.65rem 0 0.25rem;
}

.news-eyebrow {
	font: 0.7rem var(--font-monospace);
	letter-spacing: 0.14em;
	color: var(--c-primary);
}

.news-header h1 {
	margin-top: 0.25rem;
	font: 2.35rem / 1.1 var(--font-creative);
	letter-spacing: -0.035em;
}

.news-intro {
	max-width: 41rem;
	margin-top: 0.55rem;
	font-size: 0.9rem;
	line-height: 1.7;
	color: var(--c-text-2);
}

.news-sync {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 0.65rem;
	min-width: 16rem;
	padding: 0.85rem 1rem;
	border-left: 1px solid var(--c-border);
}

.news-sync-dot {
	width: 0.55rem;
	height: 0.55rem;
	margin-top: 0.28rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.25rem var(--c-primary-soft);
	background: var(--c-primary);
}

.news-sync.degraded .news-sync-dot {
	background: var(--c-warning);
}

.news-sync strong,
.news-sync span,
.news-sync small {
	display: block;
}

.news-sync strong {
	font-size: 0.82rem;
	color: var(--c-text-1);
}

.news-sync span,
.news-sync small {
	margin-top: 0.2rem;
	font-size: 0.68rem;
	line-height: 1.4;
	color: var(--c-text-3);
}

.news-notices {
	display: grid;
	gap: 0.55rem;
}

.news-notice {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	padding: 0.7rem 0.85rem;
	border: 1px solid var(--c-border);
	font-size: 0.78rem;
	color: var(--c-text-2);
}

.news-notice .iconify {
	flex: 0 0 auto;
	color: var(--c-warning);
}

.news-notice-error .iconify {
	color: var(--c-error);
}

.news-notice button {
	margin-left: auto;
	white-space: nowrap;
	color: var(--c-primary);
}

.news-controls {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(15rem, 21rem);
	align-items: center;
	gap: 1rem;
	padding: 0.65rem;
	border: 1px solid var(--c-border);
	border-radius: 0.85rem;
	background: var(--ld-bg-card);
}

.news-filter {
	display: flex;
	gap: 0.25rem;
	overflow-x: auto;
	scrollbar-width: none;
}

.news-filter::-webkit-scrollbar {
	display: none;
}

.news-filter button {
	flex: 0 0 auto;
	min-height: 2.25rem;
	padding: 0.45rem 0.75rem;
	border-radius: 0.55rem;
	font-size: 0.76rem;
	color: var(--c-text-2);
	transition: background-color 0.18s, color 0.18s;
}

.news-filter button.active {
	background: var(--c-primary-soft);
	font-weight: 700;
	color: var(--c-primary);
}

.news-search {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.5rem;
	min-height: 2.35rem;
	padding: 0 0.65rem;
	border: 1px solid var(--c-border);
	border-radius: 0.6rem;
	background: var(--c-bg-2);
	color: var(--c-text-3);
}

.news-search input {
	min-width: 0;
	border: 0;
	outline: 0;
	background: transparent;
	font-size: 0.78rem;
	color: var(--c-text-1);
}

.news-search input::placeholder {
	color: var(--c-text-3);
}

.news-search button {
	display: grid;
	place-items: center;
	width: 1.55rem;
	height: 1.55rem;
	border-radius: 0.4rem;
	color: var(--c-text-3);
}

.news-layout {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(17rem, 21rem);
	align-items: start;
	gap: 1rem;
}

.news-feed,
.news-digest {
	border: 1px solid var(--c-border);
	border-radius: 0.9rem;
	background: var(--ld-bg-card);
}

.news-feed {
	overflow: hidden;
}

.news-feed-header {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 1.1rem;
	border-bottom: 1px solid var(--c-border);
}

.news-feed-header h2,
.news-digest-header h2 {
	font-size: 1.05rem;
	letter-spacing: -0.015em;
}

.news-feed-header p {
	margin-top: 0.22rem;
	font-size: 0.7rem;
	color: var(--c-text-3);
}

.news-feed-header > strong {
	font: 0.68rem var(--font-monospace);
	white-space: nowrap;
	color: var(--c-primary);
}

.news-row {
	display: grid;
	grid-template-columns: 1.15rem minmax(0, 1fr);
	gap: 0.7rem;
	padding: 1rem 1.1rem 1.05rem 0.85rem;
	transition: background-color 0.18s;
}

.news-row + .news-row {
	border-top: 1px solid var(--c-border);
}

.news-row-rail {
	display: flex;
	justify-content: center;
}

.news-row-rail span {
	width: 0.22rem;
	height: 2.25rem;
	border-radius: 0.2rem;
	background: var(--c-primary-soft);
	transition: background-color 0.18s;
}

.news-row-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4rem 0.65rem;
	font: 0.64rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-row-meta > :first-child {
	font-weight: 700;
	color: var(--c-primary);
}

.news-content-mode {
	padding: 0.15rem 0.35rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border));
	border-radius: 0.35rem;
	background: var(--c-primary-soft);
	color: var(--c-primary);
}

.news-row h3 {
	margin-top: 0.45rem;
	font: 1.08rem / 1.45 var(--font-creative);
	letter-spacing: -0.015em;
}

.news-row h3 a {
	color: var(--c-text-1);
}

.news-row-summary {
	display: -webkit-box;
	overflow: hidden;
	margin-top: 0.38rem;
	font-size: 0.78rem;
	-webkit-line-clamp: 3;
	line-height: 1.65;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.news-row-actions {
	display: flex;
	align-items: center;
	gap: 0.9rem;
	margin-top: 0.65rem;
	font-size: 0.7rem;
}

.news-primary-action,
.news-digest-source {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	font-weight: 700;
	color: var(--c-primary);
}

.news-source-action {
	color: var(--c-text-3);
}

.news-empty {
	display: grid;
	justify-items: center;
	gap: 0.35rem;
	padding: 4rem 1rem;
	text-align: center;
	color: var(--c-text-2);
}

.news-empty .iconify {
	font-size: 1.7rem;
	color: var(--c-text-3);
}

.news-empty h3 {
	font-size: 0.95rem;
}

.news-empty p,
.news-empty button {
	font-size: 0.75rem;
}

.news-empty button {
	margin-top: 0.4rem;
	color: var(--c-primary);
}

.news-skeletons {
	display: grid;
}

.news-skeleton {
	height: 9.2rem;
	margin: 0 1rem;
	border-bottom: 1px solid var(--c-border);
	background: linear-gradient(100deg, transparent 25%, var(--c-primary-soft) 48%, transparent 72%);
	background-size: 240% 100%;
	animation: news-shimmer 1.5s infinite linear;
}

.news-digest {
	position: sticky;
	top: 1rem;
	padding: 1rem;
}

.news-digest-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
	padding-bottom: 0.85rem;
	border-bottom: 1px solid var(--c-border);
}

.news-digest-header p {
	font: 0.65rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-digest-header h2 {
	margin-top: 0.2rem;
}

.news-digest-header .iconify {
	font-size: 1.2rem;
	color: var(--c-primary);
}

.news-digest-lead {
	margin-top: 0.85rem;
	font-size: 0.76rem;
	line-height: 1.65;
	color: var(--c-text-2);
}

.news-digest-list {
	display: grid;
	gap: 0.9rem;
	margin-top: 1rem;
}

.news-digest-list li {
	display: grid;
	grid-template-columns: 1.45rem minmax(0, 1fr);
	gap: 0.55rem;
}

.news-digest-list li > span {
	font: 0.65rem var(--font-monospace);
	color: var(--c-primary);
}

.news-digest-list small,
.news-digest-list strong,
.news-digest-list p {
	display: block;
}

.news-digest-list small {
	font-size: 0.62rem;
	color: var(--c-text-3);
}

.news-digest-list strong {
	margin-top: 0.18rem;
	font-size: 0.78rem;
	line-height: 1.45;
	color: var(--c-text-1);
}

.news-digest-list p {
	display: -webkit-box;
	overflow: hidden;
	margin-top: 0.25rem;
	font-size: 0.69rem;
	-webkit-line-clamp: 2;
	line-height: 1.55;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.news-digest-source {
	margin-top: 1rem;
	padding-top: 0.85rem;
	border-top: 1px solid var(--c-border);
	font-size: 0.7rem;
}

.news-digest-empty {
	padding: 1.25rem 0;
	font-size: 0.75rem;
	line-height: 1.6;
	color: var(--c-text-2);
}

.news-digest-loading {
	display: grid;
	gap: 0.7rem;
	margin-top: 1rem;
}

.news-digest-loading span {
	height: 3rem;
	border-radius: 0.4rem;
	background: var(--c-primary-soft);
}

.news-filter button:focus-visible,
.news-search:focus-within,
.news-row a:focus-visible,
.news-digest a:focus-visible,
.news-empty button:focus-visible,
.news-notice button:focus-visible {
	outline: 0.16rem solid var(--c-primary-soft);
	outline-offset: 0.16rem;
}

@keyframes news-shimmer {
	to {
		background-position: -240% 0;
	}
}

@media (hover: hover) {
	.news-row:hover {
		background: color-mix(in srgb, var(--c-primary-soft) 34%, transparent);
	}

	.news-row:hover .news-row-rail span {
		background: var(--c-primary);
	}

	.news-row h3 a:hover,
	.news-primary-action:hover,
	.news-digest-source:hover {
		color: var(--c-primary-hover);
	}

	.news-source-action:hover {
		color: var(--c-text-1);
	}
}

@media (max-width: 1020px) {
	.news-header {
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	.news-sync {
		min-width: 0;
		padding-left: 0;
		border-left: 0;
	}

	.news-layout {
		grid-template-columns: 1fr;
	}

	.news-digest {
		grid-row: 1;
		position: static;
	}
}

@media (max-width: 680px) {
	.news-workbench {
		margin: 0.7rem;
	}

	.news-header h1 {
		font-size: 2rem;
	}

	.news-controls {
		grid-template-columns: minmax(0, 1fr);
	}

	.news-search {
		grid-row: 1;
	}

	.news-row {
		grid-template-columns: 0.6rem minmax(0, 1fr);
		gap: 0.4rem;
		padding: 0.9rem 0.8rem 0.95rem 0.55rem;
	}

	.news-row-rail span {
		width: 0.18rem;
	}

	.news-row h3 {
		font-size: 1rem;
	}

	.news-row-actions {
		flex-wrap: wrap;
	}

	.news-feed-header {
		align-items: flex-start;
		padding: 0.85rem;
	}

	.news-feed-header p {
		max-width: 17rem;
	}
}

@media (max-width: 360px) {
	.news-sync {
		grid-template-columns: 1fr;
	}

	.news-sync-dot {
		display: none;
	}

	.news-row-meta {
		gap: 0.32rem 0.5rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.news-filter button,
	.news-row,
	.news-row-rail span,
	.news-skeleton {
		transition: none;
		animation: none;
	}
}
</style>
