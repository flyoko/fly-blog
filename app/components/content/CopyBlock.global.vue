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

async function copyText() {
	// 这里必须复制用户实际看到的段落换行，textContent 会把块级内容直接拼接。
	// eslint-disable-next-line unicorn/prefer-dom-node-text-content
	const value = body.value?.innerText.trim() || ''
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
	margin: 1.25rem 0;
	padding: 1.15rem 3.7rem 1.15rem 1.2rem;
	border: 1px solid rgb(255 255 255 / 8%);
	border-radius: 1.15rem;
	box-shadow: 0 0.75rem 2.25rem rgb(0 0 0 / 12%);
	background: #222;
	color: #F7F7F7;
}

.article-copy-block-body {
	overflow-wrap: anywhere;
	min-width: 0;
	font-size: 0.92em;
	line-height: 1.75;

	:deep(p) {
		margin: 0.65em 0;
	}

	:deep(p:first-child) {
		margin-top: 0;
	}

	:deep(p:last-child) {
		margin-bottom: 0;
	}

	:deep(strong) {
		background: none;
		color: inherit;
		-webkit-text-fill-color: currentcolor;
	}

	:deep(code) {
		background: rgb(255 255 255 / 10%);
		color: #FFF;
	}
}

.article-copy-block-button {
	display: grid;
	place-items: center;
	position: absolute;
	top: 0.65rem;
	right: 0.65rem;
	width: 2.75rem;
	height: 2.75rem;
	padding: 0;
	border: 0;
	border-radius: 0.7rem;
	background: transparent;
	font: inherit;
	font-size: 1.15rem;
	color: #D9D9D9;
	transition: background-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
	cursor: pointer;

	&:hover {
		background: rgb(255 255 255 / 9%);
		color: #FFF;
	}

	&:active {
		transform: scale(0.94);
	}

	&:focus-visible {
		outline: 2px solid #FFF;
		outline-offset: 2px;
	}
}

.article-copy-block-status {
	position: absolute;
	top: 1.32rem;
	right: 3.8rem;
	max-width: min(13rem, calc(100% - 5.5rem));
	font-size: 0.72rem;
	line-height: 1.2;
	white-space: nowrap;
	color: #BBF7D0;
	pointer-events: none;

	&.failed {
		color: #FECACA;
	}
}

@media (max-width: 640px) {
	.article-copy-block {
		padding: 1rem 3.55rem 1rem 1rem;
		border-radius: 1rem;
	}

	.article-copy-block-button {
		top: 0.55rem;
		right: 0.55rem;
		width: 44px;
		height: 44px;
	}

	.article-copy-block-status {
		top: 1.2rem;
		right: 3.7rem;
	}
}

@media (prefers-reduced-motion: reduce) {
	.article-copy-block-button {
		transition: none;
	}
}
</style>
