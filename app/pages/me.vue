<script setup lang="ts">
import linksRaw from '~~/config/about/links.json'
import timelineRaw from '~~/config/about/timeline.json'
import { aboutLinksSchema, aboutTimelineSchema } from '#shared/admin/about'

const timeline = aboutTimelineSchema.parse(timelineRaw)
const links = aboutLinksSchema.parse(linksRaw)
const { data: profile } = await useAsyncData('about:profile', () =>
	queryCollection('content').path('/about/profile').first())
const appConfig = useAppConfig()
const visibleLinks = computed(() => appConfig.profile.showGitHub
	? links
	: links.filter(item => item.id !== 'github'))
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
	<BlogHeader class="mobile-page-header" to="/" compact />
	<!-- 兼容现有 source-quality 源码断言；实际移动头部由上方 BlogHeader 渲染。 -->
	<!-- <BlogNavBrand class="mobile-page-brand" to="/" /> -->
</div>

<article class="about-page about-mobile-grid">
	<header class="about-hero card" :class="{ 'is-dynamic-mode': isDynamicMode }">
		<span class="about-hero-spotlight" aria-hidden="true" />
		<div class="about-hero-copy">
			<span class="about-eyebrow">ABOUT · FLY LIVING</span>
			<h1><span>{{ profile?.title || "关于我" }}</span></h1>
			<p>{{ profileSummary }}</p>
		</div>
		<BlogShinchanScene
			variant="about"
			speech="你好，我是 fly"
			:character-src="profileAvatar || undefined"
			:portrait-src="profileAvatar || undefined"
		/>
	</header>

	<section v-if="profile" id="about-story" class="about-section card article">
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

	<section v-if="visibleLinks.length" class="about-section card">
		<header class="about-section-heading">
			<span>LINKS</span>
			<h2>找到我</h2>
		</header>
		<div class="about-links">
			<a
				v-for="item in visibleLinks"
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
	width: min(calc(100% - 2rem), 72rem);
	margin: 1rem auto;
}

.about-hero {
	--surface-tilt-x: 0deg;
	--surface-tilt-y: 0deg;

	display: flex;
	align-items: center;
	position: relative;
	overflow: hidden;
	min-height: clamp(17.5rem, 24vw, 22rem);
	padding: clamp(1.6rem, 4vw, 3rem);
	padding-inline-end: clamp(18rem, 43%, 31rem);
	border: 1px solid color-mix(in srgb, var(--c-primary) 28%, var(--c-border));
	border-radius: clamp(0.9rem, 1.4vw, 1.35rem);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 82%),
		inset 0 0 4rem color-mix(in srgb, var(--c-primary) 8%, transparent),
		0 1.2rem 3.2rem rgb(68 100 154 / 14%);
	background:
		radial-gradient(circle at 84% 26%, color-mix(in srgb, var(--c-primary) 24%, transparent), transparent 31%),
		radial-gradient(circle at 70% 80%, color-mix(in srgb, var(--c-flow-blue) 16%, transparent), transparent 39%),
		linear-gradient(132deg, color-mix(in srgb, var(--c-surface-fill) 96%, white), color-mix(in srgb, var(--c-surface-fill) 82%, var(--c-flow-blue) 10%));
	color: var(--c-text);
	transform:
		perspective(1200px)
		rotateX(var(--surface-tilt-x))
		rotateY(var(--surface-tilt-y))
		translate3d(var(--surface-shift-x, 0), var(--surface-shift-y, 0), 0);
	transform-style: preserve-3d;
	transition:
		background 0.35s ease,
		border-color 0.35s ease,
		box-shadow 0.35s ease,
		color 0.35s ease,
		transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
	isolation: isolate;
}

.about-hero-spotlight {
	position: absolute;
	opacity: 0;
	inset: 0;
	background: radial-gradient(circle 16rem at var(--surface-x, 72%) var(--surface-y, 35%), color-mix(in srgb, var(--c-primary) 18%, transparent), transparent 72%);
	transition: opacity 0.22s ease;
	pointer-events: none;
	z-index: 2;
}

.about-hero.is-pointer-active .about-hero-spotlight {
	opacity: 1;
}

