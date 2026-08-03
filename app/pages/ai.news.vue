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

const data = ref<NewsPayload | null>(null)
const loading = ref(true)
const error = ref('')
const filter = ref<'all' | NewsItemDto['kind']>('all')
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
const items = computed(() =>
	filter.value === 'all'
		? data.value?.items || []
		: (data.value?.items || []).filter(item => item.kind === filter.value),
)
const degraded = computed(() =>
	data.value?.sources.some(source => source.status !== 'success'),
)

useSeoMeta({
	title: 'AI 阅闻',
	description: 'AI 热点、每日简报与站长科技资讯，保留来源和原文链接。',
	ogTitle: 'AI 阅闻 · fly living',
	ogDescription: 'AI 热点、每日简报与站长科技资讯。',
})

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
<section class="news-page">
	<header class="news-hero card">
		<div>
			<span>AI · SIGNALS · DAILY</span>
			<h1>AI 阅闻</h1>
			<p>追踪真正值得点开的变化，而不是复制整篇内容。</p>
		</div>
		<div class="news-radar">
			<i /><i /><i /><Icon name="tabler:radar-2" />
		</div>
	</header>
	<p v-if="degraded" class="news-notice card">
		<Icon
			name="tabler:cloud-off"
		/>部分来源暂不可用，当前展示最后一次成功快照。
	</p>
	<p v-if="error" class="news-notice card">
		{{ error }} <button type="button" @click="load">
			重试
		</button>
	</p>
	<div v-if="loading" class="news-grid">
		<div v-for="i in 6" :key="i" class="news-skeleton card" />
	</div>
	<template v-else-if="data">
		<section v-if="data.briefing" class="daily-brief card">
			<header>
				<div>
					<span>DAILY BRIEF</span>
					<h2>{{ data.briefing.title }}</h2>
				</div>
				<a
					:href="data.briefing.source_url"
					target="_blank"
					rel="noopener noreferrer"
				>AI HOT 原始日报<Icon name="tabler:external-link" /></a>
			</header>
			<p v-if="data.briefing.lead" class="daily-lead">
				{{ data.briefing.lead }}
			</p>
			<div class="daily-sections">
				<section v-for="section in dailySections" :key="section.label">
					<h3>{{ section.label }}</h3>
					<article v-for="item in section.items" :key="item.title">
						<h4>{{ item.title }}</h4>
						<p v-if="item.summary">
							{{ item.summary }}
						</p>
						<a
							v-if="item.links?.original || item.links?.aihot"
							:href="item.links.original || item.links.aihot"
							target="_blank"
							rel="noopener noreferrer"
						>阅读来源</a>
					</article>
				</section>
			</div>
		</section>
		<nav class="news-filter card" aria-label="阅闻筛选">
			<button
				v-for="option in [
					{ id: 'all', label: '全部' },
					{ id: 'hot', label: 'AI HOT' },
					{ id: 'rss', label: '在花资讯' },
					{ id: 'manual', label: '手动精选' },
				]"
				:key="option.id"
				type="button"
				:class="{ active: filter === option.id }"
				@click="filter = option.id as typeof filter"
			>
				{{ option.label }}
			</button>
		</nav>
		<div class="news-grid">
			<article v-for="item in items" :key="item.id" class="news-card card">
				<header>
					<span>{{ item.category || item.sourceId }}</span><strong v-if="item.rank">#{{ item.rank }}</strong>
				</header>
				<h2>
					<a :href="item.url" target="_blank" rel="noopener noreferrer">{{
						item.title
					}}</a>
				</h2>
				<p v-if="item.summary">
					{{ item.summary }}
				</p>
				<footer>
					<time v-if="item.publishedAt">{{
						new Date(item.publishedAt).toLocaleString("zh-CN")
					}}</time><a
						:href="item.originalUrl || item.url"
						target="_blank"
						rel="noopener noreferrer"
					>原文<Icon name="tabler:arrow-up-right" /></a>
				</footer>
			</article>
		</div>
		<p v-if="!items.length" class="news-notice card">
			当前筛选下暂无内容。
		</p>
	</template>
</section>
</template>

<style scoped lang="scss">
.news-page {
	display: grid;
	gap: 1rem;
	margin: 1rem;
}

