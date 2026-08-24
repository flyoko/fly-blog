<script setup lang="tsx">
import type { TippyComponent } from 'vue-tippy'

const props = defineProps<{ path?: string }>()
const appConfig = useAppConfig()

type CommentLoadState = 'idle' | 'loading' | 'ready' | 'error'

const commentPlaceholder = [
	'来都来了，留下一点想法吧 💧',
	'无需账号登录，可使用任意昵称评论 😎',
	'邮箱不会公开，回复提醒待邮件服务配置 💕',
].join('\n')

const commentEl = useTemplateRef('comment')
const twikooRootEl = useTemplateRef<HTMLElement>('twikoo-root')
const popoverEl = useTemplateRef<TippyComponent>('popover')
const popoverJumpTo = ref('')
const popoverInputEl = useTemplateRef('popover-input')
const showUndo = ref(false)
const loadState = ref<CommentLoadState>('idle')
const loadError = ref('')
const commentLength = ref(0)
const commentFocused = ref(false)
let twikooObserver: MutationObserver | null = null
let initController: AbortController | null = null
let stopPathWatch: (() => void) | null = null

const popoverBind = shallowRef<TippyComponent['$props']>({})
const mascotState = computed(() => {
	if (commentLength.value >= 450)
		return 'nearly-full'
	if (commentLength.value > 0)
		return 'typing'
	if (commentFocused.value)
		return 'focused'
	return 'idle'
})

function isCommentTextarea(target: EventTarget | null): target is HTMLTextAreaElement {
	return target instanceof HTMLTextAreaElement
		&& target.matches('#twikoo .tk-input .el-textarea__inner')
}

useEventListener(commentEl, 'focusin', (event) => {
	if (isCommentTextarea(event.target))
		commentFocused.value = true
})

useEventListener(commentEl, 'focusout', (event) => {
	if (isCommentTextarea(event.target))
		commentFocused.value = false
})

useEventListener(commentEl, 'input', (event) => {
	if (isCommentTextarea(event.target))
		commentLength.value = event.target.value.length
})

/** 评论区链接守卫 */
useEventListener(commentEl, 'click', (e) => {
	if (!(e.target instanceof Element))
		return

	if (e.target.matches('.tk-avatar-img'))
		e.stopPropagation()

	const popoverTarget = e.target.closest('a[target="_blank"]')
	if (!(popoverTarget instanceof HTMLAnchorElement))
		return

	e.preventDefault()
	popoverEl.value?.hide()

	popoverJumpTo.value = safelyDecodeUriComponent(popoverTarget.href)
	popoverBind.value = {
		getReferenceClientRect: () => popoverTarget.getBoundingClientRect(),
		triggerTarget: popoverTarget,
	}

	nextTick(checkUndoable)
	popoverEl.value?.show()
}, { capture: true })

function checkUndoable() {
	showUndo.value = popoverInputEl.value?.textContent !== popoverJumpTo.value
}

function undo() {
	if (!popoverInputEl.value)
		return
	popoverInputEl.value.textContent = popoverJumpTo.value
	checkUndoable()
}

function confirmOpen() {
	window.open(popoverInputEl.value?.textContent, '_blank')
}

function getTwikooRoot() {
	return commentEl.value?.querySelector<HTMLElement>('#twikoo') ?? twikooRootEl.value
}

function enhanceTwikooAccessibility() {
	const root = getTwikooRoot()
	if (!root)
		return
	root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((textarea) => {
		if (!textarea.getAttribute('aria-label') && !textarea.getAttribute('aria-labelledby'))
			textarea.setAttribute('aria-label', '评论内容')
	})
	root.querySelectorAll<HTMLAnchorElement>('a[alt]').forEach((link) => {
		if (!link.getAttribute('aria-label') && !link.textContent?.trim())
			link.setAttribute('aria-label', link.getAttribute('alt') || '外部链接')
	})
	root.querySelectorAll<HTMLImageElement>('.OwO-item img:not([alt])').forEach((image) => {
		const label = image.closest<HTMLElement>('.OwO-item')?.getAttribute('title')?.trim()
		image.setAttribute('alt', label || '表情')
	})
}

