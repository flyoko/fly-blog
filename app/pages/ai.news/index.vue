<script setup lang="ts">
import type { FinanceFilter, FinanceFlashListDto } from '#shared/admin/finance'
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
		links?: {
			aihot?: string
			original?: string
		}
	}>
}

interface DailyHighlight {
	sectionLabel: string
	title: string
	summary?: string
	readerPath: string | null
	originalUrl: string | null
}

type NewsFilter = 'all' | 'hot' | 'rss' | 'manual'
type NewsSection = 'ai' | 'finance'

const filterOptions: Array<{ id: NewsFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'rss', label: '站长资讯' },
	{ id: 'hot', label: 'AI 精选' },
	{ id: 'manual', label: '手动精选' },
]

const financeFilterOptions: Array<{ id: FinanceFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'market', label: '市场' },
	{ id: 'company', label: '公司' },
	{ id: 'macro', label: '宏观' },
	{ id: 'overseas', label: '海外' },
	{ id: 'tech', label: '科技' },
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

const ownedCoverDateFormatter = new Intl.DateTimeFormat('zh-CN', {
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
})

const financeTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
	timeZone: 'Asia/Shanghai',
})

const financeDayFormatter = new Intl.DateTimeFormat('zh-CN', {
	month: '2-digit',
	day: '2-digit',
	weekday: 'long',
	timeZone: 'Asia/Shanghai',
})

const data = ref<NewsPayload | null>(null)
const loading = ref(true)
const error = ref('')
const activeSection = ref<NewsSection>('ai')
const filter = ref<NewsFilter>('all')
const query = ref('')
const failedImageUrls = ref<Set<string>>(new Set())
const financeFilter = ref<FinanceFilter>('all')
const financeImportantOnly = ref(false)
const financeData = ref<FinanceFlashListDto | null>(null)
const financeLoading = ref(false)
const financeError = ref('')
let financeRequestRevision = 0

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
	.flatMap(section => section.items.map((item) => {
		const upstreamId = item.links?.aihot?.split('/').filter(Boolean).at(-1)
		const matchedItem = (data.value?.items || []).find(newsItem =>
			Boolean(upstreamId && newsItem.id === `ai-hot:${upstreamId}`)
			|| Boolean(item.links?.original && newsItem.originalUrl === item.links.original),
		)
		return {
			sectionLabel: section.label,
			title: item.title,
			summary: item.summary,
			readerPath: matchedItem?.readerPath || null,
			originalUrl: matchedItem?.originalUrl || item.links?.original || null,
		}
	}))
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

const visibleFinanceItems = computed(() => financeData.value?.items || [])