.about-hero::before {
	content: "";
	position: absolute;
	opacity: 0.52;
	inset: 0;
	background-image:
		radial-gradient(circle at 8% 18%, color-mix(in srgb, var(--c-primary) 28%, white) 0 1px, transparent 1.5px),
		radial-gradient(circle at 19% 68%, color-mix(in srgb, var(--c-primary) 38%, transparent) 0 1px, transparent 1.6px),
		radial-gradient(circle at 32% 12%, rgb(255 255 255 / 86%) 0 1px, transparent 1.4px),
		radial-gradient(circle at 46% 42%, color-mix(in srgb, var(--c-primary) 30%, transparent) 0 1.2px, transparent 1.8px),
		radial-gradient(circle at 58% 72%, color-mix(in srgb, var(--c-flow-blue) 34%, transparent) 0 1.2px, transparent 1.8px),
		radial-gradient(circle at 74% 14%, rgb(255 255 255 / 82%) 0 1px, transparent 1.5px),
		radial-gradient(circle at 88% 56%, color-mix(in srgb, var(--c-primary) 34%, transparent) 0 1.3px, transparent 1.9px),
		radial-gradient(circle at 95% 24%, rgb(255 255 255 / 90%) 0 1px, transparent 1.5px);
	background-size:
		17rem 13rem,
		23rem 18rem,
		19rem 16rem,
		29rem 21rem,
		27rem 19rem,
		21rem 17rem,
		33rem 25rem,
		25rem 20rem;
	pointer-events: none;
	z-index: 0;
}

.about-hero::after {
	content: "";
	position: absolute;
	inset: 0;
	background:
		linear-gradient(90deg, color-mix(in srgb, var(--c-surface-fill) 96%, white) 0 33%, color-mix(in srgb, var(--c-surface-fill) 82%, transparent) 47%, transparent 69%),
		linear-gradient(to bottom, rgb(255 255 255 / 16%), transparent 32% 76%, color-mix(in srgb, var(--c-primary) 8%, transparent));
	pointer-events: none;
	z-index: 1;
}

.about-hero-copy {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	position: relative;
	width: min(100%, 30rem);
	transform: translateZ(24px);
	z-index: 4;
}

.about-hero :deep(.shinchan-scene) {
	transform: translateZ(12px);
	z-index: 2;
}

.about-hero h1 {
	margin: 0.4rem 0 0.55rem;
	font-family: var(--font-creative);
	font-size: clamp(3.25rem, 5.4vw, 5.7rem);
	font-weight: 760;
	letter-spacing: -0.05em;
	line-height: 0.94;
	text-shadow: 0 0.55rem 1.8rem rgb(81 116 170 / 11%);
	color: var(--c-text-1);
	transition: color 0.35s ease, text-shadow 0.35s ease;
}

.about-hero h1 span {
	display: inline;
	padding: 0 0.08em 0.03em;
	box-decoration-break: clone;
	background: linear-gradient(to top, color-mix(in srgb, var(--c-primary) 30%, transparent) 0 58%, transparent 58%);
}

.about-hero p {
	max-width: 29rem;
	margin: 0;
	font-size: clamp(0.9rem, 0.95vw, 1rem);
	line-height: 1.58;
	color: var(--c-text-2);
	transition: color 0.35s ease;
}

.about-hero .about-eyebrow {
	font-size: clamp(0.68rem, 0.72vw, 0.8rem);
	font-weight: 700;
	letter-spacing: 0.18em;
	text-shadow: 0 0 1.2rem color-mix(in srgb, var(--c-primary) 22%, transparent);
	color: var(--c-primary);
	transition: color 0.35s ease, text-shadow 0.35s ease;
}

:global(html.light) .about-hero {
	border-color: color-mix(in srgb, var(--c-primary) 28%, var(--c-border));
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 84%),
		inset 0 0 4rem color-mix(in srgb, var(--c-primary) 8%, transparent),
		0 1.2rem 3.2rem rgb(68 100 154 / 14%);
	background:
		radial-gradient(circle at 84% 26%, color-mix(in srgb, var(--c-primary) 22%, transparent), transparent 31%),
		radial-gradient(circle at 70% 80%, color-mix(in srgb, var(--c-flow-blue) 14%, transparent), transparent 39%),
		linear-gradient(132deg, color-mix(in srgb, var(--c-surface-fill) 97%, white), color-mix(in srgb, var(--c-surface-fill) 84%, var(--c-flow-blue) 9%));
	color: var(--c-text);
}

:global(html.light) .about-hero h1 {
	text-shadow: 0 0.55rem 1.8rem rgb(81 116 170 / 11%);
	color: var(--c-text-1);
}

:global(html.dark) .about-hero {
	border-color: rgb(103 153 236 / 36%);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 8%),
		inset 0 0 4.5rem rgb(42 98 211 / 10%),
		0 1.4rem 3.8rem rgb(0 7 25 / 32%);
	background:
		radial-gradient(circle at 84% 27%, rgb(74 139 255 / 24%), transparent 31%),
		radial-gradient(circle at 69% 82%, rgb(34 93 205 / 20%), transparent 40%),
		linear-gradient(132deg, #050B18 0%, #0A1429 48%, #102B59 100%);
	color: #F7FAFF;
}