function wait(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForTwikoo(signal: AbortSignal, timeout = 15000) {
	const startedAt = Date.now()
	while (!window.twikoo?.init) {
		if (signal.aborted)
			throw new DOMException('评论加载已取消', 'AbortError')
		if (Date.now() - startedAt >= timeout)
			throw new Error('评论服务加载超时，请检查网络后重试。')
		await wait(100)
	}
	return window.twikoo
}

function waitForTwikooDom(container: HTMLElement, signal: AbortSignal, timeout = 12000) {
	return new Promise<void>((resolve, reject) => {
		let observer: MutationObserver | null = null
		let timer = 0

		function cleanup() {
			observer?.disconnect()
			window.clearTimeout(timer)
			signal.removeEventListener('abort', handleAbort)
		}

		function finish() {
			if (!container.querySelector('#twikoo .tk-submit, #twikoo .tk-comments-container'))
				return
			cleanup()
			resolve()
		}

		function handleAbort() {
			cleanup()
			reject(new DOMException('评论加载已取消', 'AbortError'))
		}

		if (signal.aborted) {
			handleAbort()
			return
		}

		observer = new MutationObserver(finish)
		observer.observe(container, { childList: true, subtree: true })
		signal.addEventListener('abort', handleAbort, { once: true })
		timer = window.setTimeout(() => {
			cleanup()
			reject(new Error('评论区渲染超时，请稍后重试。'))
		}, timeout)
		finish()
	})
}

async function initializeTwikoo() {
	const envId = appConfig.twikoo?.envId
	const container = commentEl.value
	const mountRoot = getTwikooRoot()
	if (!envId || !container || !mountRoot) {
		loadState.value = 'error'
		loadError.value = envId ? '评论容器尚未准备好。' : '评论服务暂未配置。'
		return
	}

	initController?.abort()
	const controller = new AbortController()
	initController = controller
	twikooObserver?.disconnect()
	twikooObserver = null
	loadState.value = 'loading'
	loadError.value = ''
	mountRoot.replaceChildren()

	try {
		const twikoo = await waitForTwikoo(controller.signal)
		if (controller.signal.aborted)
			return

		twikoo.init({
			envId,
			...(props.path ? { path: props.path } : {}),
			// twikoo 会把挂载后的元素变为 #twikoo
			el: '#twikoo',
			placeholder: commentPlaceholder,
		})
		await waitForTwikooDom(container, controller.signal)
		if (controller.signal.aborted)
			return

		loadState.value = 'ready'
		enhanceTwikooAccessibility()
		const renderedRoot = getTwikooRoot()
		if (renderedRoot) {
			twikooObserver = new MutationObserver(enhanceTwikooAccessibility)
			twikooObserver.observe(renderedRoot, { childList: true, subtree: true })
		}
	}
	catch (cause) {
		if (cause instanceof DOMException && cause.name === 'AbortError')
			return
		loadState.value = 'error'
		loadError.value = cause instanceof Error ? cause.message : '评论服务加载失败，请稍后重试。'
	}
}

onMounted(() => {
	stopPathWatch = watch(
		() => props.path,
		() => void initializeTwikoo(),
		{ immediate: true, flush: 'post' },
	)
})

onBeforeUnmount(() => {
	stopPathWatch?.()
	initController?.abort()
	twikooObserver?.disconnect()
})
</script>

<template>
<section
	ref="comment"
	class="z-comment"
	:data-mascot-state="mascotState"
>
	<header class="comment-header">
		<h3 class="text-creative">
			评论区
		</h3>

		<button
			class="privacy-btn"
			type="button"
			aria-label="评论隐私说明：无需登录，邮箱不会公开"
			data-tip="无需登录即可评论，邮箱不会公开；回复提醒将在邮件服务配置完成后启用"
		>
			<Icon name="tabler:info-circle" />
		</button>
	</header>

	<!-- interactive 默认会把气泡移动到 triggerTarget 的父元素上 -->
	<Tooltip
		ref="popover"
		v-bind="popoverBind"
		:append-to="() => commentEl!"
		interactive
		:aria="{ expanded: false }"
		trigger="focusin"
	>
		<template #content>
			<div class="popover-confirm">
				<span
					ref="popover-input"
					class="input"
					contenteditable="plaintext-only"
					spellcheck="false"
					@input="checkUndoable"
					@keydown.enter.prevent="confirmOpen"
					v-text="popoverJumpTo"
				/>

				<button
					v-if="showUndo"
					aria-label="恢复原始内容"
					@click="undo()"
				>
					<Icon name="tabler:arrow-back-up" />
				</button>

				<ZButton
					primary
					text="访问"
					@click="confirmOpen"
				/>
			</div>
		</template>
	</Tooltip>

	<div
		v-if="loadState !== 'ready'"
		class="comment-status"
		:class="{ error: loadState === 'error' }"
		role="status"
		aria-live="polite"
	>
		<span v-if="loadState !== 'error'" class="loading-spinner" aria-hidden="true" />
		<Icon v-else name="tabler:message-circle-exclamation" aria-hidden="true" />
		<div>
			<strong>{{ loadState === 'error' ? '评论区暂时没有加载成功' : '正在加载评论区' }}</strong>
			<p>{{ loadState === 'error' ? loadError : '正在连接评论服务，请稍候…' }}</p>
		</div>
		<button v-if="loadState === 'error'" type="button" @click="initializeTwikoo">
			重新加载
		</button>
	</div>

	<div id="twikoo" ref="twikoo-root" />
</section>
</template>

<style lang="scss" scoped>
.z-comment {
	margin: 3rem 1rem;
	padding: 1.25rem;
	border: 1px solid var(--c-surface-line);
	border-radius: 1rem;
	box-shadow: inset 0 1px 0 var(--c-surface-highlight), 0 1rem 3rem var(--c-surface-shadow);
	background:
		linear-gradient(145deg, var(--c-surface-highlight), transparent 36%),
		color-mix(in srgb, var(--c-bg-1) 72%, transparent);
	backdrop-filter: blur(16px) saturate(115%);
	animation: comment-enter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.comment-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;

	> h3 {
		margin: 0;
		font-size: 1.35rem;
	}
}

.privacy-btn {
	display: grid;
	place-items: center;
	position: relative;
	width: 2rem;
	height: 2rem;
	border: 1px solid transparent;
	border-radius: 0.625rem;
	color: var(--c-text-2);
	transition: color 0.2s, border-color 0.2s, background-color 0.2s, transform 0.2s;

	&::before {
		content: "";
		position: absolute;
		opacity: 0;
		inset-inline-end: 0.55rem;
		bottom: calc(100% + 0.55rem);
		width: 0;
		height: 0;
		border: 0.38rem solid transparent;
		border-top-color: var(--c-bg-3);
		transform: translateY(0.35rem);
		transition: opacity 0.2s, transform 0.2s;
		pointer-events: none;
		z-index: 6;
	}

	&::after {
		content: attr(data-tip);
		position: absolute;
		opacity: 0;
		inset-inline-end: 0;
		bottom: calc(100% + 1.25rem);
		width: min(19rem, 75vw);
		padding: 0.65rem 0.8rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.75rem;
		box-shadow: 0 0.75rem 2rem var(--c-surface-shadow);
		background: var(--c-bg-3);
		font-size: 0.78rem;
		line-height: 1.45;
		text-align: start;
		color: var(--c-text-1);
		transform: translateY(0.45rem) scale(0.97);
		transform-origin: right bottom;
		transition: opacity 0.2s, transform 0.2s;
		pointer-events: none;
		z-index: 5;
	}

	&:hover, &:focus, &:focus-visible {
		border-color: var(--c-surface-border);
		background: var(--c-surface-fill);
		color: var(--c-primary);
		transform: translateY(-1px);

		&::before, &::after {
			opacity: 1;
			transform: none;
		}
	}
}

.comment-status {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.8rem;
	min-height: 7rem;
	margin: 1rem 0 0;
	padding: 1rem;
	border: 1px dashed var(--c-surface-line);
	border-radius: 0.85rem;
	background: color-mix(in srgb, var(--c-surface-fill) 80%, transparent);
	color: var(--c-text-2);

	> svg {
		width: 2rem;
		height: 2rem;
		color: var(--c-warning);
	}

	> div {
		min-width: 0;
	}

	strong {
		display: block;
		font-size: 0.95rem;
		color: var(--c-text-1);
	}

	p {
		margin: 0.25rem 0 0;
		font-size: 0.78rem;
		line-height: 1.5;
	}

	> button {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--c-surface-border);
		border-radius: 0.6rem;
		background: var(--c-surface-fill);
		font-size: 0.78rem;
		color: var(--c-primary);
		transition: border-color 0.2s, background-color 0.2s, transform 0.2s;

		&:hover, &:focus-visible {
			border-color: var(--c-primary);
			background: var(--c-primary-soft);
			transform: translateY(-1px);
		}
	}

	&.error {
		border-style: solid;
		border-color: color-mix(in srgb, var(--c-warning) 45%, var(--c-surface-line));
		background: color-mix(in srgb, var(--c-warning-soft) 65%, var(--c-surface-fill));
	}
}

