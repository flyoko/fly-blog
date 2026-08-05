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
			<a class="about-hero-cta" href="#about-story">
				<span>探索更多</span>
				<Icon name="tabler:arrow-right" aria-hidden="true" />
			</a>
			<div class="about-hero-features" aria-label="我的关键词">
				<div class="about-hero-feature">
					<span class="about-hero-feature-icon">
						<Icon name="tabler:code" aria-hidden="true" />
					</span>
					<span>
						<strong>写代码</strong>
						<small>Code</small>
					</span>
				</div>
				<div class="about-hero-feature">
					<span class="about-hero-feature-icon">
						<Icon name="tabler:book-2" aria-hidden="true" />
					</span>
					<span>
						<strong>持续学习</strong>
						<small>Learn</small>
					</span>
				</div>
				<div class="about-hero-feature">
					<span class="about-hero-feature-icon">
						<Icon name="tabler:heart" aria-hidden="true" />
					</span>
					<span>
						<strong>认真生活</strong>
						<small>Life</small>
					</span>
				</div>
			</div>
		</div>
		<BlogShinchanScene
			variant="about"
			:character-src="profileAvatar || undefined"
			:portrait-src="profilePortrait || undefined"
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
	width: min(calc(100% - 2rem), 78rem);
	margin: 1rem auto;
}

.about-hero {
	display: flex;
	align-items: center;
	position: relative;
	overflow: hidden;
	min-height: clamp(23.5rem, 24vw, 27rem);
	padding: clamp(2rem, 3.6vw, 3rem);
	padding-inline-end: clamp(20rem, 44%, 34rem);
	border: 1px solid rgb(117 158 231 / 34%);
	border-radius: clamp(0.9rem, 1.4vw, 1.35rem);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 8%),
		inset 0 0 4rem rgb(35 91 202 / 7%),
		0 1.2rem 3.4rem rgb(1 8 27 / 24%);
	background:
		radial-gradient(circle at 83% 28%, rgb(71 137 255 / 19%), transparent 23%),
		radial-gradient(circle at 68% 66%, rgb(25 72 178 / 16%), transparent 33%),
		radial-gradient(circle at 8% 7%, rgb(29 76 181 / 14%), transparent 29%),
		linear-gradient(126deg, #020817 0%, #061126 48%, #0A1D43 75%, #0C285E 100%);
	color: #F7FAFF;
	isolation: isolate;
}

.about-hero::before {
	content: "";
	position: absolute;
	opacity: 0.72;
	inset: 0;
	background-image:
		radial-gradient(circle at 7% 19%, rgb(255 255 255 / 74%) 0 1px, transparent 1.5px),
		radial-gradient(circle at 18% 67%, rgb(103 164 255 / 70%) 0 1px, transparent 1.6px),
		radial-gradient(circle at 28% 11%, rgb(255 255 255 / 55%) 0 1px, transparent 1.4px),
		radial-gradient(circle at 39% 47%, rgb(99 154 255 / 54%) 0 1.2px, transparent 1.8px),
		radial-gradient(circle at 47% 24%, rgb(255 255 255 / 68%) 0 1px, transparent 1.5px),
		radial-gradient(circle at 57% 72%, rgb(88 148 255 / 68%) 0 1.2px, transparent 1.8px),
		radial-gradient(circle at 68% 12%, rgb(255 255 255 / 62%) 0 1px, transparent 1.5px),
		radial-gradient(circle at 77% 54%, rgb(101 165 255 / 58%) 0 1.3px, transparent 1.9px),
		radial-gradient(circle at 88% 18%, rgb(255 255 255 / 76%) 0 1px, transparent 1.5px),
		radial-gradient(circle at 94% 73%, rgb(86 154 255 / 60%) 0 1.2px, transparent 1.8px);
	background-size:
		17rem 13rem,
		23rem 18rem,
		19rem 16rem,
		29rem 21rem,
		31rem 24rem,
		27rem 19rem,
		21rem 17rem,
		33rem 25rem,
		25rem 20rem,
		28rem 23rem;
	pointer-events: none;
	z-index: 0;
}

