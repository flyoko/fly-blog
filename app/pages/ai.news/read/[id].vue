<script setup lang="ts">
import type { NewsDocumentDto } from '#shared/admin/news'

const route = useRoute()
const readerKey = computed(() => String(route.params.id || ''))
const newsDocument = ref<NewsDocumentDto | null>(null)
const loading = ref(true)
const error = ref('')
const failedImageUrls = ref<Set<string>>(new Set())

const paragraphs = computed(() =>
	(newsDocument.value?.bodyText || '')
		.split(/\n{2,}/u)
		.map(paragraph => paragraph.trim())
		.filter(Boolean),
)

const sourceLabel = computed(() => {
	if (!newsDocument.value)
		return ''
	return {
		hot: 'AI 精选',
		daily: 'AI 日报',
		rss: '站长资讯',
		manual: '手动精选',
	}[newsDocument.value.item.kind]
})

const publishedAt = computed(() =>
	formatDateTime(newsDocument.value?.item.publishedAt || null),
)

const originalLink = computed(() => newsDocument.value?.originalUrl || '')
const visibleImages = computed(() =>
	(newsDocument.value?.images || []).filter(image => !failedImageUrls.value.has(image.url)),
)

useSeoMeta({
	title: () => newsDocument.value
		? `${newsDocument.value.item.title} · AI 阅闻`
		: 'AI 阅闻站内阅读',
	description: () => newsDocument.value?.item.summary?.slice(0, 160)
		|| newsDocument.value?.bodyText.slice(0, 160)
		|| 'fly living AI 阅闻站内阅读。',
	ogTitle: () => newsDocument.value?.item.title || 'AI 阅闻站内阅读',
	ogDescription: () => newsDocument.value?.item.summary?.slice(0, 160)
		|| '在 fly living 内阅读这条资讯。',
	robots: 'index, follow, noarchive',
})

useHead(() => ({
	link: [
		{ rel: 'canonical', href: `https://flyovo.cc.cd/ai.news/read/${readerKey.value}` },
	],
}))