const financeDayLabel = computed(() => {
	const value = visibleFinanceItems.value[0]?.publishedAt || financeData.value?.updatedAt
	if (!value)
		return '今日'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '今日'
	const parts = financeDayFormatter.formatToParts(date)
	const month = parts.find(part => part.type === 'month')?.value
	const day = parts.find(part => part.type === 'day')?.value
	const weekday = parts.find(part => part.type === 'weekday')?.value
	return month && day && weekday ? `${month}月${day}日 · ${weekday}` : financeDayFormatter.format(date)
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
	description: '在 fly living 内阅读 AI 精选、财经 7×24、站长资讯和每日简报，保留来源与原文入口。',
	ogTitle: 'AI 阅闻 · fly living',
	ogDescription: '站内阅读 AI 精选、财经 7×24、站长资讯和每日简报。',
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

function formatOwnedCoverDate(value: string | null) {
	if (!value)
		return '最近收录'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '最近收录'
	return ownedCoverDateFormatter.format(date).replaceAll('/', '.')
}

function formatFinanceTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '--:--'
	return financeTimeFormatter.format(date)
}

function hasUsableCover(item: NewsItemDto) {
	return Boolean(item.coverImage && !failedImageUrls.value.has(item.coverImage.url))
}

function clearSearch() {
	query.value = ''
}

function hideBrokenImage(url: string) {
	failedImageUrls.value = new Set([...failedImageUrls.value, url])
}

async function load() {
	loading.value = true
	error.value = ''
	failedImageUrls.value = new Set()
	try {
		data.value = await $fetch<{ data: NewsPayload }>('/api/news').then(result => result.data)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : 'AI 阅闻加载失败'
	}
	finally {
		loading.value = false
	}
}

async function loadFinance() {
	const revision = ++financeRequestRevision
	financeLoading.value = true
	financeError.value = ''
	try {
		const result = await $fetch<{ data: FinanceFlashListDto }>('/api/finance/flash', {
			query: {
				category: financeFilter.value,
				important: financeImportantOnly.value ? 'true' : 'false',
				limit: 50,
			},
		})
		if (revision === financeRequestRevision)
			financeData.value = result.data
	}
	catch (cause) {
		if (revision === financeRequestRevision)
			financeError.value = cause instanceof Error ? cause.message : '财经快讯加载失败'
	}
	finally {
		if (revision === financeRequestRevision)
			financeLoading.value = false
	}
}

watch([activeSection, financeFilter, financeImportantOnly], ([section]) => {
	if (section === 'finance')
		void loadFinance()
})

onMounted(load)
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" />
</div>
<section class="news-workbench">
	<header class="news-header">
		<div>
			<p class="news-eyebrow">
				AI · SIGNALS · MARKETS
			</p>
			<h1>AI 阅闻</h1>
			<p class="news-intro">
				每天浏览值得关注的 AI 动态、财经快讯与技术资讯。
			</p>
		</div>
		<div class="news-sync" :class="{ degraded: activeSection === 'finance' ? Boolean(financeError) : Boolean(degradedSources.length) }">
			<span class="news-sync-dot" aria-hidden="true" />
			<div>
				<strong>{{ activeSection === 'finance' ? financeError ? '财经快讯暂未更新' : financeLoading ? '财经快讯加载中' : financeData?.prototype ? '财经原型已加载' : '财经快讯持续更新' : degradedSources.length ? '部分内容暂未更新' : '内容持续更新' }}</strong>
				<span>{{ activeSection === 'finance' ? financeData?.prototype ? '原型数据 · 非实时' : `更新于 ${formatDateTime(financeData?.updatedAt || null)}` : `更新于 ${formatDateTime(latestSyncAt)}` }}</span>
			</div>
		</div>
	</header>

	<nav class="news-section-tabs card glass-clear" aria-label="AI 阅闻栏目">
		<button
			type="button"
			:class="{ active: activeSection === 'ai' }"
			:aria-pressed="activeSection === 'ai'"
			@click="activeSection = 'ai'"
		>
			AI 资讯
		</button>
		<button
			type="button"
			:class="{ active: activeSection === 'finance' }"
			:aria-pressed="activeSection === 'finance'"
			@click="activeSection = 'finance'"
		>
			财经 7×24
		</button>
	</nav>

	<div v-if="activeSection === 'ai' && (error || degradedSources.length)" class="news-notices" aria-live="polite">
		<div v-if="degradedSources.length" class="news-notice card">
			<Icon name="tabler:cloud-off" aria-hidden="true" />
			<p>
				部分资讯暂时未能刷新，已收录内容仍可正常阅读。
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

	<section v-if="activeSection === 'ai'" class="news-controls card glass-clear" aria-label="AI 阅闻筛选与搜索">
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
			<span class="visually-hidden">搜索标题或摘要</span>
			<input v-model="query" type="search" placeholder="搜索标题或摘要" autocomplete="off">
			<button v-if="query" type="button" aria-label="清空搜索" @click="clearSearch">
				<Icon name="tabler:x" aria-hidden="true" />
			</button>
		</label>
	</section>

	<div v-if="activeSection === 'ai'" class="news-layout">
		<section class="news-feed card" aria-labelledby="news-feed-title">
			<header class="news-feed-header">
				<div>
					<h2 id="news-feed-title">
						最新收录
					</h2>
					<p>按发布时间浏览最新内容。</p>
				</div>
				<strong>{{ loading ? '加载中' : `${visibleItems.length} 条` }}</strong>
			</header>

			<div v-if="loading" class="news-skeletons" aria-label="正在加载资讯">
				<div v-for="index in 6" :key="index" class="news-skeleton" />
			</div>

			<div v-else-if="visibleItems.length" class="news-list" aria-live="polite">
				<article v-for="item in visibleItems" :key="item.id" class="news-row">
					<div class="news-row-rail" aria-hidden="true">
						<span />
					</div>
					<div
						class="news-row-body"
						:class="{ 'has-image': hasUsableCover(item), 'has-owned-cover': !hasUsableCover(item) }"
					>
						<div class="news-row-copy">
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
									v-if="item.readerPath && item.originalUrl"
									class="news-source-action"
									:href="item.originalUrl"
									target="_blank"
									rel="noopener noreferrer"
								>
									原始来源
								</a>
							</footer>
						</div>
						<img
							v-if="item.coverImage && hasUsableCover(item)"
							class="news-row-image"
							:src="item.coverImage.url"
							:alt="item.coverImage.alt || ''"
							loading="lazy"
							decoding="async"
							referrerpolicy="no-referrer"
							@error="hideBrokenImage(item.coverImage.url)"
						>
						<div v-else class="news-owned-cover" aria-hidden="true">
							<span class="news-owned-cover-brand">fly living</span>
							<span class="news-owned-cover-kicker">AI 阅闻 · {{ sourceLabel(item) }}</span>
							<strong>{{ item.title }}</strong>
							<time>{{ formatOwnedCoverDate(item.publishedAt) }}</time>
						</div>
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
		</section>

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
						<NuxtLink v-if="highlight.readerPath" class="news-digest-item" :to="highlight.readerPath">
							<small>{{ highlight.sectionLabel }}</small>
							<strong>{{ highlight.title }}</strong>
							<p v-if="highlight.summary">
								{{ highlight.summary }}
							</p>
						</NuxtLink>
						<a
							v-else-if="highlight.originalUrl"
							class="news-digest-item"
							:href="highlight.originalUrl"
							target="_blank"
							rel="noopener noreferrer"
						>
							<small>{{ highlight.sectionLabel }}</small>
							<strong>{{ highlight.title }}</strong>
							<p v-if="highlight.summary">{{ highlight.summary }}</p>
						</a>
						<div v-else class="news-digest-item">
							<small>{{ highlight.sectionLabel }}</small>
							<strong>{{ highlight.title }}</strong>
							<p v-if="highlight.summary">
								{{ highlight.summary }}
							</p>
						</div>
					</li>
				</ol>
			</template>
			<div v-else-if="loading" class="news-digest-loading" aria-label="正在加载日报">
				<span v-for="index in 4" :key="index" />
			</div>
			<p v-else class="news-digest-empty">
				今日日报尚未生成，资讯流仍可正常阅读。
			</p>
		</aside>
	</div>

	<section v-else class="finance-stream card" aria-labelledby="finance-stream-title">
		<header class="finance-stream-header">
			<div>
				<p>{{ financeDayLabel }}</p>
				<h2 id="finance-stream-title">
					财经 7×24
				</h2>
				<span>市场、公司、宏观与海外快讯 <b v-if="financeData?.prototype" class="finance-prototype-pill">原型数据源</b></span>
			</div>
			<button
				class="finance-important-toggle"
				type="button"
				role="switch"
				:aria-checked="financeImportantOnly"
				@click="financeImportantOnly = !financeImportantOnly"
			>
				<span>只看重要</span>
				<span class="finance-toggle-track" aria-hidden="true"><span /></span>
			</button>
		</header>

		<nav class="finance-filter" aria-label="财经快讯分类">
			<button
				v-for="option in financeFilterOptions"
				:key="option.id"
				type="button"
				:class="{ active: financeFilter === option.id }"
				:aria-pressed="financeFilter === option.id"
				@click="financeFilter = option.id"
			>
				{{ option.label }}
			</button>
		</nav>

		<div class="finance-stream-meta">
			<span>实时快讯 · 按发布时间倒序</span>
			<strong>{{ financeLoading ? '加载中' : `${financeData?.total || 0} 条` }}</strong>
		</div>

		<div v-if="financeError" class="finance-error" role="alert">
			<Icon name="tabler:alert-circle" aria-hidden="true" />
			<p>
				{{ financeError }}
			</p>
			<button type="button" @click="loadFinance">
				重新加载
			</button>
		</div>

		<div v-else-if="financeLoading && !financeData" class="finance-loading" aria-label="正在加载财经快讯">
			<span v-for="index in 5" :key="index" />
		</div>

		<div v-else-if="visibleFinanceItems.length" class="finance-list" aria-live="polite">
			<article
				v-for="item in visibleFinanceItems"
				:key="item.id"
				class="finance-flash"
				:class="{ important: item.important }"
			>
				<time :datetime="item.publishedAt">{{ formatFinanceTime(item.publishedAt) }}</time>
				<div class="finance-flash-rail" aria-hidden="true">
					<span />
				</div>
				<div class="finance-flash-card">
					<header>
						<span v-if="item.important" class="finance-important-badge">重要</span>
						<span>{{ item.categoryLabel }}</span>
						<span v-if="item.topic">{{ item.topic }}</span>
					</header>
					<h3>{{ item.title }}</h3>
					<p v-if="item.summary">
						{{ item.summary }}
					</p>
					<footer>
						<span>来源：{{ item.sourceName }}</span>
						<a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer">原文</a>
					</footer>
				</div>
			</article>
		</div>

		<div v-else class="finance-empty">
			<strong>当前筛选下暂无快讯</strong>
			<p>切换分类或关闭“只看重要”后再试。</p>
		</div>
	</section>
</section>
</template>

<style scoped lang="scss">
.news-workbench {
	display: grid;
	gap: 1rem;
	margin: clamp(0.8rem, 2vw, 1.4rem);
}

.news-section-tabs {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.35rem;
	padding: 0.4rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 0.85rem;
}

.news-section-tabs button {
	min-height: 2.7rem;
	border: 1px solid transparent;
	border-radius: 0.65rem;
	font-size: 0.82rem;
	color: var(--c-text-2);
	transition: border-color 0.18s, background-color 0.18s, color 0.18s;
}

.news-section-tabs button.active {
	border-color: var(--c-border);
	background: var(--c-bg-2);
	font-weight: 700;
	color: var(--c-text-1);
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
	color: var(--c-text-1);
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
	border: 1px solid var(--c-surface-line);
	border-radius: 0.85rem;
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
	border: 1px solid var(--c-primary);
	background: var(--c-primary-soft);
	font-weight: 700;
	color: var(--c-text);
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

.finance-stream {
	overflow: hidden;
	border: 1px solid var(--c-border);
	border-radius: 0.9rem;
	background: var(--ld-bg-card);
}

.finance-stream-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 1.1rem;
	border-bottom: 1px solid var(--c-border);
}

.finance-stream-header p {
	font: 0.72rem var(--font-monospace);
	color: var(--c-text-2);
}

.finance-stream-header h2 {
	margin-top: 0.18rem;
	font-size: 1.08rem;
	letter-spacing: -0.015em;
}

.finance-stream-header div > span {
	display: block;
	margin-top: 0.25rem;
	font-size: 0.7rem;
	color: var(--c-text-3);
}

.finance-stream-header .finance-prototype-pill {
	display: inline-block;
	margin-left: 0.35rem;
	padding: 0.12rem 0.32rem;
	border-radius: 0.3rem;
	background: var(--c-primary-soft);
	font-size: 0.58rem;
	font-weight: 700;
	color: var(--c-primary);
}

.finance-important-toggle {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	font-size: 0.74rem;
	white-space: nowrap;
	color: var(--c-text-2);
}

.finance-toggle-track {
	display: flex;
	align-items: center;
	width: 2.35rem;
	height: 1.35rem;
	padding: 0.16rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background: var(--c-bg-2);
	transition: border-color 0.18s, background-color 0.18s;
}

.finance-toggle-track span {
	width: 0.9rem;
	height: 0.9rem;
	border-radius: 50%;
	background: var(--c-text-1);
	transition: transform 0.18s, background-color 0.18s;
}

.finance-important-toggle[aria-checked="true"] .finance-toggle-track {
	border-color: color-mix(in srgb, var(--c-error) 48%, var(--c-border));
	background: var(--c-error-soft);
}

.finance-important-toggle[aria-checked="true"] .finance-toggle-track span {
	background: var(--c-error);
	transform: translateX(1rem);
}

.finance-filter {
	display: flex;
	gap: 0.25rem;
	overflow-x: auto;
	padding: 0.55rem 0.75rem;
	border-bottom: 1px solid var(--c-border);
	scrollbar-width: none;
}

.finance-filter::-webkit-scrollbar {
	display: none;
}

.finance-filter button {
	flex: 0 0 auto;
	padding: 0.42rem 0.72rem;
	border: 1px solid transparent;
	border-radius: 0.5rem;
	font-size: 0.7rem;
	color: var(--c-text-3);
}

.finance-filter button.active {
	border-color: var(--c-primary);
	background: var(--c-primary-soft);
	font-weight: 700;
	color: var(--c-text-1);
}

.finance-stream-meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.7rem 1rem 0.45rem;
	font-size: 0.68rem;
	color: var(--c-text-3);
}

