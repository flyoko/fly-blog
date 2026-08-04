<script setup lang="ts">
withDefaults(defineProps<{
	tag?: string
}>(), {
	tag: 'div',
})
const appConfig = useAppConfig()
</script>

<template>
<UtilLink class="blog-header">
	<div v-if="appConfig.header.emojiTail" class="emoji-tail">
		<span
			v-for="(emoji, emojiIndex) in appConfig.header.emojiTail"
			:key="emojiIndex"
			class="split-char"
			:style="getFixedDelay(emojiIndex * .6 - 3)"
			v-text="emoji"
		/>
	</div>

	<NuxtImg
		:src="appConfig.header.logo"
		class="blog-logo round-cobblestone"
		:class="{ circle: appConfig.header.showTitle }"
		:alt="appConfig.title"
	/>

	<div v-if="appConfig.header.showTitle" class="blog-text">
		<component :is="tag" class="header-title">
			<span
				v-for="(char, charIndex) in appConfig.title"
				:key="charIndex"
				class="split-char"
				:style="getFixedDelay((charIndex + 1) * .1)"
				v-text="char"
			/>
		</component>

		<div class="header-subtitle">
			{{ appConfig.header.subtitle }}
		</div>
	</div>

	<BlogShinchanScene variant="header" />
</UtilLink>
</template>

<style lang="scss" scoped>
.blog-header {
	contain: layout;
	display: flex;
	align-items: center;
	gap: 0.5em;
	position: relative;
	margin: clamp(1rem, 2rem, 5vh) 1rem min(1rem, 5vh);
	line-height: 1.4;
	color: var(--c-text);
	user-select: none;
}

.blog-logo,
.blog-text {
	position: relative;
	z-index: 1;
}

.blog-header {
	overflow: hidden;
	min-height: 5.4rem;
	padding: 0.8rem 5.2rem 0.8rem 0.85rem;
	border: 1px solid var(--c-surface-border);
	border-radius: 1.2rem;
	box-shadow:
		0 18px 46px var(--c-surface-shadow),
		inset 0 1px 0 var(--c-surface-highlight);
	background:
		radial-gradient(circle at 10% 35%, var(--c-atmosphere-lens-blue), transparent 38%),
		linear-gradient(112deg, var(--c-surface-fill), color-mix(in srgb, var(--c-surface-fill) 72%, var(--c-flow-blue) 8%));
	backdrop-filter: blur(18px) saturate(120%);
}

.blog-header::before {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(108deg, transparent 20%, var(--c-surface-sheen) 46%, transparent 66%);
	background-size: 220% 100%;
	animation: header-scene-scan 4.8s ease-in-out infinite;
	pointer-events: none;
}

.blog-header::after {
	content: "";
	position: absolute;
	top: 58%;
	left: -12%;
	width: 72%;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--c-flow-cyan), transparent);
	transform: rotate(-8deg);
	animation: header-scene-line 3.6s ease-in-out infinite alternate;
	pointer-events: none;
}

:global(.light .blog-header) {
	--header-scene-opacity: 0.68;
}

:global(.dark .blog-header) {
	--header-scene-opacity: 0.82;
}

:global(.dynamic .blog-header) {
	--header-scene-opacity: 1;

	backdrop-filter: blur(18px) saturate(120%);
}

.blog-header::before,
.blog-header::after {
	opacity: var(--header-scene-opacity, 0.72);
}

@keyframes header-scene-scan {
	0%, 100% {
		opacity: 0.22;
		background-position: 160% 0;
	}

	50% {
		opacity: 0.76;
		background-position: -70% 0;
	}
}

@keyframes header-scene-line {
	from {
		opacity: 0.25;
		transform: translateX(-8%) rotate(-8deg);
	}

	to {
		opacity: 0.88;
		transform: translateX(18%) rotate(-5deg);
	}
}

.blog-logo {
	height: 3em;

	&.circle {
		width: 3em;
		border-radius: 50%;
		box-shadow:
			0 10px 24px var(--c-surface-shadow),
			inset 0 0 0 1px var(--c-surface-line),
			inset 0 1px 0 var(--c-surface-highlight);
	}
}

@font-face {
	font-family: AlimamaFangYuanTi;
	src: url("/fonts/AlimamaFangYuanTi.woff2");
}

.header-title {
	font-family: AlimamaFangYuanTi, "Noto Sans SC", sans-serif;
	font-size: 1.5em;
	font-synthesis: none;
	font-variation-settings: "wght" 600, "BEVL" 100;

	> .split-char {
		animation: 3.14s infinite alternate vf-weight, 2.72s infinite alternate vf-bevel;
		animation-delay: var(--delay);
		animation-play-state: paused;
	}
}

.header-subtitle {
	font-size: 0.8em;
	color: var(--c-text-2);
}

@keyframes vf-weight {
	0% { font-weight: 600; }
	38.2% { font-weight: 300; }
	100% { font-weight: 900; }
}

@keyframes vf-bevel {
	from { font-variation-settings: "BEVL" 100; }
	to { font-variation-settings: "BEVL" 1; }
}

.emoji-tail {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
	align-content: center;
	justify-items: center;
	position: absolute;
	opacity: 0;
	inset: -0.25rem -0.75rem;
	font-size: 2.5rem;
	transition: opacity 0.3s;
	filter: grayscale(0.85) saturate(0.4) blur(1px);
	pointer-events: none;
	z-index: -2;

	> .split-char {
		animation: 5s infinite alternate emoji-floating;
		animation-delay: var(--delay);
		animation-play-state: paused;
	}
}

.blog-header:hover {
	.emoji-tail {
		opacity: 0.14;
	}

	.split-char {
		animation-play-state: running;
	}
}

@keyframes emoji-floating {
	50% {
		transform: translate(-12px, -4px) scale(1.2);
		filter: blur(4px);
	}

	100% {
		transform: translate(-4px, -12px) scale(0.9);
		filter: blur(1px);
	}
}

@media (prefers-reduced-motion: reduce) {
	:global(.dynamic .blog-header::before),
	.blog-header::after {
		animation: none;
	}
}
</style>
