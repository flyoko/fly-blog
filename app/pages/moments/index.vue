<script setup lang="ts">
import type { MomentDto } from '#shared/admin/moments'

const api = useMomentsApi()
const moments = ref<MomentDto[]>([])
const page = ref(1)
const total = ref(0)
const loading = ref(true)
const loadingMore = ref(false)
const error = ref('')
const tag = ref('')
const year = ref<number | undefined>()
const pageSize = 12
const hasMore = computed(() => moments.value.length < total.value)

useSeoMeta({
	title: '瞬间',
	description: '记录此刻的想法、照片与正在听的声音。',
})

async function load(reset = false) {
	if (reset) {
		page.value = 1
		moments.value = []
	}
	loading.value = reset || moments.value.length === 0
	loadingMore.value = !loading.value
	error.value = ''
	try {
		const result = await api.list({
			page: page.value,
			pageSize,
			tag: tag.value || undefined,
			year: year.value,
		})
		moments.value = reset ? result.items : [...moments.value, ...result.items]
		total.value = result.total
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '瞬间加载失败'
	}
	finally {
		loading.value = false
		loadingMore.value = false
	}
}

async function loadMore() {
	page.value += 1
	await load()
}
async function toggleLike(moment: MomentDto) {
	try {
		Object.assign(moment, await api.like(moment.id, Boolean(moment.liked)))
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '点赞失败'
	}
}
watch([tag, year], () => load(true))
onMounted(() => load(true))
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="瞬间" tag="h1" />
</div>
<section class="moments-page">
	<header class="moments-hero card">
		<div>
			<span>NOW · MOMENTS</span>
			<h1>瞬间</h1>
			<p>一些没有长成文章，但仍值得留下的时刻。</p>
		</div>
		<Icon name="tabler:sparkles" />
	</header>
	<div class="moments-filter card">
		<label><span>标签</span><input v-model.trim="tag" type="search" placeholder="全部标签"></label>
		<label><span>年份</span><input
			v-model.number="year"
			type="number"
			min="2020"
			max="2100"
			placeholder="全部年份"
		></label>
	</div>
	<p v-if="error" class="moments-message card">
		{{ error }} <button type="button" @click="load(true)">
			重试
		</button>
	</p>
	<div v-if="loading" class="moments-list">
		<div v-for="i in 3" :key="i" class="moment-skeleton card" />
	</div>
	<div v-else-if="moments.length" class="moments-list">
		<MomentCard
			v-for="moment in moments"
			:key="moment.id"
			:moment="moment"
			@like="toggleLike(moment)"
		/>
		<button
			v-if="hasMore"
			class="moments-more card"
			type="button"
			:disabled="loadingMore"
			@click="loadMore"
		>
			{{ loadingMore ? "加载中…" : "继续往下看" }}
		</button>
	</div>
	<p v-else class="moments-message card">
		这里还没有公开的瞬间。
	</p>
</section>
</template>

<style scoped lang="scss">
.moments-page {
	display: grid;
	gap: 1rem;
	margin: 1rem;
}

.moments-hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: clamp(1.5rem, 6vw, 4rem);
	background:
		radial-gradient(circle at 85% 20%, var(--c-primary-soft), transparent 35%),
		var(--ld-bg-card);
}

.moments-hero span {
	font: 0.72rem var(--font-monospace);
	letter-spacing: 0.16em;
	color: var(--c-primary);
}

.moments-hero h1 {
	margin-top: 0.35rem;
	font: clamp(2.5rem, 10vw, 6rem) / 1 var(--font-creative);
}

.moments-hero p {
	margin-top: 0.8rem;
	color: var(--c-text-2);
}

.moments-hero > .iconify {
	font-size: clamp(3rem, 12vw, 8rem);
	color: var(--c-primary-soft);
}

.moments-filter {
	display: flex;
	flex-wrap: wrap;
	gap: 0.8rem;
	padding: 0.8rem;
}

.moments-filter label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.45rem 0.7rem;
	border: 1px solid var(--c-border);
	border-radius: 999px;
	font-size: 0.75rem;
}

.moments-filter span {
	color: var(--c-text-1);
}

.moments-filter input {
	min-width: 8rem;
	outline: none;
}

.moments-list {
	display: grid;
	gap: 1rem;
}

.moments-list > :deep(.moment-card) {
	animation: content-reveal var(--motion-slow) var(--motion-ease) both;
}

@for $index from 1 through 8 {
	.moments-list > :deep(.moment-card:nth-child(#{$index})) {
		animation-delay: #{($index - 1) * 35}ms;
	}
}

@keyframes content-reveal {
	from {
		opacity: 0;
		transform: translateY(0.65rem);
	}
}

.moment-skeleton {
	min-height: 12rem;
	animation: moment-pulse 1.2s infinite alternate;
}

.moments-message {
	padding: 2rem;
	text-align: center;
	color: var(--c-text-2);
}

.moments-message button {
	margin-left: 0.5rem;
	color: var(--c-primary);
}

.moments-more {
	padding: 1rem;
	color: var(--c-primary);
}

@keyframes moment-pulse {
	to {
		opacity: 0.5;
	}
}

@media (prefers-reduced-motion: reduce) {
	.moments-list > :deep(.moment-card) {
		animation: none;
	}

	.moment-skeleton {
		animation: none;
	}
}
</style>