.finance-stream-meta strong {
	font: 0.68rem var(--font-monospace);
	color: var(--c-primary);
}

.finance-error {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.6rem;
	margin: 0.55rem 0.85rem 0.85rem;
	padding: 0.75rem 0.8rem;
	border: 1px solid color-mix(in srgb, var(--c-error) 30%, var(--c-border));
	border-radius: 0.7rem;
	background: var(--c-error-soft);
	font-size: 0.72rem;
	color: var(--c-text-2);
}

.finance-error .iconify {
	color: var(--c-error);
}

.finance-error button {
	white-space: nowrap;
	color: var(--c-primary);
}

.finance-loading {
	display: grid;
	gap: 0.55rem;
	padding: 0.25rem 0.85rem 1rem;
}

.finance-loading span {
	height: 5rem;
	border-radius: 0.7rem;
	background: linear-gradient(100deg, transparent 25%, var(--c-primary-soft) 48%, transparent 72%);
	background-size: 240% 100%;
	animation: news-shimmer 1.5s infinite linear;
}

.finance-list {
	padding: 0 0.85rem 1rem;
}

.finance-flash {
	display: grid;
	grid-template-columns: 3.4rem 1rem minmax(0, 1fr);
	gap: 0.55rem;
	min-height: 6.5rem;
}