.loading-spinner {
	width: 2rem;
	height: 2rem;
	border: 3px solid var(--c-bg-3);
	border-top-color: var(--c-primary);
	border-radius: 50%;
	animation: comment-spin 0.8s linear infinite;
}

:deep() > [data-tippy-root] > .tippy-box {
	padding: 0;
}

.popover-confirm {
	display: flex;
	align-items: center;
	overflow-wrap: anywhere;

	> .input {
		min-width: 0;
		padding: 0.3em 0.6em;
		outline: none;
	}

	> button {
		flex-shrink: 0;
		align-self: stretch;
		padding: 0.3em;
		border-radius: 0 0.5em 0.5em 0;
	}
}

/* Twikoo 与 Element UI 的第三方类名及行内样式需要定向覆盖。 */
/* stylelint-disable selector-class-pattern, declaration-no-important */
:deep(#twikoo) {
	margin: 1.2rem 0 0;

	.tk-submit {
		display: flex;
		flex-direction: column;
		gap: 0;
		animation: comment-form-enter 0.45s 0.08s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.tk-submit > .tk-row:first-child {
		display: block;
	}

	.tk-submit > .tk-row:first-child > .tk-avatar {
		display: none;
	}

	.tk-submit .tk-col {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.tk-submit .tk-preview-container {
		margin: 0 0 0.65rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.85rem;
		background: var(--c-surface-fill);
	}

	.tk-admin-container {
		position: fixed;
		z-index: calc(var(--z-index-popover) + 1);
	}

	.tk-input {
		order: 1;
		position: relative;
		margin: 0 0 0.65rem;
		font-family: var(--font-monospace);

		&::before {
			content: "匿名可评";
			position: absolute;
			inset-inline-end: 0.9rem;
			top: 0.75rem;
			padding: 0.25rem 0.5rem;
			border: 1px solid color-mix(in srgb, var(--c-primary) 30%, var(--c-surface-line));
			border-radius: 999px;
			background: color-mix(in srgb, var(--c-primary-soft) 70%, var(--c-bg-2));
			font: 600 0.68rem/1.2 var(--font-basic);
			letter-spacing: 0.04em;
			color: var(--c-primary);
			pointer-events: none;
			z-index: 2;
		}

		&::after {
			content: "";
			position: absolute;
			opacity: 0.94;
			inset-inline-end: 0.2rem;
			bottom: 0.05rem;
			width: 7.25rem;
			height: 5.45rem;
			background: url("/assets/comment/mascot.gif") right bottom / contain no-repeat;
			transform-origin: right bottom;
			transition: opacity 0.22s, filter 0.22s, transform 0.22s;
			filter: drop-shadow(0 0.35rem 0.55rem var(--c-surface-glow));
			pointer-events: none;
			z-index: 2;
		}
	}

	.tk-input .el-textarea__inner {
		width: 100%;
		min-width: 0;
		min-height: 7.25rem !important;
		max-width: 100%;
		padding: 1rem 7.75rem 1rem 1rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.9rem;
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		box-sizing: border-box;
		outline: none;
		background:
			radial-gradient(circle at 92% 72%, var(--c-primary-soft), transparent 17%),
			linear-gradient(145deg, var(--c-surface-highlight), transparent 40%),
			var(--c-surface-fill);
		font: inherit;
		line-height: 1.65;
		color: var(--c-text-1);
		transition: border-color 0.22s, box-shadow 0.22s, background-color 0.22s, transform 0.22s;
		resize: vertical;

		&::placeholder {
			opacity: 0.88;
			color: var(--c-text-2);
		}

		&:hover {
			border-color: color-mix(in srgb, var(--c-primary) 38%, var(--c-surface-line));
		}

		&:focus {
			border-color: var(--c-primary);
			box-shadow: 0 0 0 3px var(--c-primary-soft), inset 0 1px 0 var(--c-surface-highlight);
			background-color: var(--c-bg-1);
			transform: translateY(-1px);
		}
	}

	.tk-input .el-input__count {
		inset-inline-end: 0.8rem;
		bottom: 0.35rem;
		background: transparent;
		font-size: 0.68rem;
		color: var(--c-text-3);
	}

	.tk-meta-input {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
		order: 2;
		position: relative;
	}

	.tk-meta-input .el-input-group {
		display: flex;
		position: relative;
		width: 100%;
		min-width: 0;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.72rem;
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		background: var(--c-surface-fill);
		transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s, transform 0.2s;

		&::before {
			position: absolute;
			opacity: 0;
			bottom: calc(100% + 0.6rem);
			left: 50%;
			width: max-content;
			max-width: min(18rem, 80vw);
			padding: 0.5rem 0.65rem;
			border: 1px solid var(--c-surface-line);
			border-radius: 0.65rem;
			box-shadow: 0 0.65rem 1.8rem var(--c-surface-shadow);
			background: var(--c-bg-3);
			font-size: 0.72rem;
			line-height: 1.4;
			color: var(--c-text-1);
			transform: translate(-50%, 0.35rem) scale(0.97);
			transition: opacity 0.18s, transform 0.18s;
			pointer-events: none;
			z-index: 8;
		}

		&:first-child::before {
			content: "昵称可自由填写，无需注册账号";
		}

		&:nth-child(2)::before {
			content: "邮箱不会公开；回复提醒待邮件服务配置";
		}

		&:nth-child(3)::before {
			content: "可选，填写后昵称可跳转到你的主页";
		}

		&:hover {
			border-color: color-mix(in srgb, var(--c-primary) 35%, var(--c-surface-line));
		}

		&:focus-within {
			border-color: var(--c-primary);
			box-shadow: 0 0 0 3px var(--c-primary-soft), inset 0 1px 0 var(--c-surface-highlight);
			background: var(--c-bg-1);
			transform: translateY(-1px);

			&::before {
				opacity: 1;
				transform: translate(-50%, 0) scale(1);
			}
		}
	}

	.tk-meta-input .el-input-group__prepend {
		display: grid;
		flex: 0 0 auto;
		place-items: center;
		min-width: 3.35rem;
		padding: 0 0.65rem;
		border: 0;
		border-inline-end: 1px solid var(--c-surface-line);
		border-radius: 0.68rem 0 0 0.68rem;
		background: color-mix(in srgb, var(--c-bg-2) 78%, transparent);
		font-size: 0.78rem;
		color: var(--c-text-2);
	}

	.tk-meta-input .el-input__inner {
		flex: 1 1 0;
		width: 0;
		height: 2.45rem;
		min-width: 0;
		padding: 0 0.7rem;
		border: 0 !important;
		box-shadow: none !important;
		background: transparent !important;
		color: var(--c-text-1);
	}

	.tk-row.actions {
		align-items: center;
		justify-content: space-between;
		order: 3;
		margin: 0.7rem 0 0;
	}

	.tk-row-actions-start {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.tk-submit-action-icon {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		margin: 0;
		border: 1px solid transparent;
		border-radius: 0.6rem;
		color: var(--c-text-2);
		transition: color 0.2s, border-color 0.2s, background-color 0.2s, transform 0.2s;

		&:hover {
			border-color: var(--c-surface-line);
			background: var(--c-surface-fill);
			color: var(--c-primary);
			transform: translateY(-1px);
		}
	}

	.tk-row.actions > .el-button {
		height: 2.25rem;
		padding: 0 0.95rem;
		border: 1px solid var(--c-surface-line);
		border-radius: 0.65rem;
		box-shadow: inset 0 1px 0 var(--c-surface-highlight);
		background: var(--c-surface-fill);
		color: var(--c-text-1);
		transition: border-color 0.2s, box-shadow 0.2s, color 0.2s, transform 0.2s;

		&:hover:not(.is-disabled) {
			border-color: var(--c-primary);
			color: var(--c-primary);
			transform: translateY(-1px);
		}
	}

	.tk-row.actions > .tk-send {
		border-color: color-mix(in srgb, var(--c-primary) 62%, var(--c-surface-line));
		box-shadow: 0 0.45rem 1.1rem var(--c-primary-soft), inset 0 1px 0 color-mix(in srgb, white 35%, transparent);
		background: linear-gradient(135deg, color-mix(in srgb, var(--c-primary) 92%, white), var(--c-primary));
		color: white;

		&:hover:not(.is-disabled) {
			box-shadow: 0 0.65rem 1.4rem var(--c-primary-soft), inset 0 1px 0 color-mix(in srgb, white 42%, transparent);
			color: white;
		}

		&.is-disabled {
			opacity: 0.5;
		}
	}

	.OwO .OwO-body {
		border: 1px solid var(--c-surface-line);
		border-radius: 0.85rem;
		box-shadow: 0 1rem 2.5rem var(--c-surface-shadow);
		background: var(--c-bg-1);
		animation: comment-panel-enter 0.25s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.OwO .OwO-item {
		border-radius: 0.45rem;
		transition: background-color 0.16s, transform 0.16s;

		&:hover {
			background: var(--c-primary-soft);
			transform: translateY(-2px) scale(1.04);
		}
	}

	.tk-comments-container {
		margin-top: 1.2rem;
	}

	.tk-comments-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: 2.4rem;
		margin: 0;
		padding-top: 1rem;
		border-top: 1px solid var(--c-surface-line);
	}

	.tk-comments-count {
		font-size: 1.1rem;
		color: var(--c-text-1);
	}

	.tk-comments-actions {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--c-text-2);
	}

	.tk-comments-actions .tk-icon {
		display: grid;
		place-items: center;
		width: 1.85rem;
		height: 1.85rem;
		border: 1px solid transparent;
		border-radius: 0.55rem;
		font-size: 0.88rem;
		transition: border-color 0.18s, background-color 0.18s, color 0.18s, transform 0.18s;

		&:hover {
			border-color: var(--c-surface-line);
			background: var(--c-surface-fill);
			color: var(--c-primary);
			transform: rotate(8deg) scale(1.05);
		}
	}

	.tk-comments-actions .tk-icon > svg {
		width: 0.9rem;
		height: 0.9rem;
	}

	.tk-comments-no {
		padding: 2.4rem 1rem 1.2rem;
		font-size: 0.9rem;
		color: var(--c-text-3);
	}

	.tk-comment {
		padding: 1rem 0;
		border-bottom: 1px solid var(--c-surface-line);
		animation: comment-item-enter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
	}

	.tk-comment:last-child {
		border-bottom: 0;
	}

	.tk-comment .tk-main {
		min-width: 0;
	}

	.tk-comment .tk-content {
		line-height: 1.65;
	}

	.tk-comment .tk-action-link {
		border-radius: 0.45rem;
		transition: background-color 0.18s, color 0.18s, transform 0.18s;

		&:hover {
			background: var(--c-primary-soft);
			color: var(--c-primary);
			transform: translateY(-1px);
		}
	}

	.tk-avatar {
		border-radius: 50%;

		@supports (corner-shape: squircle) {
			corner-shape: superellipse(1.2);
		}

		&.tk-clickable {
			cursor: auto;
		}
	}

	.tk-time {
		color: var(--c-text-3);
	}

	.tk-content {
		margin-top: 0;
	}

	.tk-comments-title, .tk-nick {
		font-family: var(--font-creative);
	}

	.tk-owo-emotion {
		width: auto;
		height: 1.4em;
		vertical-align: text-bottom;
	}

	.tk-extras, .tk-footer {
		font-size: 0.7em;
		color: var(--c-text-1);
	}

	.tk-replies:not(.tk-replies-expand) {
		mask-image: linear-gradient(to top, transparent, #FFF 4em);
	}

	.tk-expand {
		border-radius: 0.5em;
		transition: background-color 0.1s;
	}

	.tippy-svg-arrow > svg {
		fill: inherit;
		width: auto;
		height: auto;
	}
}

.z-comment[data-mascot-state="focused"] :deep(#twikoo .tk-input::before) {
	content: "准备记录";
}

.z-comment[data-mascot-state="focused"] :deep(#twikoo .tk-input::after) {
	transform: translateY(-0.08rem) scale(1.025);
	filter: drop-shadow(0 0.45rem 0.75rem var(--c-surface-glow));
}

.z-comment[data-mascot-state="typing"] :deep(#twikoo .tk-input::before) {
	content: "输入中";
}

.z-comment[data-mascot-state="typing"] :deep(#twikoo .tk-input::after) {
	transform: translateY(-0.12rem) scale(1.055);
	filter: drop-shadow(0 0.5rem 0.85rem var(--c-surface-glow));
}

.z-comment[data-mascot-state="nearly-full"] :deep(#twikoo .tk-input::before) {
	content: "快写满啦";
	border-color: color-mix(in srgb, var(--c-warning) 55%, var(--c-surface-line));
	background: var(--c-warning-soft);
	color: var(--c-warning);
}

.z-comment[data-mascot-state="nearly-full"] :deep(#twikoo .tk-input::after) {
	transform: translateY(-0.16rem) scale(1.08);
	filter: drop-shadow(0 0.55rem 0.95rem color-mix(in srgb, var(--c-warning) 22%, transparent));
}

:deep(:where(.tk-preview-container,.tk-content)) {
	pre {
		overflow: auto;
		border-radius: 0.5em;
		font-size: 0.85em;
	}

	a {
		margin: -0.1em -0.2em;
		padding: 0.1em 0.2em;
		background: linear-gradient(var(--c-primary-soft), var(--c-primary-soft)) no-repeat center bottom / 100% 0.1em;
		color: var(--c-primary);
		transition: all 0.2s;

		&:hover {
			border-radius: 0.3em;
			background-size: 100% 100%;
		}
	}

	p {
		margin: 0.2em 0;
	}

	img {
		border-radius: 0.5em;
	}

	menu, ol, ul {
		margin: 0.5em 0;
		padding-inline-start: 1.5em;
		font-size: 0.9rem;
		list-style: revert;

		> li {
			margin: 0.2em 0;

			&::marker {
				color: var(--c-primary);
			}
		}
	}

	blockquote {
		margin: 0.5em 0;
		padding: 0.2em 0.5em;
		border-inline-start: 4px solid var(--c-border);
		border-radius: 4px;
		background-color: var(--c-bg-2);
		font-size: 0.9em;
	}
}

@media (max-width: 640px) {
	.privacy-btn {
		width: var(--touch-target);
		height: var(--touch-target);
	}

	.z-comment {
		margin: 2rem var(--mobile-page-gutter);
		padding: 1rem;
		border-radius: var(--mobile-surface-radius);
		animation: none;
	}

	.comment-header > h3 {
		font-size: 1.2rem;
	}

	.comment-status {
		grid-template-columns: auto minmax(0, 1fr);
		min-height: 8rem;

		> button {
			grid-column: 1 / -1;
			width: 100%;
		}
	}

	:deep(#twikoo) {
		.tk-submit,
		.tk-comment {
			animation: none;
		}

		.tk-input .el-textarea__inner {
			min-height: 8.4rem !important;
			padding: 3rem 6.6rem 3.2rem 1rem;
			font-size: 1rem;
		}

		.tk-meta-input .el-input__inner {
			min-height: var(--touch-target);
			font-size: 1rem;
		}

		.tk-input::before {
			inset-inline: 0.8rem auto;
		}

		.tk-input::after {
			inset-inline-end: 0.05rem;
			bottom: 0.05rem;
			width: 6.25rem;
			height: 4.7rem;
		}

		.tk-meta-input {
			grid-template-columns: 1fr;
		}

		.tk-meta-input .el-input-group::before {
			inset-inline-start: 0;
			left: auto;
			max-width: calc(100vw - 3rem);
			transform: translateY(0.35rem) scale(0.97);
		}

		.tk-meta-input .el-input-group:focus-within::before {
			transform: none;
		}

		.tk-row.actions {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.tk-row-actions-start {
			margin-inline-end: auto;
		}

		.tk-submit-action-icon {
			width: var(--touch-target);
			height: var(--touch-target);
		}

		.tk-row.actions > .el-button {
			min-height: var(--touch-target);
		}

		.tk-comments-title {
			align-items: flex-start;
			gap: 0.75rem;
		}

		.tk-comment {
			gap: 0.65rem;
		}

		.tk-comment > .tk-avatar {
			width: 2.25rem;
			height: 2.25rem;
		}
	}
}

@media (prefers-reduced-transparency: reduce) {
	.z-comment {
		background: var(--c-bg-1);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.z-comment,
	.loading-spinner,
	:deep(#twikoo .tk-submit),
	:deep(#twikoo .tk-input::after),
	:deep(#twikoo .OwO .OwO-body),
	:deep(#twikoo .tk-comment) {
		animation: none;
	}

	:deep(#twikoo .tk-input::after) {
		background-image: url("/assets/comment/mascot-static.png");
		transition: none;
	}

	.privacy-btn,
	:deep(#twikoo *) {
		transition-duration: 0.01ms !important;
		scroll-behavior: auto !important;
	}
}
/* stylelint-enable selector-class-pattern, declaration-no-important */

@keyframes comment-enter {
	from {
		opacity: 0;
		transform: translateY(1rem) scale(0.985);
	}
}

@keyframes comment-form-enter {
	from {
		opacity: 0;
		transform: translateY(0.75rem);
	}
}

@keyframes comment-panel-enter {
	from {
		opacity: 0;
		transform: translateY(-0.5rem) scale(0.98);
	}
}

@keyframes comment-item-enter {
	from {
		opacity: 0;
		transform: translateY(0.5rem);
	}
}

@keyframes comment-spin {
	to {
		transform: rotate(1turn);
	}
}
</style>
