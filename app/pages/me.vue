<script setup lang="ts">
import linksRaw from '~~/config/about/links.json'
import timelineRaw from '~~/config/about/timeline.json'
import { aboutLinksSchema, aboutTimelineSchema } from '#shared/admin/about'

const timeline = aboutTimelineSchema.parse(timelineRaw)
const links = aboutLinksSchema.parse(linksRaw)
const { data: profile } = await useAsyncData('about:profile', () =>
	queryCollection('content').path('/about/profile').first())
const appConfig = useAppConfig()
const profileSummary = computed(() =>
	String((profile.value as Record<string, unknown> | null)?.summary || ''),
)

useSeoMeta({
	title: () => profile.value?.title || '自述',
	description: () => profileSummary.value || `${appConfig.title} 的个人自述。`,
	ogTitle: () => profile.value?.title || '自述',
	ogDescription: () =>
		profileSummary.value || `${appConfig.title} 的个人自述。`,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="自述" tag="h1" />
</div>

<article class="about-page">
	<header class="about-hero card">
		<div class="about-hero-copy">
			<span class="about-eyebrow">ABOUT · FLY LIVING</span>
			<h1>{{ profile?.title || "关于我" }}</h1>
			<p>{{ profileSummary }}</p>
		</div>
		<img
			:src="appConfig.author.avatar"
			alt="fly 的头像"
			width="128"
			height="128"
		>
	</header>

	<section v-if="profile" class="about-section card article">
		<ContentRenderer :value="profile" />
	</section>

	<section class="about-section card">
		<header class="about-section-heading">
			<span>TRACE</span>
			<h2>时间线</h2>
		</header>
		<ol class="about-timeline">
			<li v-for="item in timeline" :key="item.id">
				<time>{{ item.date }}</time>
				<div>
					<h3>{{ item.title }}</h3>
					<p v-if="item.description">
						{{ item.description }}
					</p>
					<a
						v-if="item.link"
						:href="item.link"
						target="_blank"
						rel="noopener noreferrer"
					>查看相关内容</a>
				</div>
			</li>
		</ol>
	</section>

	<section class="about-section card">
		<header class="about-section-heading">
			<span>LINKS</span>
			<h2>找到我</h2>
		</header>
		<div class="about-links">
			<a
				v-for="item in links"
				:key="item.id"
				:href="item.url"
				target="_blank"
				rel="noopener noreferrer"
			>
				<Icon :name="item.icon || 'tabler:external-link'" />
				{{ item.label }}
			</a>
		</div>
	</section>
</article>
</template>

<style scoped lang="scss">
.about-page {
	display: grid;
	gap: 1rem;
	margin: 1rem;
}

.about-hero {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 2rem;
	padding: clamp(1.5rem, 6vw, 4rem);
	background:
		radial-gradient(
			circle at 80% 15%,
			color-mix(in srgb, var(--c-primary) 25%, transparent),
			transparent 35%
		),
		var(--ld-bg-card);
}

.about-hero h1 {
	margin: 0.35rem 0;
	font-family: var(--font-creative);
	font-size: clamp(2.2rem, 8vw, 5rem);
	line-height: 1;
}

.about-hero p {
	max-width: 38rem;
	color: var(--c-text-2);
}

.about-hero img {
	flex: 0 0 auto;
	border-radius: 42%;
	box-shadow: var(--box-shadow-3);
}

.about-eyebrow,
.about-section-heading span {
	font-family: var(--font-monospace);
	font-size: 0.72rem;
	letter-spacing: 0.16em;
	color: var(--c-primary);
}

.about-section {
	padding: clamp(1.2rem, 4vw, 2.5rem);
}

.about-section-heading h2 {
	margin-top: 0.25rem;
	font-family: var(--font-creative);
}

.about-timeline {
	display: grid;
	gap: 0;
	margin-top: 1.5rem;
}

.about-timeline li {
	display: grid;
	grid-template-columns: 7rem 1fr;
	gap: 1rem;
	position: relative;
	padding: 0 0 1.5rem 1rem;
	border-inline-start: 1px solid var(--c-border);
}

.about-timeline li::before {
	content: "";
	position: absolute;
	inset-inline-start: -0.35rem;
	top: 0.35rem;
	width: 0.65rem;
	height: 0.65rem;
	border-radius: 50%;
	box-shadow: 0 0 0 0.3rem var(--c-primary-soft);
	background: var(--c-primary);
}

.about-timeline time {
	font-family: var(--font-monospace);
	color: var(--c-text-3);
}

.about-timeline h3 {
	font-family: var(--font-creative);
}

.about-timeline p {
	margin-top: 0.3rem;
	color: var(--c-text-2);
}

.about-timeline a {
	display: inline-block;
	margin-top: 0.5rem;
	color: var(--c-primary);
}

.about-links {
	display: flex;
	flex-wrap: wrap;
	gap: 0.7rem;
	margin-top: 1.5rem;
}

.about-links a {
	display: inline-flex;
	align-items: center;
	gap: 0.45rem;
	padding: 0.65rem 0.9rem;
	border: 1px solid var(--c-border);
	border-radius: 999px;
	transition:
		transform 0.2s,
		border-color 0.2s;
}

.about-links a:hover {
	border-color: var(--c-primary);
	transform: translateY(-2px);
}

@media (max-width: 600px) {
	.about-hero {
		align-items: flex-start;
	}

	.about-hero img {
		width: 72px;
		height: 72px;
	}

	.about-timeline li {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	.about-links a {
		transition: none;
	}
}
</style>