.finance-flash > time {
	padding-top: 1.05rem;
	font: 700 0.72rem var(--font-monospace);
	text-align: end;
	color: var(--c-primary);
}

.finance-flash-rail {
	display: flex;
	justify-content: center;
	position: relative;
}

.finance-flash-rail::before {
	content: "";
	position: absolute;
	top: 1.35rem;
	bottom: -0.6rem;
	width: 1px;
	background: var(--c-border);
}

.finance-flash:last-child .finance-flash-rail::before {
	bottom: 1.2rem;
}

.finance-flash-rail span {
	position: relative;
	width: 0.45rem;
	height: 0.45rem;
	margin-top: 1.17rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.25rem var(--c-primary-soft);
	background: var(--c-primary);
	z-index: 1;
}

.finance-flash-card {
	margin: 0.25rem 0 0.7rem;
	padding: 0.75rem 0.85rem;
	border: 1px solid transparent;
	border-radius: 0.75rem;
}

.finance-flash-card header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.35rem;
	margin-bottom: 0.45rem;
}

.finance-flash-card header span {
	padding: 0.2rem 0.4rem;
	border-radius: 0.35rem;
	background: var(--c-bg-2);
	font-size: 0.62rem;
	color: var(--c-text-3);
}

.finance-flash-card h3 {
	font-size: 0.94rem;
	letter-spacing: -0.01em;
	line-height: 1.6;
}

