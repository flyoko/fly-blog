<script setup lang="ts">
import { adminNavigation } from '~/types/admin'

interface CommandAction {
	label: string
	description: string
	icon: string
	to: string
	keywords: string
}

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const router = useRouter()
const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)

const quickActions: CommandAction[] = [
	{ label: '写一篇文章', description: '打开编辑器，先保存草稿再决定是否公开。', icon: 'tabler:pencil-plus', to: '/admin/articles/new', keywords: '文章 写作 新建 发布 草稿' },
	{ label: '记录一个瞬间', description: '写下此刻，再选择保存草稿或公开。', icon: 'tabler:sparkles', to: '/admin/moments', keywords: '瞬间 动态 记录' },
	{ label: '整理 AI 阅闻', description: '同步来源或补充一条手动精选。', icon: 'tabler:news', to: '/admin/ai-news', keywords: 'AI 新闻 阅闻 同步 精选' },
	{ label: '上传和整理媒体', description: '管理文章图片、头像与音乐文件。', icon: 'tabler:cloud-upload', to: '/admin/media', keywords: '媒体 图片 音频 上传 R2' },
	{ label: '查看发布进度', description: '跟进检查、预览与待合并变更。', icon: 'tabler:git-pull-request', to: '/admin/reviews', keywords: '发布 审核 PR 预览 检查' },
]

const navigationActions = adminNavigation
	.filter(item => item.to !== '/admin')
	.map<CommandAction>(item => ({
		label: `前往${item.label}`,
		description: `打开${item.label}管理页面。`,
		icon: item.icon,
		to: item.to,
		keywords: `${item.label} 页面 导航`,
	}))

const actions = [...quickActions, ...navigationActions]
const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase('zh-CN'))
const filteredActions = computed(() => {
	if (!normalizedQuery.value)
		return actions
	return actions.filter((action) => {
		const haystack = `${action.label} ${action.description} ${action.keywords}`.toLocaleLowerCase('zh-CN')
		return haystack.includes(normalizedQuery.value)
	})
})

watch(normalizedQuery, () => {
	activeIndex.value = 0
})

watch(() => props.open, async (open) => {
	query.value = ''
	activeIndex.value = 0
	if (!import.meta.client)
		return
	document.body.style.overflow = open ? 'hidden' : ''
	if (open) {
		await nextTick()
		input.value?.focus()
	}
})

onBeforeUnmount(() => {
	if (import.meta.client)
		document.body.style.overflow = ''
})

function close() {
	emit('close')
}

async function run(action: CommandAction) {
	close()
	await router.push(action.to)
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape') {
		event.preventDefault()
		close()
		return
	}
	if (event.key === 'ArrowDown' && filteredActions.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value + 1) % filteredActions.value.length
		return
	}
	if (event.key === 'ArrowUp' && filteredActions.value.length) {
		event.preventDefault()
		activeIndex.value = (activeIndex.value - 1 + filteredActions.value.length) % filteredActions.value.length
		return
	}
	const action = filteredActions.value[activeIndex.value]
	if (event.key === 'Enter' && action) {
		event.preventDefault()
		run(action)
	}
}
</script>

<template>
<Teleport to="body">
	<div v-if="open" class="admin-command" role="dialog" aria-modal="true" aria-labelledby="admin-command-title" @keydown="onKeydown">
		<button class="admin-command-backdrop" type="button" aria-label="关闭快速开始" @click="close" />
		<section class="admin-command-panel">
			<header class="admin-command-header">
				<div>
					<span>想到什么就直接做</span>
					<h2 id="admin-command-title">
						快速开始
					</h2>
				</div>
				<kbd>Esc</kbd>
			</header>
			<label class="admin-command-search">
				<Icon name="tabler:search" />
				<input ref="input" v-model="query" type="search" placeholder="搜索要做的事" autocomplete="off">
			</label>
			<div v-if="filteredActions.length" class="admin-command-list">
				<button
					v-for="(action, index) in filteredActions"
					:key="`${action.to}-${action.label}`"
					type="button"
					:class="{ 'is-active': activeIndex === index }"
					@mouseenter="activeIndex = index"
					@click="run(action)"
				>
					<span class="admin-command-icon"><Icon :name="action.icon" /></span>
					<span class="admin-command-copy">
						<strong>{{ action.label }}</strong>
						<small>{{ action.description }}</small>
					</span>
					<Icon name="tabler:arrow-right" />
				</button>
			</div>
			<div v-else class="admin-command-empty">
				<Icon name="tabler:mood-empty" />
				<strong>没有找到这个操作</strong>
				<span>换一个更短的关键词试试。</span>
			</div>
			<footer>
				<span><kbd>↑</kbd><kbd>↓</kbd> 浏览</span>
				<span><kbd>Enter</kbd> 打开首项</span>
			</footer>
		</section>
	</div>
</Teleport>
</template>

