<script setup lang="ts">
const appConfig = useAppConfig()

useSeoMeta({
	title: '留言板',
	description: `在 ${appConfig.title} 留下想法、建议或问候。无需注册，邮箱不会公开。`,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" />
</div>

<main class="comments-page">
	<header class="comments-intro card">
		<span class="comments-eyebrow">GUESTBOOK</span>
		<h1 class="text-creative">
			留言板
		</h1>
		<p>
			欢迎留下想法、建议，或者只是来打个招呼。无需注册账号，邮箱不会公开展示。
		</p>
	</header>

	<PostComment path="/comments" />
</main>
</template>

<style lang="scss" scoped>
.comments-page {
	margin: 1rem;
}

.comments-intro {
	position: relative;
	overflow: hidden;
	padding: 1.35rem;
	border-color: var(--c-surface-line);
	background:
		radial-gradient(circle at 88% 18%, var(--c-primary-soft), transparent 28%),
		linear-gradient(145deg, var(--c-surface-highlight), transparent 45%),
		var(--c-surface-fill);

	&::after {
		content: "";
		position: absolute;
		opacity: 0.38;
		inset: auto -2rem -3rem auto;
		width: 8rem;
		height: 8rem;
		border: 1px solid var(--c-surface-border);
		border-radius: 50%;
		pointer-events: none;
	}

	h1 {
		margin: 0.25rem 0 0.45rem;
		font-size: clamp(1.65rem, 4vw, 2.35rem);
	}

	p {
		max-width: 40rem;
		margin: 0;
		line-height: 1.75;
		color: var(--c-text-2);
	}
}

.comments-eyebrow {
	font-family: var(--font-monospace);
	font-size: 0.72rem;
	font-weight: 650;
	letter-spacing: 0.16em;
	color: var(--c-primary);
}

:deep(.z-comment) {
	margin: 1.25rem 0 2rem;
}

@media (max-width: 640px) {
	.comments-page {
		margin: 0.75rem 0.35rem 1.5rem;
	}

	.comments-intro {
		padding: 1rem;
		border-radius: 0.9rem;
	}

	:deep(.z-comment) {
		margin: 0.9rem 0 1.5rem;
	}
}
</style>
