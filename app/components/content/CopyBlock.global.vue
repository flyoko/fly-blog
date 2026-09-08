<script setup lang="ts">
type CopyStatus = 'idle' | 'copied' | 'failed'

const body = useTemplateRef<HTMLElement>('body')
const copyStatus = ref<CopyStatus>('idle')
let resetTimer: ReturnType<typeof setTimeout> | undefined

const copyLabel = computed(() => copyStatus.value === 'copied'
	? '已复制'
	: copyStatus.value === 'failed'
		? '复制失败，请手动复制'
		: '复制内容')

function scheduleReset() {
	if (resetTimer)
		clearTimeout(resetTimer)
	resetTimer = setTimeout(() => {
		copyStatus.value = 'idle'
	}, 2_000)
}

function textWithBreaks(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE)
		return node.textContent || ''
	if (!(node instanceof HTMLElement))
		return ''
	if (node.matches('br'))
		return '\n'
	return [...node.childNodes].map(textWithBreaks).join('')
}

function copyBlockSegment(node: Node) {
	if (node.nodeType === Node.TEXT_NODE)
		return node.textContent?.trim() || ''
	if (!(node instanceof HTMLElement))
		return ''

	if (node.matches('ul, ol')) {
		return [...node.children]
			.map(item => textWithBreaks(item).trim())
			.filter(Boolean)
			.join('\n')
	}

	if (node.matches('table')) {
		return [...node.querySelectorAll('tr')]
			.map(row => [...row.querySelectorAll('th, td')]
				.map(cell => textWithBreaks(cell).trim())
				.join('\t'))
			.filter(Boolean)
			.join('\n')
	}

	return textWithBreaks(node).trim()
}

function copyBlockText(root: HTMLElement) {
	return [...root.childNodes]
		.map(copyBlockSegment)
		.filter(Boolean)
		.join('\n\n')
		.trim()
}

async function copyText() {
	const value = body.value ? copyBlockText(body.value) : ''
	if (!value) {
		copyStatus.value = 'failed'
		scheduleReset()
		return
	}

	try {
		if (!navigator.clipboard?.writeText)
			throw new Error('Clipboard API unavailable')
		await navigator.clipboard.writeText(value)
		copyStatus.value = 'copied'
	}
	catch {
		copyStatus.value = 'failed'
	}
	finally {
		scheduleReset()
	}
}

onBeforeUnmount(() => {
	if (resetTimer)
		clearTimeout(resetTimer)
})
</script>

<template>
<div class="article-copy-block">
	<button
		class="article-copy-block-button"
		type="button"
		:aria-label="copyLabel"
		:title="copyLabel"
		@click="copyText"
	>
		<Icon :name="copyStatus === 'copied' ? 'tabler:check' : 'tabler:copy'" />
	</button>

	<div ref="body" class="article-copy-block-body">
		<slot />
	</div>

	<span
		class="article-copy-block-status"
		:class="{ failed: copyStatus === 'failed' }"
		aria-live="polite"
	>
		{{ copyStatus === 'idle' ? '' : copyLabel }}
	</span>
</div>
</template>

<style lang="scss" scoped>
.article-copy-block {
	position: relative;
	overflow: hidden;
	margin: 1.15rem 0;
	padding: 1rem 3.55rem 1rem 1.05rem;
	border: 1px solid var(--glass-clear-border);
	border-radius: 1rem;
	box-shadow:
		0 0.65rem 1.9rem color-mix(in srgb, var(--c-surface-shadow) 74%, transparent),
		inset 0 0 0 1px color-mix(in srgb, var(--glass-clear-border) 42%, transparent),
		inset 0 1px 0 var(--c-surface-highlight);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--glass-clear-highlight) 78%, transparent), transparent 42%),
		radial-gradient(120% 130% at 8% -18%, var(--glass-clear-tint), transparent 56%),
		var(--glass-clear-fill);
	backdrop-filter: var(--glass-clear-filter);
	color: var(--c-text-1);
	isolation: isolate;
}

.article-copy-block-body {
	overflow-wrap: anywhere;
	min-width: 0;
	font-size: 0.94em;
	line-height: 1.58;

	:deep(p) {
		margin: 0;
	}

	:deep(p + p) {
		margin-top: 0.7em;
	}

	:deep(ul),
	:deep(ol) {
		margin: 0.45em 0;
		padding-left: 1.35em;
	}

	:deep(li) {
		margin: 0.12em 0;
	}

	:deep(strong) {
		background: none;
		font-weight: 700;
		color: inherit;
		-webkit-text-fill-color: currentcolor;
	}

	:deep(code) {
		border: 1px solid color-mix(in srgb, var(--c-surface-line) 72%, transparent);
		background: color-mix(in srgb, var(--c-bg-2) 72%, transparent);
		color: var(--c-text-1);
	}
}