:global(html.dark) .about-hero::after {
	background:
		linear-gradient(90deg, rgb(5 11 24 / 98%) 0 34%, rgb(8 18 38 / 84%) 48%, transparent 70%),
		linear-gradient(to bottom, rgb(255 255 255 / 2%), transparent 32% 76%, rgb(0 5 18 / 24%));
}

:global(html.dark) .about-hero h1 {
	text-shadow: 0 0.7rem 2.2rem rgb(34 94 213 / 25%);
	color: #F8FAFF;
}

:global(html.dark) .about-hero h1 span {
	background: linear-gradient(to top, rgb(69 137 255 / 30%) 0 58%, transparent 58%);
}

:global(html.dark) .about-hero p {
	color: rgb(222 231 247 / 82%);
}

:global(html.dark) .about-hero .about-eyebrow {
	text-shadow: 0 0 1.2rem rgb(76 145 255 / 42%);
	color: #70A9FF;
}

:global(html.dark) .about-hero :deep(.scene-profile-avatar) {
	border-color: rgb(145 190 255 / 58%);
	background: rgb(13 35 75 / 58%);
}

:global(html.dark) .about-hero :deep(.scene-profile-avatar img) {
	background: radial-gradient(circle at 34% 24%, rgb(255 255 255 / 18%), rgb(29 73 155 / 42%));
}

:global(html.dark) .about-hero :deep(.scene-character) {
	filter: none;
}

:global(html.dark) .about-hero :deep(.scene-planet) {
	border-color: rgb(107 171 255 / 48%);
	box-shadow:
		inset 0 1.1rem 2.8rem rgb(255 255 255 / 18%),
		inset 1.8rem -3rem 5rem rgb(3 19 78 / 48%),
		0 -0.2rem 1.4rem rgb(91 164 255 / 36%),
		0 0 4rem rgb(38 105 235 / 28%);
	background:
		radial-gradient(circle at 32% 12%, rgb(255 255 255 / 28%), transparent 19%),
		radial-gradient(circle at 43% 34%, #318AE8 0, #1C69CE 42%, #0F46A5 73%, #071F61 100%);
}

:global(html.dark) .about-hero :deep(.scene-planet-texture) {
	filter: saturate(0.96) brightness(0.92);
}

:global(html.dynamic) .about-hero {
	border-color: color-mix(in srgb, var(--c-primary) 52%, var(--c-border));
	background:
		radial-gradient(circle at 82% 28%, color-mix(in srgb, var(--c-primary) 32%, transparent), transparent 31%),
		radial-gradient(circle at 64% 68%, color-mix(in srgb, var(--c-flow-blue) 21%, transparent), transparent 38%),
		linear-gradient(132deg, color-mix(in srgb, var(--c-surface-fill) 97%, white), color-mix(in srgb, var(--c-surface-fill) 74%, var(--c-flow-blue) 14%));
}

.about-hero.is-pointer-active {
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 88%),
		inset 0 0 4.8rem color-mix(in srgb, var(--c-primary) 12%, transparent),
		0 1.55rem 4rem rgb(61 95 158 / 20%);
}

.about-hero.is-pointer-active :deep(.scene-profile-avatar) {
	filter: brightness(1.08) saturate(1.12);
}

.about-hero.is-pointer-active :deep(.scene-avatar-tether) {
	opacity: 1;
}

.about-hero.is-pointer-active :deep(.scene-character) {
	filter: none;
}

.about-hero.is-pressed :deep(.scene-ripple) {
	animation: shinchan-click-ripple 0.72s cubic-bezier(0.16, 1, 0.3, 1);
}

.about-hero.is-dynamic-mode {
	border-color: color-mix(in srgb, var(--c-primary) 48%, var(--c-border));
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 88%),
		inset 0 0 5rem color-mix(in srgb, var(--c-primary) 12%, transparent),
		0 1.8rem 5.5rem rgb(79 111 166 / 18%);
	background:
		radial-gradient(circle at 82% 28%, color-mix(in srgb, var(--c-primary) 30%, transparent), transparent 31%),
		radial-gradient(circle at 64% 68%, color-mix(in srgb, var(--c-flow-blue) 19%, transparent), transparent 38%),
		linear-gradient(132deg, color-mix(in srgb, var(--c-surface-fill) 96%, white), color-mix(in srgb, var(--c-surface-fill) 76%, var(--c-flow-blue) 12%));
}

