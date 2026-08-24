<script setup lang="ts">
const appConfig = useAppConfig()

useSeoMeta({
	title: '留言板',
	description: `在 ${appConfig.title} 留下想法、建议或问候。无需注册，邮箱不会公开。`,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader class="mobile-page-header" to="/" />
</div>

<main class="comments-page comments-mobile-shell">
	<header class="comments-intro card">
		<span class="comments-eyebrow">GUESTBOOK</span>
		<h1 class="text-creative">
			留言板
		</h1>
		<p>
			欢迎留下想法、建议，或者只是来打个招呼。无需注册账号，邮箱不会公开展示。
		</p>
		<div class="comments-intro-meta" aria-label="留言说明">
			<span>无需登录</span>
			<span>邮箱不公开</span>
			<span>随时来聊</span>
		</div>
	</header>

	<PostComment path="/comments" />
</main>
</template>

<style lang="scss" scoped>
.comments-page {
	width: min(calc(100% - 2rem), 64rem);
	margin: 1rem auto 2rem;
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

.comments-intro-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 0.45rem;
	margin-top: 1rem;

	> span {
		padding: 0.34rem 0.58rem;
		border: 1px solid color-mix(in srgb, var(--c-primary) 22%, var(--c-surface-line));
		border-radius: 999px;
		background: color-mix(in srgb, var(--c-primary-soft) 62%, var(--c-surface-fill));
		font-size: 0.72rem;
		font-weight: 650;
		color: var(--c-text-2);
	}
}

:global(.dynamic) .comments-intro {
	box-shadow:
		inset 0 1px 0 var(--c-surface-highlight),
		0 0.9rem 2.6rem color-mix(in srgb, var(--c-primary) 9%, transparent);
	background:
		radial-gradient(circle at 88% 16%, color-mix(in srgb, var(--c-flow-blue) 22%, transparent), transparent 31%),
		linear-gradient(145deg, color-mix(in srgb, var(--c-surface-highlight) 82%, transparent), transparent 48%),
		var(--c-surface-fill);
}

:deep(.z-comment) {
	margin: 1rem 0 2rem;
}

@media (max-width: 640px) {
	.comments-page {
		width: auto;
		margin: var(--mobile-page-gap) var(--mobile-page-gutter) 1.25rem;
	}

	.comments-intro {
		padding: 0.95rem;
		border-radius: var(--mobile-surface-radius);

		h1 {
			font-size: 1.85rem;
		}

		p {
			font-size: 0.84rem;
			line-height: 1.62;
			text-wrap: pretty;
		}
	}

	.comments-intro-meta {
		flex-wrap: nowrap;
		overflow-x: auto;
		margin-top: 0.8rem;
		padding-bottom: 0.1rem;
		scrollbar-width: none;

		&::-webkit-scrollbar {
			display: none;
		}

		> span {
			flex: 0 0 auto;
		}
	}

	:deep(.z-comment) {
		margin: var(--mobile-page-gap) 0 1.25rem;
		padding: 0.9rem;
		border-radius: var(--mobile-surface-radius);
	}
}
</style>