.about-hero::after {
	content: "";
	position: absolute;
	inset: 0;
	background:
		linear-gradient(90deg, rgb(2 8 23 / 98%) 0 35%, rgb(3 11 28 / 88%) 45%, rgb(5 17 43 / 28%) 62%, transparent 76%),
		linear-gradient(to bottom, rgb(255 255 255 / 2%), transparent 28% 75%, rgb(1 7 23 / 24%));
	pointer-events: none;
	z-index: 1;
}

.about-hero-copy {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	position: relative;
	width: min(100%, 32rem);
	z-index: 3;
}

.about-hero h1 {
	margin: 0.45rem 0 0.65rem;
	font-family: var(--font-creative);
	font-size: clamp(3.35rem, 5.4vw, 5.8rem);
	font-weight: 760;
	letter-spacing: -0.05em;
	line-height: 0.94;
	text-shadow:
		0 1px 0 rgb(255 255 255 / 30%),
		0 0.55rem 1.9rem rgb(35 100 235 / 24%);
	color: #F8FAFF;
}

.about-hero p {
	max-width: 31rem;
	margin: 0;
	font-size: clamp(0.92rem, 1.05vw, 1.08rem);
	line-height: 1.65;
	color: rgb(220 229 248 / 82%);
}

.about-hero .about-eyebrow {
	font-size: clamp(0.68rem, 0.72vw, 0.8rem);
	font-weight: 700;
	letter-spacing: 0.18em;
	text-shadow: 0 0 1.2rem rgb(66 139 255 / 42%);
	color: #65A1FF;
}

.about-hero-cta {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 1rem;
	min-width: 10rem;
	margin-top: clamp(1.3rem, 2vw, 1.8rem);
	padding: 0.72rem 1.2rem;
	border: 1px solid rgb(119 168 255 / 42%);
	border-radius: 999px;
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 8%),
		0 0.6rem 1.5rem rgb(5 40 112 / 15%);
	background: linear-gradient(135deg, rgb(15 35 77 / 62%), rgb(7 20 49 / 38%));
	backdrop-filter: blur(10px);
	font-size: 0.92rem;
	font-weight: 650;
	color: #F5F8FF;
	transition:
		border-color 0.24s ease,
		box-shadow 0.24s ease,
		transform 0.24s ease;
}

.about-hero-cta:hover,
.about-hero-cta:focus-visible {
	border-color: rgb(142 187 255 / 78%);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 14%),
		0 0 2rem rgb(48 118 255 / 28%),
		0 1rem 2.4rem rgb(1 13 44 / 28%);
	transform: translateY(-2px);
}

.about-hero-cta svg {
	font-size: 1.15rem;
	transition: transform 0.24s ease;
}

.about-hero-cta:hover svg,
.about-hero-cta:focus-visible svg {
	transform: translateX(0.25rem);
}

.about-hero-features {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	width: min(100%, 30rem);
	margin-top: clamp(1.8rem, 2.8vw, 2.6rem);
}

.about-hero-feature {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	min-width: 0;
	padding-inline: 0.8rem;
	border-inline-end: 1px solid rgb(121 158 225 / 20%);
}

.about-hero-feature:first-child {
	padding-inline-start: 0;
}

.about-hero-feature:last-child {
	padding-inline-end: 0;
	border-inline-end: 0;
}

.about-hero-feature-icon {
	display: grid;
	flex: 0 0 auto;
	place-items: center;
	width: 2.35rem;
	aspect-ratio: 1;
	border: 1px solid rgb(105 160 255 / 26%);
	border-radius: 50%;
	box-shadow: inset 0 0 0.85rem rgb(47 110 240 / 7%);
	background: rgb(10 27 61 / 62%);
	font-size: 1.12rem;
	color: #69A8FF;
}

.about-hero-feature > span:last-child {
	display: grid;
	gap: 0.1rem;
	min-width: 0;
}

.about-hero-feature strong {
	font-size: 0.84rem;
	font-weight: 650;
	white-space: nowrap;
	color: rgb(244 248 255 / 90%);
}

.about-hero-feature small {
	font-size: 0.66rem;
	color: rgb(184 201 231 / 60%);
}