.finance-flash-card > p {
	margin-top: 0.35rem;
	font-size: 0.74rem;
	line-height: 1.65;
	color: var(--c-text-2);
}

.finance-flash-card footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-top: 0.55rem;
	font-size: 0.64rem;
	color: var(--c-text-3);
}

.finance-flash-card footer a {
	color: var(--c-primary);
}

.finance-flash.important > time,
.finance-flash.important .finance-flash-card h3 {
	color: var(--c-error);
}

.finance-flash.important .finance-flash-rail span {
	box-shadow: 0 0 0 0.25rem var(--c-error-soft);
	background: var(--c-error);
}

.finance-flash.important .finance-flash-card {
	border-color: color-mix(in srgb, var(--c-error) 30%, var(--c-border));
	background: linear-gradient(90deg, var(--c-error-soft), transparent 68%);
}

.finance-flash-card header .finance-important-badge {
	background: var(--c-error-soft);
	font-weight: 700;
	color: var(--c-error);
}

.finance-empty {
	display: grid;
	place-items: center;
	gap: 0.35rem;
	min-height: 15rem;
	padding: 2rem;
	text-align: center;
	color: var(--c-text-2);
}

.finance-empty p {
	font-size: 0.72rem;
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
	color: var(--c-text-1);
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

.news-row-copy {
	min-width: 0;
}

.news-row-body.has-image,
.news-row-body.has-owned-cover {
	display: grid;
	grid-template-columns: minmax(0, 1fr) clamp(6.8rem, 15vw, 8.6rem);
	align-items: start;
	gap: 1rem;
}

.news-row-image,
.news-owned-cover {
	display: block;
	width: 100%;
	aspect-ratio: 4 / 3;
	border: 1px solid var(--c-border);
	border-radius: 0.65rem;
	background: var(--c-primary-soft);
}

.news-row-image {
	object-fit: cover;
}

.news-owned-cover {
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	gap: 0.4rem;
	position: relative;
	overflow: hidden;
	padding: 0.65rem;
	background:
		radial-gradient(circle at 88% 12%, color-mix(in srgb, var(--c-primary) 18%, transparent), transparent 38%),
		linear-gradient(145deg, var(--c-primary-soft), var(--ld-bg-card));
}

.news-owned-cover::after {
	content: "AI";
	position: absolute;
	right: -0.08em;
	bottom: -0.28em;
	font: 800 3.8rem / 1 var(--font-creative);
	letter-spacing: -0.08em;
	color: color-mix(in srgb, var(--c-primary) 10%, transparent);
}

.news-owned-cover-brand,
.news-owned-cover-kicker,
.news-owned-cover time {
	position: relative;
	font: 0.5rem var(--font-monospace);
	letter-spacing: 0.05em;
	z-index: 1;
}

.news-owned-cover-brand {
	font-weight: 800;
	text-transform: uppercase;
	color: var(--c-primary);
}

.news-owned-cover-kicker,
.news-owned-cover time {
	color: var(--c-text-3);
}

.news-owned-cover strong {
	display: -webkit-box;
	position: relative;
	overflow: hidden;
	font: 700 0.69rem / 1.4 var(--font-creative);
	-webkit-line-clamp: 3;
	color: var(--c-text-1);
	z-index: 1;
	-webkit-box-orient: vertical;
}

.news-row-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4rem 0.65rem;
	font: 0.64rem var(--font-monospace);
	color: var(--c-text-1);
}

