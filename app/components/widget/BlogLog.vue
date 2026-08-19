<script setup lang="ts">
import type { ArticleProps } from '~/types/article'

interface BlogLogItem {
	key: string
	date: string
	label: string
	title: string
	action: '发布' | '更新' | ''
	path?: string
	timestamp: number
}

const { timeEstablished } = useAppConfig()
const { data: posts } = await useAsyncData('blog-log:posts', () => getArticleIndexOptions(), { default: () => [] })

function resolveActivity(article: ArticleProps): Omit<BlogLogItem, 'key' | 'label' | 'title' | 'path'> | null {
	const date = resolveArticleDate(article, true)
	if (!date)
		return null

	return {
		date,
		action: date === article.updated ? '更新' : '发布',
		timestamp: toZonedTemporal(date).epochMilliseconds,
	}
}

function formatLogDate(value: string) {
	try {
		return toZonedTemporal(value).toPlainDate().toString()
	}
	catch {
		return value.slice(0, 10)
	}
}

const recentUpdates = computed<BlogLogItem[]>(() => posts.value
	.flatMap((article) => {
		const activity = resolveActivity(article)
		if (!activity || !article.title)
			return []
		return [{
			...activity,
			key: article.path,
			label: formatLogDate(activity.date),
			title: article.title,
			path: article.path,
		}]
	})
	.sort((left, right) => right.timestamp - left.timestamp)
	.slice(0, 3),
)

const fallbackItem = computed<BlogLogItem>(() => ({
	key: 'site-launched',
	date: timeEstablished,
	label: timeEstablished,
	title: 'fly living 博客上线',
	action: '',
	timestamp: Date.parse(timeEstablished) || 0,
}))
const blogLog = computed(() => recentUpdates.value.length ? recentUpdates.value : [fallbackItem.value])
</script>

<template>
<BlogWidget card title="更新日志">
	<ol class="blog-log-list">
		<li v-for="item in blogLog" :key="item.key" class="blog-log-item">
			<time class="blog-log-date" :datetime="item.date">{{ item.label }}</time>
			<NuxtLink v-if="item.path" class="blog-log-link" :to="item.path">
				{{ item.action }} · {{ item.title }}
			</NuxtLink>
			<span v-else class="blog-log-text">{{ item.title }}</span>
		</li>
	</ol>
</BlogWidget>
</template>

<style lang="scss" scoped>
.blog-log-list {
	display: grid;
	gap: 0.8rem;
	min-width: 0;
	margin: 0;
	padding: 0;
	list-style: none;
}

.blog-log-item {
	display: grid;
	gap: 0.15rem;
	min-width: 0;
}

.blog-log-date {
	font-size: 0.86em;
	font-variant-numeric: tabular-nums;
	color: var(--c-text-2);
}

.blog-log-link,
.blog-log-text {
	overflow-wrap: anywhere;
	min-width: 0;
	line-height: 1.45;
	color: var(--c-text);
}

.blog-log-link {
	text-decoration: none;
	transition: color 0.2s;

	&:hover,
	&:focus-visible {
		color: var(--c-primary);
	}
}
</style>
