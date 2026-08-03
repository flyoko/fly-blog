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
interface NewsPayload {
	items: NewsItemDto[]
	total: number
	briefing: Briefing | null
	sources: Array<{
		source_id: string
		status: string
		last_success_at: string | null
		last_error: string | null
	}>
}
interface DailySection {
	label: string
	items: Array<{
		title: string
		summary?: string
		links?: { original?: string, aihot?: string }
	}>
}
interface DailyHighlight {
	sectionLabel: string
	title: string
	summary?: string
	link?: string
}
type NewsFilter = 'all' | NewsItemDto['kind']

const filterOptions: Array<{ id: NewsFilter, label: string }> = [
	{ id: 'all', label: '全部' },
	{ id: 'hot', label: 'AI HOT' },
	{ id: 'rss', label: '站长资讯' },
	{ id: 'manual', label: '手动精选' },
]
const sourceLabels: Record<NewsItemDto['kind'], string> = {
	hot: 'AI HOT',
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
const dailySections = computed<DailySection[]>(() => {
	if (!data.value?.briefing)
		return []
	try {
		const parsed = JSON.parse(data.value.briefing.content_json)
		return Array.isArray(parsed) ? parsed : []
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
		link: item.links?.original || item.links?.aihot,
	})))
	.slice(0, 4),
)
const items = computed<NewsItemDto[]>(() =>
	filter.value === 'all'
		? data.value?.items || []
		: (data.value?.items || []).filter(item => item.kind === filter.value),
)
const leadItem = computed(() => items.value[0] || null)
const remainingItems = computed(() => items.value.slice(1))
const degraded = computed(() =>
	data.value?.sources.some(source => source.status !== 'success'),
)
const briefingDate = computed(() => data.value?.briefing?.date.replaceAll('-', '.') || '')

useSeoMeta({
	title: 'AI 阅闻',
	description: 'AI 热点、每日简报与站长科技资讯，保留来源和原文链接。',
	ogTitle: 'AI 阅闻 · fly living',
	ogDescription: 'AI 热点、每日简报与站长科技资讯。',
})