<style scoped lang="scss">
.admin-command {
	display: grid;
	place-items: start center;
	position: fixed;
	inset: 0;
	padding: min(12vh, 7rem) 1rem 1rem;
	z-index: 120;
}

.admin-command-backdrop {
	position: absolute;
	inset: 0;
	border: 0;
	background: rgb(5 20 22 / 58%);
	backdrop-filter: blur(8px);
}

.admin-command-panel {
	position: relative;
	overflow: hidden;
	width: min(42rem, 100%);
	border: 1px solid var(--admin-glass-border-strong);
	border-radius: 1.25rem;
	box-shadow: var(--admin-glass-floating-shadow), var(--admin-glass-inset);
	background:
		linear-gradient(145deg, var(--admin-glass-highlight), transparent 36%),
		radial-gradient(120% 130% at 8% -12%, var(--admin-glass-tint), transparent 56%),
		var(--admin-glass-floating-fill);
	backdrop-filter: var(--admin-glass-filter);
	color: var(--admin-text);
}

.admin-command-header,
.admin-command-panel footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 1rem 1.1rem;
}

.admin-command-header span,
.admin-command-copy small,
.admin-command-empty span,
.admin-command-panel footer {
	font-size: 0.7rem;
	color: var(--admin-muted);
}

.admin-command-header h2 {
	margin: 0.18rem 0 0;
	font-family: "Noto Serif SC", serif;
	font-size: 1.25rem;
}

.admin-command-search {
	display: flex;
	align-items: center;
	gap: 0.7rem;
	margin: 0 1rem;
	padding: 0.78rem 0.9rem;
	border: 1px solid var(--admin-glass-border);
	border-radius: 0.85rem;
	box-shadow: inset 0 1px 0 color-mix(in srgb, var(--admin-glass-highlight) 50%, transparent);
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--admin-glass-highlight) 42%, transparent), transparent 46%),
		var(--admin-glass-clear-fill);
	color: var(--admin-muted);
}

.admin-command-search input {
	width: 100%;
	border: 0;
	outline: 0;
	background: transparent;
	font: inherit;
	color: var(--admin-text);
}

.admin-command-list {
	display: grid;
	overflow-y: auto;
	max-height: min(29rem, 58vh);
	padding: 0.75rem;
}

.admin-command-list button {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 0.8rem;
	padding: 0.72rem;
	border: 0;
	border-radius: 0.85rem;
	background: transparent;
	font: inherit;
	text-align: left;
	color: inherit;
	cursor: pointer;
}

.admin-command-list button:hover,
.admin-command-list button:focus-visible,
.admin-command-list button.is-active {
	background:
		linear-gradient(145deg, color-mix(in srgb, var(--admin-glass-highlight) 36%, transparent), transparent 48%),
		color-mix(in srgb, var(--admin-accent-soft) 72%, var(--admin-glass-clear-fill));
}

.admin-command-icon {
	display: grid;
	place-items: center;
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 0.75rem;
	background: var(--admin-glass-soft-fill);
	font-size: 1.15rem;
	color: var(--admin-accent-strong);
}

.admin-command-copy {
	display: grid;
	gap: 0.2rem;
}

.admin-command-copy strong {
	font-size: 0.82rem;
}

.admin-command-empty {
	display: grid;
	place-items: center;
	gap: 0.35rem;
	min-height: 12rem;
	text-align: center;
}

.admin-command-empty > .iconify {
	font-size: 2rem;
	color: var(--admin-muted);
}

.admin-command-panel footer {
	justify-content: flex-start;
	border-top: 1px solid var(--admin-border);
}

kbd {
	padding: 0.12rem 0.35rem;
	border: 1px solid var(--admin-glass-border);
	border-radius: 0.35rem;
	box-shadow: inset 0 1px 0 color-mix(in srgb, var(--admin-glass-highlight) 46%, transparent);
	background: var(--admin-glass-soft-fill);
	font: inherit;
	font-size: 0.62rem;
}

@media (max-width: 900px), (hover: none) and (pointer: coarse) {
	.admin-command-panel {
		background:
			linear-gradient(145deg, color-mix(in srgb, var(--admin-glass-highlight) 52%, transparent), transparent 42%),
			color-mix(in srgb, var(--admin-surface) 95%, var(--admin-accent-soft) 5%);
		backdrop-filter: none;
	}

	.admin-command-backdrop {
		backdrop-filter: none;
	}
}

@media (prefers-reduced-transparency: reduce) {
	.admin-command-panel,
	.admin-command-search,
	.admin-command-icon,
	kbd {
		background: var(--admin-surface);
		backdrop-filter: none;
	}
}

.admin-command-panel footer kbd + kbd {
	margin-left: 0.18rem;
}

@media (max-width: 680px) {
	.admin-command {
		place-items: end center;
		padding: 0;
	}

	.admin-command-panel {
		width: 100%;
		max-height: 86vh;
		border-radius: 1.25rem 1.25rem 0 0;
	}
}
</style>