.news-hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	overflow: hidden;
	min-height: 18rem;
	padding: clamp(1.5rem, 6vw, 4rem);
	background:
		radial-gradient(
			circle at 85% 40%,
			color-mix(in srgb, var(--c-primary) 28%, transparent),
			transparent 34%
		),
		var(--ld-bg-card);
}

.news-hero span,
.daily-brief header span {
	font: 0.72rem var(--font-monospace);
	letter-spacing: 0.16em;
	color: var(--c-primary);
}

.news-hero h1 {
	margin-top: 0.35rem;
	font: clamp(2.8rem, 10vw, 6rem) / 1 var(--font-creative);
}

.news-hero p {
	margin-top: 0.8rem;
	color: var(--c-text-2);
}

.news-radar {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	position: relative;
	width: clamp(8rem, 22vw, 14rem);
	aspect-ratio: 1;
}

.news-radar i {
	position: absolute;
	opacity: 0.2;
	width: 100%;
	height: 100%;
	border: 1px solid var(--c-primary);
	border-radius: 50%;
	animation: radar 3s infinite;
}

.news-radar i:nth-child(2) {
	width: 70%;
	height: 70%;
	animation-delay: -1s;
}

.news-radar i:nth-child(3) {
	width: 40%;
	height: 40%;
	animation-delay: -2s;
}

.news-radar .iconify {
	font-size: 3rem;
	color: var(--c-primary);
}

.daily-brief {
	padding: clamp(1rem, 4vw, 2rem);
}

.daily-brief > header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 1rem;
}

.daily-brief h2 {
	margin-top: 0.3rem;
	font-family: var(--font-creative);
}

.daily-brief header a {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	font-size: 0.75rem;
	color: var(--c-primary);
}

.daily-lead {
	margin: 1rem 0;
	color: var(--c-text-2);
}

.daily-sections {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
	gap: 1rem;
}

.daily-sections > section {
	padding: 1rem;
	border: 1px solid var(--c-border);
	border-radius: 0.8rem;
}

.daily-sections h3 {
	margin-bottom: 0.8rem;
	color: var(--c-primary);
}

.daily-sections article + article {
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px dashed var(--c-border);
}

.daily-sections p {
	display: -webkit-box;
	overflow: hidden;
	margin-top: 0.35rem;
	-webkit-line-clamp: 4;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.daily-sections a {
	display: inline-block;
	margin-top: 0.45rem;
	font-size: 0.72rem;
	color: var(--c-primary);
}

.news-filter {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	padding: 0.7rem;
}

.news-filter button {
	padding: 0.5rem 0.8rem;
	border-radius: 999px;
	color: var(--c-text-2);
}

.news-filter button.active {
	background: var(--c-primary-soft);
	color: var(--c-primary);
}

.news-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
	gap: 1rem;
}

.news-card {
	display: grid;
	align-content: start;
	gap: 0.8rem;
	min-height: 13rem;
	padding: 1.2rem;
}

.news-card header,
.news-card footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	font: 0.7rem var(--font-monospace);
	color: var(--c-text-3);
}

.news-card header span {
	color: var(--c-primary);
}

.news-card h2 {
	font-family: var(--font-creative);
	line-height: 1.35;
}

.news-card p {
	display: -webkit-box;
	overflow: hidden;
	-webkit-line-clamp: 4;
	color: var(--c-text-2);
	-webkit-box-orient: vertical;
}

.news-card footer a {
	display: inline-flex;
	align-items: center;
	gap: 0.2rem;
	color: var(--c-primary);
}

.news-notice {
	padding: 1rem;
	text-align: center;
	color: var(--c-text-2);
}

.news-notice button {
	color: var(--c-primary);
}

.news-skeleton {
	min-height: 13rem;
	animation: pulse 1.2s infinite alternate;
}

@keyframes radar {
	50% {
		opacity: 0.55;
		transform: scale(0.96);
	}
}

@keyframes pulse {
	to {
		opacity: 0.5;
	}
}

@media (max-width: 640px) {
	.news-radar {
		display: none;
	}

	.daily-brief > header {
		display: grid;
	}
}

@media (prefers-reduced-motion: reduce) {
	.news-radar i,
	.news-skeleton {
		animation: none;
	}
}
</style>