function sourceLabel(item: NewsItemDto) {
	return sourceLabels[item.kind]
}
function categoryLabel(item: NewsItemDto) {
	return item.category || sourceLabel(item)
}
function formatPublishedAt(value: string | null) {
	if (!value)
		return '最近更新'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '最近更新'
	return dateTimeFormatter.format(date).replaceAll('/', '.')
}
function formatIndex(index: number) {
	return String(index + 1).padStart(2, '0')
}
async function load() {
	loading.value = true
	error.value = ''
	try {
		data.value = await $fetch<{ data: NewsPayload }>('/api/news').then(
			result => result.data,
		)
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
<section class="news-editorial">
	<header class="news-masthead">
		<div class="news-masthead-copy">
			<span class="news-kicker">每日技术信号</span>
			<h1>AI 阅闻</h1>
			<p>先读一条主线，再浏览重要更新。日报、站长资讯与手动精选在同一阅读节奏中展开。</p>
		</div>
		<nav class="news-filter" aria-label="阅闻筛选">
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
	</header>

	<div v-if="degraded || error" class="news-status-stack">
		<p v-if="degraded" class="news-notice card">
			<Icon name="tabler:cloud-off" />
			<span>部分来源暂不可用，当前展示最后一次成功快照。</span>
		</p>
		<p v-if="error" class="news-notice news-notice-error card" role="alert">
			<Icon name="tabler:alert-circle" />
			<span>{{ error }}</span>
			<button type="button" @click="load">
				重试
			</button>
		</p>
	</div>

	<div v-if="loading" class="news-loading" aria-live="polite" aria-label="正在加载 AI 阅闻">
		<div class="news-loading-stage">
			<div class="news-loading-feature card" />
			<div class="news-loading-digest card" />
		</div>
		<div class="news-loading-grid">
			<div v-for="i in 4" :key="i" class="news-loading-card card" />
		</div>
	</div>

	<template v-else-if="data">
		<div class="news-stage">
			<article v-if="leadItem" class="news-feature card">
				<div class="news-feature-mark" aria-hidden="true">
					<Icon name="tabler:sparkles" />
				</div>
				<div class="news-feature-copy">
					<div class="news-feature-meta">
						<span class="news-label">今日主线</span>
						<span>{{ sourceLabel(leadItem) }}</span>
						<strong v-if="leadItem.rank">#{{ leadItem.rank }}</strong>
					</div>
					<h2>
						<a :href="leadItem.url" target="_blank" rel="noopener noreferrer">{{ leadItem.title }}</a>
					</h2>
					<p v-if="leadItem.summary">
						{{ leadItem.summary }}
					</p>
					<footer>
						<time v-if="leadItem.publishedAt" :datetime="leadItem.publishedAt">{{ formatPublishedAt(leadItem.publishedAt) }}</time>
						<span v-else>最近更新</span>
						<a :href="leadItem.originalUrl || leadItem.url" target="_blank" rel="noopener noreferrer">
							原文<Icon name="tabler:arrow-up-right" />
						</a>
					</footer>
				</div>
			</article>

			<article v-else class="news-feature news-feature-empty card">
				<div class="news-feature-copy">
					<span class="news-label">今日主线</span>
					<h2>当前筛选下暂无内容</h2>
					<p>切换其他来源，或稍后再来查看新收录的技术动态。</p>
				</div>
			</article>

			<aside class="news-digest card" aria-labelledby="news-digest-title">
				<header class="news-digest-header">
					<div>
						<time v-if="briefingDate">{{ briefingDate }}</time>
						<h2 id="news-digest-title">
							今日摘要
						</h2>
					</div>
					<Icon name="tabler:bookmark" aria-hidden="true" />
				</header>

				<template v-if="data.briefing">
					<h3>{{ data.briefing.title }}</h3>
					<p v-if="data.briefing.lead" class="news-digest-lead">
						{{ data.briefing.lead }}
					</p>
					<ol v-if="dailyHighlights.length" class="news-digest-list">
						<li v-for="(highlight, index) in dailyHighlights" :key="`${highlight.sectionLabel}:${highlight.title}`">
							<span aria-hidden="true">{{ formatIndex(index) }}</span>
							<div>
								<small>{{ highlight.sectionLabel }}</small>
								<a
									v-if="highlight.link"
									:href="highlight.link"
									target="_blank"
									rel="noopener noreferrer"
								>{{ highlight.title }}</a>
								<strong v-else>{{ highlight.title }}</strong>
								<p v-if="highlight.summary">
									{{ highlight.summary }}
								</p>
							</div>
						</li>
					</ol>
					<p v-else class="news-digest-empty">
						日报已生成，详细条目请查看原始日报。
					</p>
					<a
						class="news-digest-link"
						:href="data.briefing.source_url"
						target="_blank"
						rel="noopener noreferrer"
					>
						AI HOT 原始日报<Icon name="tabler:external-link" />
					</a>
				</template>
				<p v-else class="news-digest-empty">
					今日简报尚未生成，可以先从今日主线和继续阅读开始。
				</p>
			</aside>
		</div>

		<section class="news-stream" aria-labelledby="news-stream-title">
			<header class="news-stream-header">
				<div>
					<h2 id="news-stream-title">
						继续阅读
					</h2>
					<p>按重要性与发布时间排列</p>
				</div>
				<span>{{ remainingItems.length }} 条</span>
			</header>

			<div v-if="remainingItems.length" class="news-grid">
				<article v-for="item in remainingItems" :key="item.id" class="news-card card">
					<header>
						<span class="news-label">{{ categoryLabel(item) }}</span>
						<strong v-if="item.rank">#{{ item.rank }}</strong>
					</header>
					<h3>
						<a :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
					</h3>
					<p v-if="item.summary">
						{{ item.summary }}
					</p>
					<footer>
						<span>{{ sourceLabel(item) }}</span>
						<time v-if="item.publishedAt" :datetime="item.publishedAt">{{ formatPublishedAt(item.publishedAt) }}</time>
						<a :href="item.originalUrl || item.url" target="_blank" rel="noopener noreferrer" aria-label="打开原文">
							<Icon name="tabler:arrow-up-right" />
						</a>
					</footer>
				</article>
			</div>

			<p v-else-if="leadItem" class="news-stream-empty card">
				当前筛选下只有一条内容，主稿已经展示在上方。
			</p>
			<p v-else class="news-stream-empty card">
				当前筛选下暂无内容。
			</p>
		</section>
	</template>
</section>
</template>

<style scoped lang="scss">
.news-editorial {
	display: grid;
	gap: clamp(1.2rem, 2vw, 1.8rem);
	margin: clamp(1rem, 2vw, 1.5rem);
}

.news-masthead {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: end;
	gap: 2rem;
	padding: clamp(1rem, 3vw, 2rem) 0 0.4rem;
}

.news-masthead-copy {
	max-width: 43rem;
}

.news-kicker {
	font: 0.74rem var(--font-monospace);
	letter-spacing: 0.16em;
	color: var(--c-primary);
}

.news-masthead h1 {
	margin-top: 0.45rem;
	font: clamp(3rem, 8vw, 5.8rem) / 0.95 var(--font-creative);
	letter-spacing: -0.055em;
}

.news-masthead p {
	max-width: 38rem;
	margin-top: 1rem;
	line-height: 1.75;
	color: var(--c-text-2);
}

.news-filter {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.5rem;
}

.news-filter button {
	min-height: 2.5rem;
	padding: 0.55rem 0.85rem;
	border: 1px solid var(--c-border);
	border-radius: 0.7rem;
	background: var(--ld-bg-card);
	color: var(--c-text-2);
	transition: border-color 0.2s, background-color 0.2s, color 0.2s, transform 0.2s;
}

.news-filter button.active {
	border-color: color-mix(in srgb, var(--c-primary) 48%, var(--c-border));
	background: var(--c-primary-soft);
	color: var(--c-text-1);
}

.news-filter button:active {
	transform: translateY(1px);
}

.news-filter button:focus-visible,
.news-feature a:focus-visible,
.news-digest a:focus-visible,
.news-card a:focus-visible,
.news-notice button:focus-visible {
	outline: 0.18rem solid var(--c-primary-soft);
	outline-offset: 0.2rem;
}

.news-status-stack {
	display: grid;
	gap: 0.65rem;
}

.news-notice {
	display: flex;
	align-items: center;
	gap: 0.65rem;
	padding: 0.85rem 1rem;
	border: 1px solid var(--c-border);
	color: var(--c-text-2);
}

.news-notice .iconify {
	flex: 0 0 auto;
	color: var(--c-warning);
}

.news-notice button {
	margin-left: auto;
	color: var(--c-primary);
}

.news-notice-error .iconify {
	color: var(--c-error);
}

.news-stage,
.news-loading-stage {
	display: grid;
	grid-template-columns: minmax(0, 1.36fr) minmax(18rem, 0.64fr);
	gap: 1rem;
}

.news-feature,
.news-digest,
.news-loading-feature,
.news-loading-digest {
	min-height: 31rem;
	border: 1px solid color-mix(in srgb, var(--c-border) 88%, var(--c-primary));
	border-radius: 1.1rem;
}

.news-feature {
	display: flex;
	align-items: flex-end;
	position: relative;
	overflow: hidden;
	padding: clamp(1.4rem, 4vw, 2.7rem);
	background:
		linear-gradient(150deg, transparent 0 58%, color-mix(in srgb, var(--c-primary) 20%, transparent) 58% 100%),
		linear-gradient(160deg, var(--ld-bg-card), color-mix(in srgb, var(--c-bg-2) 82%, var(--c-primary-soft)));
}

.news-feature::before {
	content: "";
	position: absolute;
	top: -14%;
	right: -8%;
	width: 48%;
	height: 72%;
	border: 1px solid color-mix(in srgb, var(--c-primary) 32%, transparent);
	background: color-mix(in srgb, var(--c-primary) 8%, transparent);
	clip-path: polygon(28% 0, 100% 0, 100% 100%, 0 76%);
	transform: rotate(5deg);
}

.news-feature::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(180deg, transparent 20%, color-mix(in srgb, var(--c-bg) 84%, transparent));
	pointer-events: none;
}

.news-feature-mark {
	position: absolute;
	top: 13%;
	right: 8%;
	font-size: clamp(5rem, 12vw, 9rem);
	line-height: 1;
	color: color-mix(in srgb, var(--c-primary) 28%, transparent);
	transform: rotate(-8deg);
	z-index: 1;
}

.news-feature-copy {
	display: grid;
	gap: 1rem;
	width: min(100%, 49rem);
	z-index: 2;
}

.news-feature-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.65rem;
	font: 0.72rem var(--font-monospace);
	color: var(--c-text-2);
}