function formatDateTime(value: string | null) {
	if (!value)
		return '时间未知'
	const date = new Date(value)
	if (Number.isNaN(date.getTime()))
		return '时间未知'
	return new Intl.DateTimeFormat('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).format(date).replaceAll('/', '.')
}

function hideBrokenImage(url: string) {
	failedImageUrls.value = new Set([...failedImageUrls.value, url])
}

async function load() {
	loading.value = true
	error.value = ''
	newsDocument.value = null
	failedImageUrls.value = new Set()
	try {
		const endpoint = '/api/news/read/'
		newsDocument.value = await $fetch<{ data: NewsDocumentDto }>(
			`${endpoint}${encodeURIComponent(readerKey.value)}`,
		).then(result => result.data)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '这条资讯暂时无法读取'
	}
	finally {
		loading.value = false
	}
}

onMounted(load)
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/ai.news" />
</div>
<section class="reader-page">
	<NuxtLink class="reader-back" to="/ai.news">
		<Icon name="tabler:arrow-left" aria-hidden="true" />返回 AI 阅闻
	</NuxtLink>

	<div v-if="loading" class="reader-loading card" aria-live="polite">
		<div class="reader-loading-title" />
		<div class="reader-loading-line" />
		<div class="reader-loading-line short" />
		<div v-for="index in 6" :key="index" class="reader-loading-paragraph" />
	</div>

	<div v-else-if="error" class="reader-error card" role="alert">
		<Icon name="tabler:file-alert" aria-hidden="true" />
		<h1>这条资讯暂时无法读取</h1>
		<p>{{ error }}</p>
		<div>
			<button type="button" @click="load">
				重新加载
			</button>
			<NuxtLink to="/ai.news">
				返回列表
			</NuxtLink>
		</div>
	</div>

	<article v-else-if="newsDocument" class="reader-article card">
		<header class="reader-header">
			<div class="reader-meta">
				<span>{{ sourceLabel }}</span>
				<span>{{ newsDocument.item.category || '技术资讯' }}</span>
				<span class="reader-content-mode">
					{{ newsDocument.contentMode === 'full' ? '全文' : '摘要' }}
				</span>
			</div>
			<h1>{{ newsDocument.item.title }}</h1>
			<p v-if="newsDocument.item.summary" class="reader-summary">
				{{ newsDocument.item.summary }}
			</p>
			<dl class="reader-times">
				<div>
					<dt>发布</dt>
					<dd>{{ publishedAt }}</dd>
				</div>
				<div>
					<dt>来源</dt>
					<dd>{{ newsDocument.attribution.name }}</dd>
				</div>
			</dl>
		</header>

		<div class="reader-notice" :class="{ summary: newsDocument.contentMode === 'summary' }">
			<Icon
				:name="newsDocument.contentMode === 'full' ? 'tabler:file-description' : 'tabler:info-circle'"
				aria-hidden="true"
			/>
			<p v-if="newsDocument.contentMode === 'full'">
				以下内容整理自公开来源，版权与观点归原作者所有。
			</p>
			<p v-else>
				以下为内容摘要，完整信息请阅读原文。
			</p>
		</div>

		<div v-if="visibleImages.length" class="reader-gallery" role="group" aria-label="新闻相关图片">
			<figure v-for="image in visibleImages" :key="image.url">
				<img
					:src="image.url"
					:alt="image.alt || ''"
					loading="lazy"
					decoding="async"
					referrerpolicy="no-referrer"
					@error="hideBrokenImage(image.url)"
				>
				<figcaption v-if="image.alt">
					{{ image.alt }}
				</figcaption>
			</figure>
		</div>

		<div class="reader-body">
			<p v-for="(paragraph, index) in paragraphs" :key="`${index}:${paragraph.slice(0, 24)}`">
				{{ paragraph }}
			</p>
		</div>

		<footer class="reader-source">
			<div>
				<p>原文来源</p>
				<strong>{{ newsDocument.attribution.name }}</strong>
			</div>
			<div class="reader-source-actions">
				<a v-if="originalLink" :href="originalLink" target="_blank" rel="noopener noreferrer">
					查看原始来源<Icon name="tabler:arrow-up-right" aria-hidden="true" />
				</a>
			</div>
		</footer>
	</article>
</section>
</template>

<style scoped lang="scss">
.reader-page {
	width: min(100% - 2rem, 52rem);
	margin: 1rem auto 3rem;
}

.reader-back {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin-bottom: 0.85rem;
	font-size: 0.78rem;
	color: var(--c-text-2);
}

.reader-article,
.reader-loading,
.reader-error {
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background: var(--ld-bg-card);
}

.reader-header {
	padding: clamp(1.3rem, 4vw, 2.35rem);
	border-bottom: 1px solid var(--c-border);
}

.reader-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.45rem 0.7rem;
	font: 0.68rem var(--font-monospace);
	color: var(--c-text-1);
}

.reader-meta > :first-child {
	font-weight: 700;
	color: var(--c-primary);
}

.reader-content-mode {
	padding: 0.18rem 0.4rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 28%, var(--c-border));
	border-radius: 0.35rem;
	background: var(--c-primary-soft);
	color: var(--c-text-1);
}

.reader-header h1 {
	max-width: 22ch;
	margin-top: 0.85rem;
	font: clamp(1.8rem, 5vw, 2.75rem) / 1.25 var(--font-creative);
	letter-spacing: -0.035em;
}

.reader-summary {
	max-width: 44rem;
	margin-top: 0.9rem;
	font-size: 0.9rem;
	line-height: 1.75;
	color: var(--c-text-2);
}

.reader-times {
	display: flex;
	flex-wrap: wrap;
	gap: 0.75rem 1.5rem;
	margin-top: 1.25rem;
}

.reader-times div {
	display: grid;
	grid-template-columns: auto auto;
	gap: 0.35rem;
	font: 0.66rem var(--font-monospace);
}

.reader-times dt {
	color: var(--c-text-1);
}

.reader-times dd {
	color: var(--c-text-2);
}

.reader-notice {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 0.6rem;
	margin: 1.2rem clamp(1.3rem, 4vw, 2.35rem) 0;
	padding: 0.75rem 0.85rem;
	border-left: 0.2rem solid var(--c-primary);
	background: var(--c-primary-soft);
	font-size: 0.74rem;
	line-height: 1.6;
	color: var(--c-text-2);
}