.article-copy-block-button {
	display: grid;
	place-items: center;
	position: absolute;
	top: 0.55rem;
	right: 0.55rem;
	width: 2.75rem;
	height: 2.75rem;
	padding: 0;
	border: 1px solid color-mix(in srgb, var(--glass-clear-border) 62%, transparent);
	border-radius: 0.72rem;
	box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-surface-highlight) 72%, transparent);
	background: color-mix(in srgb, var(--c-bg-2) 36%, transparent);
	font: inherit;
	font-size: 1.1rem;
	color: var(--c-text-2);
	transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
	cursor: pointer;

	&:hover {
		border-color: color-mix(in srgb, var(--c-primary) 38%, var(--glass-clear-border));
		background: color-mix(in srgb, var(--c-bg-2) 62%, transparent);
		color: var(--c-text-1);
	}

	&:active {
		transform: scale(0.94);
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}
}

.article-copy-block-status {
	position: absolute;
	top: 1.28rem;
	right: 3.75rem;
	max-width: min(13rem, calc(100% - 5.5rem));
	font-size: 0.72rem;
	font-weight: 600;
	line-height: 1.2;
	white-space: nowrap;
	color: var(--c-success);
	pointer-events: none;

	&.failed {
		color: var(--c-error);
	}
}

// 后台编辑器有独立的浅/深主题变量，不能继承 html.dynamic 的博客深色 token，
// 否则浅色编辑器里的预览会再次变成一块深灰色。这里复用后台同一套玻璃材质。
:global(.admin-app .article-copy-block) {
	border-color: var(--admin-glass-border);
	box-shadow: var(--admin-glass-shadow), var(--admin-glass-inset);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--admin-glass-highlight) 82%, transparent), transparent 42%),
		radial-gradient(120% 130% at 8% -18%, var(--admin-glass-tint), transparent 56%),
		var(--admin-glass-clear-fill);
	backdrop-filter: var(--admin-glass-clear-filter);
	color: var(--admin-text);
}

:global(.admin-app .article-copy-block-body code) {
	border-color: var(--admin-glass-border);
	background: color-mix(in srgb, var(--admin-surface-soft) 76%, transparent);
	color: var(--admin-text);
}

:global(.admin-app .article-copy-block-button) {
	border-color: var(--admin-glass-border);
	box-shadow: inset 0 1px 0 color-mix(in srgb, var(--admin-glass-highlight) 72%, transparent);
	background: color-mix(in srgb, var(--admin-surface) 48%, transparent);
	color: var(--admin-muted);
}

:global(.admin-app .article-copy-block-button:hover) {
	border-color: var(--admin-glass-border-strong);
	background: color-mix(in srgb, var(--admin-surface) 76%, transparent);
	color: var(--admin-text);
}

:global(.admin-app .article-copy-block-button:focus-visible) {
	outline-color: var(--admin-accent);
}

:global(.admin-app .article-copy-block-status) {
	color: var(--admin-positive);
}

:global(.admin-app .article-copy-block-status.failed) {
	color: var(--admin-danger);
}

@media (max-width: 640px) {
	.article-copy-block {
		margin: 1rem 0;
		padding: 0.9rem 3.45rem 0.9rem 0.9rem;
		border-radius: 0.9rem;
	}

	.article-copy-block-body {
		font-size: 0.95em;
		line-height: 1.56;
	}

	.article-copy-block-button {
		top: 0.45rem;
		right: 0.45rem;
		width: 44px;
		height: 44px;
	}

	.article-copy-block-status {
		top: 1.1rem;
		right: 3.55rem;
	}
}

@media (prefers-reduced-transparency: reduce) {
	.article-copy-block {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}

	:global(.admin-app .article-copy-block) {
		background: var(--admin-surface);
	}
}

@supports not (backdrop-filter: blur(1px)) {
	.article-copy-block {
		background: color-mix(in srgb, var(--c-bg-1) 96%, var(--c-flow-cyan) 4%);
	}

	:global(.admin-app .article-copy-block) {
		background: color-mix(in srgb, var(--admin-surface) 96%, var(--admin-accent-soft) 4%);
	}
}

@media (prefers-reduced-motion: reduce) {
	.article-copy-block-button {
		transition: none;
	}
}
</style>
