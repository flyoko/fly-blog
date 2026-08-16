<script setup lang="ts">
import type { MomentDto } from '#shared/admin/moments'

const props = defineProps<{ moment: MomentDto, detail?: boolean }>()
const emit = defineEmits<{ like: [] }>()
const formatted = computed(() =>
	new Intl.DateTimeFormat('zh-CN', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(props.moment.publishedAt || props.moment.createdAt)),
)
</script>

<template>
<article class="moment-card card">
	<header>
		<div>
			<time :datetime="moment.publishedAt || moment.createdAt">{{
				formatted
			}}</time>
			<span v-if="moment.city"><Icon name="tabler:map-pin" />{{ moment.city }}</span>
		</div>
		<NuxtLink
			v-if="!detail"
			:to="`/moments/${moment.id}`"
			aria-label="查看瞬间详情"
		>
			<Icon name="tabler:arrow-up-right" />
		</NuxtLink>
	</header>
	<p class="moment-content">
		{{ moment.content }}
	</p>
	<div
		v-if="moment.media.length"
		class="moment-gallery"
		:class="`is-${Math.min(moment.media.length, 4)}`"
	>
		<a
			v-for="media in moment.media"
			:key="media.id"
			:href="media.url"
			target="_blank"
			rel="noopener noreferrer"
		>
			<img :src="media.url" :alt="media.alt || '瞬间图片'" loading="lazy" decoding="async" fetchpriority="low">
		</a>
	</div>
	<div v-if="moment.music" class="moment-music">
		<Icon name="tabler:music" />
		<a :href="moment.music.url" target="_blank" rel="noopener noreferrer">
			<strong>{{ moment.music.title }}</strong><span v-if="moment.music.artist"> · {{ moment.music.artist }}</span>
		</a>
	</div>
	<footer>
		<div class="moment-tags">
			<span v-for="tag in moment.tags" :key="tag"># {{ tag }}</span>
		</div>
		<button
			type="button"
			:class="{ 'is-liked': moment.liked }"
			:aria-pressed="moment.liked"
			@click="emit('like')"
		>
			<Icon :name="moment.liked ? 'tabler:heart-filled' : 'tabler:heart'" />
			{{ moment.likeCount }}
		</button>
	</footer>
</article>
</template>

<style scoped lang="scss">
.moment-card {
	content-visibility: auto;
	contain-intrinsic-size: auto 18rem;
	display: grid;
	gap: 1rem;
	padding: clamp(1rem, 3vw, 1.6rem);
	box-shadow: 0 16px 48px color-mix(in srgb, var(--ld-shadow) 75%, transparent);
}

.moment-card > header,
.moment-card > footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.moment-card header div {
	display: flex;
	flex-wrap: wrap;
	gap: 0.7rem;
	font-family: var(--font-monospace);
	font-size: 0.72rem;
	color: var(--c-text-1);
}

.moment-card header span {
	display: inline-flex;
	align-items: center;
	gap: 0.2rem;
}

.moment-content {
	line-height: 1.8;
	white-space: pre-wrap;
}

.moment-gallery {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.5rem;
	overflow: hidden;
	border-radius: 0.8rem;
}

.moment-gallery.is-1 {
	grid-template-columns: 1fr;
}

.moment-gallery img {
	display: block;
	width: 100%;
	height: clamp(12rem, 30vw, 24rem);
	transition: transform 0.25s;
	object-fit: cover;
}

.moment-gallery a:hover img {
	transform: scale(1.02);
}

.moment-music {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	padding: 0.75rem 0.9rem;
	border-radius: 0.75rem;
	background: var(--c-bg-soft);
	font-size: 0.82rem;
}

.moment-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	font-size: 0.72rem;
	color: var(--c-primary);
}

.moment-card footer button {
	display: inline-flex;
	align-items: center;
	gap: 0.3rem;
	padding: 0.4rem 0.7rem;
	border-radius: 999px;
	color: var(--c-text-3);
	transition:
		transform 0.2s,
		background-color 0.2s;
}

.moment-card footer button:hover {
	background: var(--c-primary-soft);
	transform: translateY(-1px);
}

.moment-card footer button.is-liked {
	color: #E65B78;
}

@media (max-width: 600px) {
	.moment-gallery {
		grid-template-columns: 1fr;
	}

	.moment-gallery img {
		height: auto;
		max-height: 28rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.moment-gallery img,
	.moment-card footer button {
		transition: none;
	}
}
</style>