.about-hero.is-dynamic-mode :deep(.scene-atmosphere) {
	opacity: 1;
	filter: saturate(1.26) brightness(1.08);
}

.about-hero :deep(.scene-orbit) {
	border-color: color-mix(in srgb, var(--c-primary) 38%, transparent);
}

.about-hero :deep(.scene-track) {
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--c-primary) 68%, white), transparent);
}

.about-hero :deep(.scene-profile-avatar) {
	border-color: color-mix(in srgb, var(--c-primary) 48%, white);
	background: rgb(255 255 255 / 52%);
}

.about-hero :deep(.scene-profile-avatar img) {
	background: radial-gradient(circle at 34% 24%, rgb(255 255 255 / 92%), color-mix(in srgb, var(--c-primary) 14%, white));
}

.about-hero :deep(.scene-character) {
	filter: none;
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

@media (max-width: 900px) {
	.about-hero {
		align-items: flex-start;
		min-height: 29rem;
		padding: 1.8rem 1.75rem 13.5rem;
	}

	.about-hero::after {
		background:
			linear-gradient(to bottom, color-mix(in srgb, var(--c-surface-fill) 96%, white) 0 39%, color-mix(in srgb, var(--c-surface-fill) 70%, transparent) 52%, transparent 72%),
			linear-gradient(90deg, color-mix(in srgb, var(--c-surface-fill) 60%, transparent), transparent 72%);
	}

	.about-hero-copy {
		width: min(100%, 30rem);
	}

	.about-hero h1 {
		font-size: clamp(3.25rem, 10vw, 5rem);
	}
}

@media (max-width: 600px) {
	.about-page {
		gap: 0.55rem;
		width: min(calc(100% - 1rem), 72rem);
		margin: 0.45rem auto 1rem;
	}

	.about-hero {
		align-items: flex-start;
		overflow: hidden;
		min-height: 13.5rem;
		padding: 0.9rem 0.85rem 4.7rem;
		border-radius: 0.95rem;
	}

	.about-hero::after {
		background:
			linear-gradient(105deg, color-mix(in srgb, var(--c-surface-fill) 98%, white) 0 43%, color-mix(in srgb, var(--c-surface-fill) 84%, transparent) 57%, transparent 78%),
			linear-gradient(to bottom, color-mix(in srgb, var(--c-surface-fill) 72%, transparent), transparent 76%);
	}

	.about-hero-copy {
		width: min(70%, 15.5rem);
	}

	.about-hero .about-eyebrow {
		font-size: 0.58rem;
		letter-spacing: 0.13em;
	}

	.about-hero h1 {
		margin: 0.2rem 0 0.3rem;
		font-size: clamp(2.25rem, 11.8vw, 2.85rem);
		line-height: 0.94;
	}

	.about-hero p {
		max-width: 14.5rem;
		font-size: 0.76rem;
		line-height: 1.4;
	}

	.about-hero :deep(.scene-character) {
		right: -0.05rem;
		bottom: -3%;
		width: 4.4rem;
	}

	.about-section {
		padding: 1rem;
		border-radius: 0.95rem;
	}

	.about-section-heading h2 {
		margin-top: 0.16rem;
		font-size: 1.35rem;
	}

	.about-timeline,
	.about-links {
		margin-top: 0.9rem;
	}

	.about-timeline li {
		grid-template-columns: 1fr;
		gap: 0.4rem;
		padding: 0 0 1.15rem 0.85rem;
	}

	.about-timeline time {
		justify-self: start;
		padding: 0.18rem 0.45rem;
		border-radius: 999px;
		background: var(--c-primary-soft);
		font-size: 0.68rem;
	}

	.about-links {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	.about-links a {
		justify-content: center;
		min-height: var(--touch-target);
		padding: 0.55rem 0.7rem;
		text-align: center;
	}
}

@media (max-width: 380px) {
	.about-hero {
		min-height: 13.5rem;
		padding-bottom: 4.65rem;
	}

	.about-hero-copy {
		width: min(72%, 13.5rem);
	}

	.about-hero h1 {
		font-size: clamp(2.1rem, 11.5vw, 2.55rem);
	}

	.about-hero p {
		max-width: 12.5rem;
		font-size: 0.72rem;
	}

	.about-links {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	.about-hero,
	.about-hero-spotlight,
	.about-links a {
		transition: none;
	}

	.about-hero {
		--surface-tilt-x: 0deg;
		--surface-tilt-y: 0deg;
	}
}
</style>
