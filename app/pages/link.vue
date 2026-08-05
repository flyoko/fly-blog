<script setup lang="ts">
const appConfig = useAppConfig()

const { data: postLink } = await useAsyncData(
	'content:/link',
	() => queryCollection('content').path('/link').first(),
)

useSeoMeta({
	title: '友链',
	description: `${appConfig.title} 的友链页面，当前暂未开放友链。`,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" />
</div>

<section class="link-page">
	<header class="link-hero card">
		<div>
			<span>LINKS · CONNECTIONS</span>
			<h1>友链</h1>
			<p>认真认识彼此，再让链接成为长期往来的入口。</p>
		</div>
		<a v-if="appConfig.profile.showGitHub" :href="appConfig.author.homepage" target="_blank" rel="noopener noreferrer">
			<Icon name="tabler:brand-github" aria-hidden="true" />
			从 GitHub 找到我
			<Icon name="tabler:arrow-up-right" aria-hidden="true" />
		</a>
	</header>

	<section class="link-content card">
		<ContentRenderer
			v-if="postLink"
			:value="postLink"
			class="article"
		/>
		<p v-else class="text-center">
			友链暂未开放。
		</p>
	</section>
</section>
</template>

<style lang="scss" scoped>
.link-page {
	display: grid;
	gap: 1rem;
	margin: 1rem;
}

.link-hero {
	display: flex;
	align-items: flex-end;
	justify-content: space-between;
	gap: 2rem;
	position: relative;
	overflow: hidden;
	min-height: 15rem;
	padding: clamp(1.5rem, 5vw, 3.5rem);
	background:
		radial-gradient(circle at 88% 22%, var(--c-primary-soft), transparent 34%),
		linear-gradient(135deg, var(--c-surface-fill), color-mix(in srgb, var(--c-surface-fill) 80%, var(--c-flow-violet) 8%));

	span {
		font: 0.7rem var(--font-monospace);
		letter-spacing: 0.16em;
		color: var(--c-primary);
	}

	h1 {
		margin-top: 0.35rem;
		font: clamp(3rem, 9vw, 5.5rem) / 1 var(--font-creative);
	}

	p {
		max-width: 28rem;
		margin-top: 0.7rem;
		line-height: 1.7;
		color: var(--c-text-2);
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: var(--touch-target);
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--c-border);
		border-radius: 999px;
		background: color-mix(in srgb, var(--c-bg-2) 78%, transparent);
		font-size: 0.78rem;
		font-weight: 700;
		white-space: nowrap;
		color: var(--c-text-1);
		transition: border-color var(--motion-fast), transform var(--motion-fast);

		&:hover,
		&:focus-visible {
			border-color: var(--c-primary);
			transform: translateY(-2px);
		}
	}
}

.link-content {
	padding: clamp(1.25rem, 4vw, 2.25rem);
}

@media (max-width: $breakpoint-phone) {
	.link-page {
		gap: 0.75rem;
		margin: 0.75rem;
	}

	.link-hero {
		flex-direction: column;
		align-items: flex-start;
		min-height: 14rem;
		padding: 1.35rem 1.25rem;

		h1 {
			font-size: clamp(3.3rem, 18vw, 4.6rem);
		}

		p {
			font-size: 0.9rem;
		}
	}
}

@media (prefers-reduced-motion: reduce) {
	.link-hero a {
		transition: none;
	}
}
</style>
