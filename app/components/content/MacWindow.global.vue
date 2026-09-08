<template>
<div class="article-window">
	<div class="article-window-bar" aria-hidden="true">
		<span class="article-window-dot article-window-dot-close" />
		<span class="article-window-dot article-window-dot-minimize" />
		<span class="article-window-dot article-window-dot-expand" />
	</div>
	<div class="article-window-body">
		<slot />
	</div>
</div>
</template>

<style lang="scss" scoped>
.article-window {
	overflow: hidden;
	margin: 1.5rem 0;
	border: 1px solid var(--glass-clear-border);
	border-radius: 1rem;
	box-shadow:
		0 0.85rem 2.6rem color-mix(in srgb, var(--c-surface-shadow) 72%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--glass-clear-border) 36%, transparent),
		inset 0 1px 0 var(--glass-clear-highlight);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--glass-clear-highlight) 76%, transparent), transparent 38%),
		radial-gradient(130% 120% at 8% -22%, var(--glass-clear-tint), transparent 58%),
		var(--glass-clear-fill);
	backdrop-filter: var(--glass-clear-filter);
}

.article-window-body {
	padding: clamp(1rem, 2.4vw, 1.45rem);

	:deep(strong),
	:deep(b) {
		background: none;
		font-weight: 800;
		color: var(--c-primary);
		-webkit-text-fill-color: currentcolor;
	}

	:deep(em),
	:deep(i) {
		font-style: italic;
		color: color-mix(in srgb, var(--c-text-1) 84%, var(--c-primary));
	}

	:deep(del),
	:deep(s) {
		text-decoration-color: var(--c-primary);
		text-decoration-thickness: 0.12em;
	}

	:deep(> :first-child) {
		margin-top: 0;
	}

	:deep(> :last-child) {
		margin-bottom: 0;
	}
}

.article-window-bar {
	display: flex;
	align-items: center;
	gap: 0.48rem;
	min-height: 2.35rem;
	padding: 0 0.9rem;
	border-bottom: 1px solid color-mix(in srgb, var(--glass-clear-border) 78%, transparent);
	background:
		linear-gradient(180deg, color-mix(in srgb, var(--glass-clear-highlight) 48%, transparent), transparent),
		color-mix(in srgb, var(--glass-clear-fill) 62%, transparent);
}

.article-window-dot {
	width: 0.72rem;
	height: 0.72rem;
	border-radius: 50%;
	box-shadow:
		inset 0 1px 0 color-mix(in srgb, white 52%, transparent),
		0 0 0 1px color-mix(in srgb, black 14%, transparent);
}

.article-window-dot-close {
	background: #FF5F57;
}

.article-window-dot-minimize {
	background: #FEBC2E;
}

.article-window-dot-expand {
	background: #28C840;
}

:global(.admin-app .article-window) {
	border-color: var(--admin-glass-border);
	box-shadow: var(--admin-glass-shadow), var(--admin-glass-inset);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--admin-glass-highlight) 82%, transparent), transparent 42%),
		radial-gradient(125% 130% at 8% -20%, var(--admin-glass-tint), transparent 58%),
		var(--admin-glass-clear-fill);
	backdrop-filter: var(--admin-glass-clear-filter);
	color: var(--admin-text);
}

:global(.admin-app .article-window-bar) {
	border-bottom-color: var(--admin-glass-border);
	background:
		linear-gradient(180deg, color-mix(in srgb, var(--admin-glass-highlight) 58%, transparent), transparent),
		color-mix(in srgb, var(--admin-surface) 42%, transparent);
}

:global(.admin-app .article-window-body :where(strong, b)) {
	color: var(--admin-accent);
}

// 公开动态背景为了避免 macOS 合成层抖动会全局禁用文章窗口 blur；后台预览
// 不运行那套持续氛围动画，因此可安全恢复局部玻璃取样。
:global(.dynamic #blog-root .admin-app .article-window) {
	backdrop-filter: var(--admin-glass-clear-filter);
}

@media (max-width: $breakpoint-mobile) {
	.article-window {
		margin: var(--mobile-page-gap) 0;
		border-radius: var(--mobile-surface-radius-inner);
	}

	.article-window-body {
		padding: 0.9rem 0.85rem 1.1rem;
	}

	.article-window-bar {
		gap: 0.4rem;
		min-height: 2.05rem;
		padding-inline: 0.75rem;
	}

	.article-window-dot {
		width: 0.62rem;
		height: 0.62rem;
	}
}

@media (prefers-reduced-transparency: reduce) {
	.article-window {
		background: var(--c-bg-1);
		backdrop-filter: none;
	}

	:global(.admin-app .article-window) {
		background: var(--admin-surface);
	}
}

@supports not (backdrop-filter: blur(1px)) {
	.article-window {
		background: color-mix(in srgb, var(--c-bg-1) 96%, var(--c-flow-blue) 4%);
	}

	:global(.admin-app .article-window) {
		background: color-mix(in srgb, var(--admin-surface) 96%, var(--admin-accent-soft) 4%);
	}
}
</style>