.about-hero.is-pointer-active :deep(.scene-profile-avatar) {
	filter: brightness(1.08) saturate(1.12);
}

.about-hero.is-pointer-active :deep(.scene-avatar-tether) {
	opacity: 1;
}

.about-hero.is-pointer-active :deep(.scene-character) {
	filter: drop-shadow(0 20px 32px rgb(20 75 181 / 38%));
}

.about-hero.is-pressed :deep(.scene-ripple) {
	animation: shinchan-click-ripple 0.72s cubic-bezier(0.16, 1, 0.3, 1);
}

.about-hero.is-dynamic-mode {
	border-color: rgb(122 171 255 / 48%);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 12%),
		inset 0 0 5rem rgb(41 103 232 / 12%),
		0 1.8rem 5.5rem rgb(0 7 26 / 42%);
	background:
		radial-gradient(circle at 82% 28%, rgb(69 139 255 / 28%), transparent 25%),
		radial-gradient(circle at 64% 64%, rgb(27 78 194 / 22%), transparent 36%),
		linear-gradient(126deg, #010614 0%, #041026 48%, #08204C 77%, #0B2C69 100%);
}

.about-hero.is-dynamic-mode :deep(.scene-atmosphere) {
	opacity: 1;
	filter: saturate(1.26) brightness(1.08);
}

.about-hero :deep(.scene-orbit) {
	border-color: rgb(89 154 255 / 45%);
}

.about-hero :deep(.scene-track) {
	background: linear-gradient(90deg, transparent, rgb(106 180 255 / 88%), transparent);
}

.about-hero :deep(.scene-profile-avatar) {
	border-color: rgb(155 197 255 / 68%);
	background: rgb(10 29 68 / 44%);
}

.about-hero :deep(.scene-profile-avatar img) {
	background: radial-gradient(circle at 34% 24%, rgb(255 255 255 / 22%), rgb(29 73 155 / 38%));
}

.about-hero :deep(.scene-character) {
	filter: drop-shadow(0 18px 32px rgb(0 0 0 / 38%));
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
		min-height: 35rem;
		padding: 2.1rem 2rem 15.5rem;
	}

	.about-hero::after {
		background:
			linear-gradient(to bottom, rgb(2 8 23 / 98%) 0 38%, rgb(3 11 28 / 78%) 51%, transparent 70%),
			linear-gradient(90deg, rgb(2 8 23 / 48%), transparent 68%);
	}

	.about-hero-copy {
		width: min(100%, 33rem);
	}

	.about-hero h1 {
		font-size: clamp(3.6rem, 11vw, 5.4rem);
	}

	.about-hero-features {
		margin-top: 2rem;
	}
}

@media (max-width: 600px) {
	.about-page {
		width: min(calc(100% - 1.5rem), 78rem);
		margin: 0.75rem auto;
	}

	.about-hero {
		align-items: flex-start;
		min-height: 36.5rem;
		padding: 1.5rem 1.25rem 14.5rem;
		border-radius: 1rem;
	}

	.about-hero h1 {
		margin-top: 0.55rem;
		font-size: clamp(3rem, 16vw, 4.35rem);
	}

	.about-hero p {
		font-size: 0.9rem;
		line-height: 1.6;
	}

	.about-hero-cta {
		min-width: 9.25rem;
		margin-top: 1.25rem;
		padding: 0.68rem 1.05rem;
	}

	.about-hero-features {
		gap: 0.1rem;
		width: 100%;
		margin-top: 1.65rem;
	}

	.about-hero-feature {
		flex-direction: column;
		align-items: flex-start;
		gap: 0.45rem;
		padding-inline: 0.55rem;
	}

	.about-hero-feature:first-child {
		padding-inline-start: 0;
	}

	.about-hero-feature-icon {
		width: 2.35rem;
		font-size: 1.12rem;
	}

	.about-hero-feature strong {
		font-size: 0.8rem;
	}

	.about-hero-feature small {
		font-size: 0.66rem;
	}

	.about-timeline li {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	.about-hero-cta,
	.about-hero-cta svg,
	.about-links a {
		transition: none;
	}
}
</style>