.news-row-meta > :first-child {
	font-weight: 700;
	color: var(--c-text);
}

.news-content-mode {
	padding: 0.15rem 0.35rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 25%, var(--c-border));
	border-radius: 0.35rem;
	background: var(--c-primary-soft);
	color: var(--c-text-1);
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

.news-primary-action {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	font-weight: 700;
	color: var(--c-primary);
}

.news-source-action {
	color: var(--c-text-1);
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
	color: var(--c-text-1);
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

.news-digest-item {
	display: block;
	min-width: 0;
	border-radius: 0.35rem;
	color: inherit;
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
	color: var(--c-text-1);
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

.news-section-tabs button:focus-visible,
.finance-important-toggle:focus-visible,
.finance-filter button:focus-visible,
.finance-error button:focus-visible,
.finance-flash-card footer a:focus-visible,
.news-filter button:focus-visible,
.news-search:focus-within,
.news-row a:focus-visible,
.news-digest-item:focus-visible,
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

@media not (max-width: $breakpoint-widescreen) {
	.news-workbench {
		gap: 0.75rem;
		margin: 0.2rem 0.5rem 1rem;
	}

	.news-header {
		gap: 1.25rem;
		padding: 0.2rem 0 0.1rem;
	}

	.news-header h1 {
		font-size: 2rem;
	}

	.news-intro {
		max-width: 36rem;
		margin-top: 0.35rem;
		font-size: 0.82rem;
		line-height: 1.6;
	}

	.news-sync {
		gap: 0.55rem;
		min-width: 14rem;
		padding: 0.65rem 0.8rem;
	}

	.news-section-tabs {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		justify-self: stretch;
		gap: 0.3rem;
		width: 100%;
		padding: 0.3rem;
		border-radius: 0.78rem;
	}

	.news-section-tabs button {
		min-height: 2.45rem;
		padding: 0 0.9rem;
		border-radius: 0.58rem;
		font-size: 0.8rem;
	}

	.news-controls {
		grid-template-columns: minmax(0, 1fr) minmax(13.5rem, 17rem);
		gap: 0.7rem;
		padding: 0.5rem;
		border-radius: 0.72rem;
	}

	.news-filter button {
		min-height: 2rem;
		padding: 0.36rem 0.62rem;
		font-size: 0.72rem;
	}

	.news-search {
		min-height: 2.05rem;
	}

	.news-layout {
		grid-template-columns: minmax(0, 1fr) minmax(15.75rem, 17rem);
		gap: 0.8rem;
	}

	.news-feed,
	.news-digest {
		border-radius: 0.78rem;
	}

	.news-feed-header {
		padding: 0.8rem 0.9rem;
	}

	.news-feed-header h2,
	.news-digest-header h2 {
		font-size: 0.98rem;
	}

	.news-row {
		grid-template-columns: 0.95rem minmax(0, 1fr);
		gap: 0.55rem;
		padding: 0.82rem 0.9rem 0.86rem 0.72rem;
	}

	.news-row-rail span {
		width: 0.18rem;
		height: 1.9rem;
	}

	.news-row-body.has-image,
	.news-row-body.has-owned-cover {
		grid-template-columns: minmax(0, 1fr) clamp(6.5rem, 9vw, 7.6rem);
		gap: 0.8rem;
	}

	.news-row-meta {
		gap: 0.32rem 0.55rem;
		font-size: 0.6rem;
	}

	.news-row h3 {
		margin-top: 0.34rem;
		font-size: 0.98rem;
		line-height: 1.4;
	}

	.news-row-summary {
		margin-top: 0.3rem;
		font-size: 0.73rem;
		-webkit-line-clamp: 2;
		line-height: 1.58;
	}

	.news-row-actions {
		gap: 0.72rem;
		margin-top: 0.5rem;
		font-size: 0.66rem;
	}

	.news-owned-cover {
		padding: 0.52rem;
	}

	.news-owned-cover::after {
		font-size: 3.25rem;
	}

	.news-owned-cover strong {
		font-size: 0.64rem;
	}

	.news-digest {
		top: var(--desktop-sticky-top, 5.3rem);
		padding: 0.8rem;
	}

	.news-digest-header {
		padding-bottom: 0.65rem;
	}

	.news-digest-lead {
		margin-top: 0.65rem;
		font-size: 0.7rem;
		line-height: 1.55;
	}

	.news-digest-list {
		gap: 0.7rem;
		margin-top: 0.75rem;
	}

	.news-digest-list li {
		grid-template-columns: 1.25rem minmax(0, 1fr);
		gap: 0.45rem;
	}

	.news-digest-list strong {
		font-size: 0.74rem;
		line-height: 1.4;
	}

	.news-digest-list p {
		font-size: 0.65rem;
		line-height: 1.48;
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
	.news-digest-item:hover {
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

	.news-section-tabs {
		gap: 0.25rem;
		padding: 0.3rem;
	}

	.news-section-tabs button {
		min-height: 2.5rem;
		font-size: 0.78rem;
	}

	.news-header h1 {
		font-size: 2rem;
	}

	.finance-stream-header {
		align-items: flex-start;
		padding: 0.85rem;
	}

	.finance-filter {
		padding-inline: 0.55rem;
	}

	.finance-stream-meta {
		padding-inline: 0.7rem;
	}

	.finance-list {
		padding-inline: 0.3rem;
	}

	.finance-flash {
		grid-template-columns: 2.8rem 0.8rem minmax(0, 1fr);
		gap: 0.28rem;
		min-height: 6rem;
	}

	.finance-flash > time {
		padding-top: 0.95rem;
		font-size: 0.68rem;
	}

	.finance-flash-rail span {
		margin-top: 1.05rem;
	}

	.finance-flash-rail::before {
		top: 1.2rem;
	}

	.finance-flash-card {
		margin-top: 0.18rem;
		padding: 0.68rem 0.65rem;
	}

	.finance-flash-card h3 {
		font-size: 0.88rem;
	}

	.finance-flash-card > p {
		font-size: 0.7rem;
	}

	.finance-error {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.finance-error button {
		grid-column: 2;
		justify-self: start;
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

	.news-row-body.has-image,
	.news-row-body.has-owned-cover {
		grid-template-columns: minmax(0, 1fr) 5.6rem;
		gap: 0.65rem;
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
	.finance-stream-header {
		flex-wrap: wrap;
	}

	.finance-important-toggle {
		margin-left: auto;
	}

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
	.news-section-tabs button,
	.finance-toggle-track,
	.finance-toggle-track span,
	.finance-filter button,
	.finance-loading span,
	.news-filter button,
	.news-row,
	.news-row-rail span,
	.news-skeleton {
		transition: none;
		animation: none;
	}
}
</style>