.reader-notice.summary {
	border-left-color: var(--c-warning);
}

.reader-notice .iconify {
	margin-top: 0.14rem;
	color: var(--c-primary);
}

.reader-notice.summary .iconify {
	color: var(--c-warning);
}

.reader-gallery {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
	gap: 1rem;
	padding: clamp(1.2rem, 3vw, 1.8rem) clamp(1.3rem, 4vw, 2.35rem) 0;
}

.reader-gallery figure {
	overflow: hidden;
	border: 1px solid var(--c-border);
	border-radius: 0.85rem;
	background: var(--c-primary-soft);
}

.reader-gallery img {
	display: block;
	width: 100%;
	max-height: 34rem;
	background: var(--ld-bg-card);
	object-fit: contain;
}

.reader-gallery figcaption {
	padding: 0.65rem 0.8rem;
	border-top: 1px solid var(--c-border);
	font-size: 0.72rem;
	line-height: 1.6;
	color: var(--c-text-2);
}

.reader-body {
	padding: clamp(1.4rem, 4vw, 2.35rem);
}

.reader-body p {
	font-size: clamp(0.98rem, 2vw, 1.06rem);
	line-height: 1.95;
	color: var(--c-text-1);
}

.reader-body p + p {
	margin-top: 1.15em;
}

.reader-source {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1.15rem clamp(1.3rem, 4vw, 2.35rem);
	border-top: 1px solid var(--c-border);
}

.reader-source p {
	font-size: 0.66rem;
	color: var(--c-text-1);
}

.reader-source strong {
	display: block;
	margin-top: 0.15rem;
	font-size: 0.82rem;
}

.reader-source-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 0.55rem 0.9rem;
}

.reader-source-actions a {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	font-size: 0.74rem;
	font-weight: 700;
	color: var(--c-primary);
}

.reader-loading {
	display: grid;
	gap: 0.8rem;
	padding: clamp(1.5rem, 5vw, 3rem);
}

.reader-loading-title,
.reader-loading-line,
.reader-loading-paragraph {
	border-radius: 0.35rem;
	background: var(--c-primary-soft);
}

.reader-loading-title {
	width: 72%;
	height: 2.8rem;
}

.reader-loading-line {
	width: 90%;
	height: 0.8rem;
}

.reader-loading-line.short {
	width: 56%;
	margin-bottom: 1.5rem;
}

.reader-loading-paragraph {
	height: 4.8rem;
}

.reader-error {
	display: grid;
	justify-items: center;
	gap: 0.6rem;
	padding: 4rem 1rem;
	text-align: center;
}

.reader-error > .iconify {
	font-size: 2rem;
	color: var(--c-text-3);
}

.reader-error h1 {
	font-size: 1.15rem;
}

.reader-error p {
	max-width: 30rem;
	font-size: 0.8rem;
	line-height: 1.6;
	color: var(--c-text-2);
}

.reader-error div {
	display: flex;
	gap: 1rem;
	margin-top: 0.6rem;
	font-size: 0.78rem;
}

.reader-error button,
.reader-error a {
	color: var(--c-primary);
}

.reader-back:focus-visible,
.reader-source a:focus-visible,
.reader-error button:focus-visible,
.reader-error a:focus-visible {
	outline: 0.16rem solid var(--c-primary-soft);
	outline-offset: 0.18rem;
}

@media (hover: hover) {
	.reader-back:hover,
	.reader-source-actions a:hover,
	.reader-error button:hover,
	.reader-error a:hover {
		color: var(--c-primary-hover);
	}
}

@media (max-width: 620px) {
	.reader-page {
		width: calc(100% - 1.4rem);
		margin-top: 0.7rem;
	}

	.reader-header h1 {
		font-size: 1.7rem;
	}

	.reader-source {
		flex-direction: column;
		align-items: flex-start;
	}

	.reader-source-actions {
		justify-content: flex-start;
	}
}

@media (max-width: 360px) {
	.reader-times {
		flex-direction: column;
	}
}

@media (prefers-reduced-motion: reduce) {
	.reader-back,
	.reader-source a,
	.reader-error button,
	.reader-error a {
		transition: none;
	}
}
</style>