.news-label {
	display: inline-flex;
	align-items: center;
	width: fit-content;
	min-height: 1.75rem;
	padding: 0.28rem 0.55rem;
	border-radius: 0.5rem;
	background: var(--c-primary-soft);
	font-size: 0.7rem;
	font-weight: 700;
	color: var(--c-primary);
}

.news-feature h2 {
	max-width: 18ch;
	font: clamp(2rem, 4.6vw, 3.8rem) / 1.08 var(--font-creative);
	letter-spacing: -0.045em;
}

.news-feature h2 a {
	color: var(--c-text-1);
}

.news-feature-copy > p {
	max-width: 43rem;
	line-height: 1.75;
	color: var(--c-text-2);
}

.news-feature footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding-top: 0.5rem;
	font: 0.72rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-feature footer a,
.news-digest-link {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	color: var(--c-primary);
}

.news-feature-empty h2 {
	max-width: 14ch;
}

.news-digest {
	display: flex;
	flex-direction: column;
	padding: clamp(1.25rem, 3vw, 1.8rem);
	background: var(--ld-bg-card);
}

.news-digest-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.news-digest-header time {
	font: 0.72rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-digest-header h2 {
	margin-top: 0.25rem;
	font-size: 1.55rem;
	letter-spacing: -0.025em;
}

.news-digest-header > .iconify {
	font-size: 1.35rem;
	color: var(--c-primary);
}

.news-digest > h3 {
	margin-top: 1.3rem;
	font: 1.08rem / 1.45 var(--font-creative);
}

.news-digest-lead,
.news-digest-empty {
	margin-top: 0.7rem;
	line-height: 1.65;
	color: var(--c-text-2);
}

.news-digest-list {
	display: grid;
	gap: 1.1rem;
	margin-top: 1.4rem;
}

.news-digest-list li {
	display: grid;
	grid-template-columns: 1.7rem minmax(0, 1fr);
	gap: 0.75rem;
}

.news-digest-list li > span {
	padding-top: 0.15rem;
	font: 0.72rem var(--font-monospace);
	color: var(--c-primary);
}

.news-digest-list small {
	display: block;
	margin-bottom: 0.25rem;
	font-size: 0.68rem;
	color: var(--c-text-3);
}

.news-digest-list a,
.news-digest-list strong {
	display: inline-block;
	font-size: 0.92rem;
	line-height: 1.45;
	color: var(--c-text-1);
}

.news-digest-list p {
	display: -webkit-box;
	overflow: hidden;
	margin-top: 0.3rem;
	font-size: 0.78rem;
	-webkit-line-clamp: 2;
	line-height: 1.55;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.news-digest-link {
	margin-top: auto;
	padding-top: 1.35rem;
	font-size: 0.78rem;
}

.news-stream {
	display: grid;
	gap: 1rem;
}

.news-stream-header {
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.25rem 0;
}

.news-stream-header h2 {
	font: 1.75rem / 1.2 var(--font-creative);
	letter-spacing: -0.03em;
}

.news-stream-header p,
.news-stream-header > span {
	margin-top: 0.25rem;
	font-size: 0.75rem;
	color: var(--c-text-3);
}

.news-grid,
.news-loading-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1rem;
}

.news-card {
	display: flex;
	flex-direction: column;
	min-height: 15rem;
	padding: 1.25rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background: var(--ld-bg-card);
	transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
}

.news-card:nth-child(5n + 1) {
	grid-column: 1 / -1;
	min-height: 13rem;
}

.news-card header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	font: 0.72rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-card h3 {
	margin-top: 1.1rem;
	font: clamp(1.25rem, 2.5vw, 1.75rem) / 1.32 var(--font-creative);
	letter-spacing: -0.025em;
}

.news-card h3 a {
	color: var(--c-text-1);
}

.news-card > p {
	display: -webkit-box;
	overflow: hidden;
	margin-top: 0.7rem;
	-webkit-line-clamp: 3;
	line-height: 1.7;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.news-card footer {
	display: grid;
	grid-template-columns: 1fr auto auto;
	align-items: center;
	gap: 0.75rem;
	margin-top: auto;
	padding-top: 1.2rem;
	font: 0.7rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-card footer a {
	display: grid;
	place-items: center;
	width: 1.9rem;
	height: 1.9rem;
	border: 1px solid var(--c-border);
	border-radius: 0.55rem;
	color: var(--c-primary);
}

.news-stream-empty {
	padding: 2rem 1.25rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	text-align: center;
	color: var(--c-text-2);
}

.news-loading {
	display: grid;
	gap: 1rem;
}

.news-loading-feature,
.news-loading-digest,
.news-loading-card {
	background:
		linear-gradient(100deg, transparent 25%, var(--c-primary-soft) 48%, transparent 72%),
		var(--ld-bg-card);
	background-size: 240% 100%;
	animation: news-shimmer 1.5s infinite linear;
}

.news-loading-card {
	min-height: 14rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
}

@keyframes news-shimmer {
	to {
		background-position: -240% 0;
	}
}

@media (hover: hover) {
	.news-card:hover {
		border-color: color-mix(in srgb, var(--c-primary) 38%, var(--c-border));
		box-shadow: var(--box-shadow-2);
		transform: translateY(-2px);
	}

	.news-feature h2 a:hover,
	.news-digest-list a:hover,
	.news-card h3 a:hover {
		color: var(--c-primary);
	}
}

@media (max-width: 1080px) {
	.news-masthead {
		grid-template-columns: 1fr;
		align-items: start;
	}

	.news-filter {
		justify-content: flex-start;
	}

	.news-stage,
	.news-loading-stage {
		grid-template-columns: 1fr;
	}

	.news-feature,
	.news-loading-feature {
		min-height: 27rem;
	}

	.news-digest,
	.news-loading-digest {
		min-height: auto;
	}

	.news-digest-link {
		margin-top: 1.3rem;
	}
}

@media (max-width: 720px) {
	.news-editorial {
		margin: 0.8rem;
	}

	.news-masthead {
		gap: 1.4rem;
		padding-top: 0.5rem;
	}

	.news-masthead h1 {
		font-size: clamp(2.8rem, 18vw, 4.4rem);
	}

	.news-filter {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		width: 100%;
	}

	.news-filter button {
		width: 100%;
	}

	.news-feature,
	.news-loading-feature {
		min-height: 25rem;
		padding: 1.25rem;
	}

	.news-feature-mark {
		top: 10%;
		right: 5%;
	}

	.news-feature h2 {
		font-size: clamp(1.9rem, 9vw, 2.8rem);
	}

	.news-feature footer {
		flex-direction: column;
		align-items: flex-start;
	}

	.news-digest,
	.news-loading-digest {
		padding: 1.2rem;
	}

	.news-grid,
	.news-loading-grid {
		grid-template-columns: 1fr;
	}

	.news-card:nth-child(5n + 1) {
		grid-column: auto;
	}

	.news-card footer {
		grid-template-columns: 1fr auto auto;
	}
}

@media (prefers-reduced-motion: reduce) {
	.news-filter button,
	.news-card,
	.news-loading-feature,
	.news-loading-digest,
	.news-loading-card {
		transition: none;
		animation: none;
	}
}
</style>
