<script setup lang="ts">
import linksRaw from '~~/config/about/links.json'
import timelineRaw from '~~/config/about/timeline.json'
import { aboutLinksSchema, aboutTimelineSchema } from '#shared/admin/about'

const timeline = aboutTimelineSchema.parse(timelineRaw)
const links = aboutLinksSchema.parse(linksRaw)
const { data: profile } = await useAsyncData('about:profile', () =>
	queryCollection('content').path('/about/profile').first())
const appConfig = useAppConfig()
const isDynamicMode = ref(false)
let themeClassObserver: MutationObserver | undefined

onMounted(() => {
	const root = document.documentElement
	const syncDynamicMode = () => {
		isDynamicMode.value = root.classList.contains('dynamic')
	}
	syncDynamicMode()
	themeClassObserver = new MutationObserver(syncDynamicMode)
	themeClassObserver.observe(root, {
		attributes: true,
		attributeFilter: ['class'],
	})
})

onBeforeUnmount(() => themeClassObserver?.disconnect())
const profileSummary = computed(() =>
	String((profile.value as Record<string, unknown> | null)?.summary || ''),
)
const profileAvatar = computed(() =>
	String((profile.value as Record<string, unknown> | null)?.avatar || ''),
)
const animatedCatAvatar = 'https://flyovo.cc.cd/media/public/profile/917a55b1-a628-406b-8bdf-76a0a8ad81fa.gif'
const profilePortrait = computed(() =>
	profileAvatar.value === animatedCatAvatar ? '/assets/profile-cat-hero.webp' : '',
)

useSeoMeta({
	title: () => profile.value?.title || '自述',
	description: () => profileSummary.value || `${appConfig.title} 的个人自述。`,
	ogTitle: () => profile.value?.title || '自述',
	ogDescription: () =>
		profileSummary.value || `${appConfig.title} 的个人自述。`,
	ogImage: () => profileAvatar.value || appConfig.author.avatar,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" />
</div>

<article class="about-page">
	<header class="about-hero card" :class="{ 'is-dynamic-mode': isDynamicMode }">
		<div class="about-hero-copy">
			<span class="about-eyebrow">ABOUT · FLY LIVING</span>
			<h1>{{ profile?.title || "关于我" }}</h1>
			<p>{{ profileSummary }}</p>
		</div>
		<BlogShinchanScene
			variant="about"
			:character-src="profileAvatar || undefined"
			:portrait-src="profilePortrait || undefined"
		/>
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
	position: relative;
	overflow: hidden;
	min-height: clamp(17rem, 31vw, 22rem);
	padding: clamp(1.5rem, 6vw, 4rem);
	padding-inline-end: clamp(19rem, 42vw, 32rem);
	background:
		radial-gradient(circle at 78% 34%, color-mix(in srgb, var(--c-flow-blue) 20%, transparent), transparent 28%),
		radial-gradient(circle at 100% 112%, color-mix(in srgb, var(--c-flow-blue) 25%, transparent), transparent 43%),
		linear-gradient(130deg, var(--c-surface-fill), color-mix(in srgb, var(--c-surface-fill) 80%, var(--c-flow-violet) 6%));
}

.about-hero::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, color-mix(in srgb, var(--c-surface-fill) 96%, transparent) 0 42%, transparent 64%);
	pointer-events: none;
	z-index: 0;
}

.about-hero-copy {
	position: relative;
	z-index: 2;
}

.about-hero.is-pointer-active :deep(.scene-profile-avatar) {
	filter: brightness(1.04) saturate(1.06);
}

.about-hero.is-pointer-active :deep(.scene-avatar-tether) {
	opacity: 1;
}

.about-hero.is-pointer-active :deep(.scene-character) {
	filter: drop-shadow(0 18px 28px rgb(32 71 150 / 28%));
}

.about-hero.is-pressed :deep(.scene-ripple) {
	animation: shinchan-click-ripple 0.72s cubic-bezier(0.16, 1, 0.3, 1);
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

.about-hero.is-dynamic-mode {
	border-color: rgb(105 157 255 / 26%);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 8%),
		0 1.6rem 4.5rem rgb(2 10 31 / 34%);
	background:
		radial-gradient(circle at 72% 30%, rgb(54 117 255 / 22%), transparent 25%),
		radial-gradient(circle at 98% 104%, rgb(39 105 255 / 34%), transparent 42%),
		linear-gradient(135deg, #071126 0%, #0A1732 46%, #102B61 100%);
}

.about-hero.is-dynamic-mode::after {
	background: linear-gradient(90deg, rgb(5 13 30 / 94%) 0 40%, rgb(7 18 42 / 62%) 55%, transparent 74%);
}

.about-hero.is-dynamic-mode h1 {
	text-shadow:
		0 1px 0 rgb(255 255 255 / 20%),
		0 0.75rem 2.2rem rgb(16 72 202 / 24%);
	color: #F7FAFF;
}

.about-hero.is-dynamic-mode p {
	color: rgb(220 229 248 / 78%);
}

.about-hero.is-dynamic-mode :deep(.scene-atmosphere) {
	opacity: 1;
	filter: saturate(1.22) brightness(1.04);
}

.about-hero.is-dynamic-mode :deep(.scene-orbit) {
	border-color: rgb(92 153 255 / 42%);
}

.about-hero.is-dynamic-mode :deep(.scene-track) {
	background: linear-gradient(90deg, transparent, rgb(98 174 255 / 88%), transparent);
}

.about-hero.is-dynamic-mode :deep(.scene-profile-avatar) {
	border-color: rgb(153 194 255 / 58%);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 38%),
		0 0 0 0.55rem rgb(82 142 255 / 10%),
		0 0 2.4rem rgb(57 121 255 / 24%),
		0 1.4rem 3.2rem rgb(2 11 37 / 48%);
	background: rgb(12 31 70 / 42%);
}

.about-hero.is-dynamic-mode :deep(.scene-profile-avatar img) {
	background: radial-gradient(circle at 34% 24%, rgb(255 255 255 / 24%), rgb(45 92 177 / 36%));
}

.about-hero.is-dynamic-mode :deep(.scene-planet) {
	box-shadow:
		inset 0 1.2rem 2.6rem rgb(255 255 255 / 20%),
		inset 0 -2.4rem 5rem rgb(7 25 91 / 52%),
		0 -0.3rem 2.2rem rgb(79 153 255 / 36%),
		0 0 4.2rem rgb(29 93 232 / 34%);
}

.about-hero.is-dynamic-mode :deep(.scene-character) {
	filter: drop-shadow(0 16px 30px rgb(0 0 0 / 34%));
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
	color: var(--c-text-1);
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
		min-height: 21rem;
		padding: 1.4rem 1.4rem 11.5rem;
	}

	.about-hero::after {
		background: linear-gradient(to bottom, color-mix(in srgb, var(--c-surface-fill) 94%, transparent) 0 42%, transparent 66%);
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
