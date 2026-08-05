<script setup lang="ts">
import type { ModalEmits, ModalProps } from '#modals'
import MiniSearch from 'minisearch'

const props = defineProps<ModalProps>()

const emit = defineEmits<ModalEmits>()

const appConfig = useAppConfig()
const segmenter = Intl.Segmenter && new Intl.Segmenter(appConfig.language, { granularity: 'word' })

// await useAsyncData() 会阻塞渲染
const { data, status } = await useLazyAsyncData(
	'search',
	() => queryCollectionSearchSections('content', {
		ignoredTags: ['pre'],
	}),
)

const miniSearch = new MiniSearch({
	fields: ['title', 'content'],
	storeFields: ['title', 'titles', 'content', 'level'],
	searchOptions: {
		prefix: true,
		fuzzy: 0.2,
		combineWith: 'AND',
		boost: { title: 3, titles: 2 },
	},
	processTerm: segmenter
		? term => Array.from(segmenter.segment(term), seg => seg.segment.toLowerCase())
		: undefined,
})

const searchStore = useSearchStore()
const searchInput = ref<HTMLInputElement>()

const { word, debouncedWord } = storeToRefs(searchStore)
const result = computed(() => {
	void data.value
	return miniSearch.search(debouncedWord.value)
})

const isKeyboardMode = ref(false)
const listResult = useTemplateRef('list-result')

const activeIndex = ref(0)
const activeItem = computed(() => listResult.value?.children[activeIndex.value] as HTMLLinkElement | undefined)

whenever(() => props.open, focusInput)

watch(status, (newStatus) => {
	if (newStatus === 'success' && data.value) {
		miniSearch.addAll(data.value)
	}
})

watch(debouncedWord, () => {
	activeIndex.value = 0
})

useEventListener('mousemove', () => isKeyboardMode.value = false)
useEventListener('keydown', () => isKeyboardMode.value = true)

async function focusInput(allSelect = false) {
	await nextTick()
	searchInput.value?.focus()
	if (allSelect)
		searchInput.value?.select()
}

function updateActiveIndex(index: number, isKeyboard = false) {
	focusInput()
	if (index < 0 || index >= result.value?.length)
		return
	activeIndex.value = index
	if (isKeyboard)
		isKeyboardMode.value = true
	if (activeItem.value && isKeyboardMode.value) {
		activeItem.value.scrollIntoView({ block: 'nearest' })
	}
}

function openActiveItem() {
	// 触发 vue-router 点击事件
	activeItem.value?.click()
}
</script>

<template>
<Transition name="float-in">
	<div v-if="open" class="blog-search" role="dialog" aria-modal="true" aria-labelledby="site-search-title">
		<header class="search-heading">
			<div>
				<Icon name="tabler:sparkles" aria-hidden="true" />
				<span id="site-search-title">站内搜索</span>
			</div>
			<button type="button" aria-label="关闭站内搜索" @click="emit('close')">
				<Icon name="tabler:x" aria-hidden="true" />
			</button>
		</header>

		<form class="input" role="search" @submit.prevent>
			<Icon v-show="false" name="line-md:loading-alt-loop" />
			<Icon :name="status === 'pending' ? 'line-md:loading-alt-loop' : 'tabler:search'" aria-hidden="true" />

			<!-- 方向键切换搜索结果不应只在搜索框内触发 -->
			<input
				ref="searchInput"
				v-model="word"
				type="search"
				incremental
				class="search-input"
				placeholder="搜索文章标题、正文或页面"
				aria-label="搜索文章标题、正文或页面"
				@keydown.up.prevent
				@keydown.down.prevent
			>
		</form>

		<TransitionGroup name="expand">
			<div v-if="!debouncedWord && status !== 'pending'" class="search-empty">
				<Icon name="tabler:command" aria-hidden="true" />
				<div>
					<strong>输入关键词开始探索</strong>
					<span>支持文章标题、正文内容和页面名称。</span>
				</div>
			</div>

			<div v-if="debouncedWord && status === 'success' && !result.length" class="no-result">
				<Icon name="tabler:search-off" aria-hidden="true" />
				<span>没有找到“{{ debouncedWord }}”，试试更短的关键词。</span>
			</div>

			<menu
				v-if="result.length"
				ref="list-result"
				:key="result.length < 5 ? result.length : result[0]?.id"
				class="scrollcheck-y search-result"
			>
				<PopoverSearchItem
					v-for="(item, itemIndex) in result"
					:key="item.id"
					v-bind="item"
					:class="{ active: activeIndex === itemIndex }"
					@mousemove="updateActiveIndex(itemIndex)"
				/>
			</menu>

			<div v-if="result.length" class="tip">
				<Key code="ArrowUp" prevent @press="updateActiveIndex(activeIndex - 1, true)" />
				<Key code="ArrowDown" prevent @press="updateActiveIndex(activeIndex + 1, true)" />
				切换&emsp;
				<Key code="Enter" icon @press="openActiveItem" />
				选择&emsp;
				<Key code="Escape" :icon="false" @press="$emit('close')" />
				关闭
			</div>
		</TransitionGroup>
	</div>
</Transition>
</template>

<style lang="scss" scoped>
.blog-search {
	--float-distance: 20vh;

	contain: paint;
	position: fixed;
	inset: 0;
	width: 90%;
	height: fit-content;
	max-width: $breakpoint-mobile;
	margin: auto;
	border: 1px solid var(--c-primary);
	border-radius: 1em;
	box-shadow: var(--box-shadow-2), var(--box-shadow-3);
	outline: 0.2em solid var(--c-primary-soft);
	background-color: var(--ld-bg-card);
}

.search-heading {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
	padding: 0.8rem 0.8rem 0.35rem 1rem;

	> div {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--c-text-2);
	}

	button {
		display: grid;
		place-items: center;
		width: 2.35rem;
		height: 2.35rem;
		border-radius: 50%;
		color: var(--c-text-2);
		transition: background-color 0.2s, color 0.2s;

		&:hover,
		&:focus-visible {
			background: var(--c-primary-soft);
			color: var(--c-primary);
		}
	}
}

.input {
	display: flex;
	align-items: center;
	gap: 0.8rem;
	position: relative;
	margin: 0.3rem 0.8rem 0.75rem;
	padding: 0 0.85rem;
	border: 1px solid var(--c-border);
	border-radius: 0.8rem;
	background: color-mix(in srgb, var(--c-bg-2) 82%, transparent);

	> .search-input {
		width: 100%;
		padding: 0.9rem 0;
		outline: none;
	}
}

.search-empty,
.no-result {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.7rem;
	max-height: 7rem;
	padding: 1rem 1.25rem 1.35rem;
	text-align: start;
	color: var(--c-text-3);
	transition: all 0.5s;

	> .iconify {
		flex: 0 0 auto;
		font-size: 1.35rem;
		color: var(--c-primary);
	}
}

.search-empty {
	div {
		display: grid;
		gap: 0.2rem;
	}

	strong {
		font-size: 0.82rem;
		color: var(--c-text-1);
	}

	span {
		font-size: 0.74rem;
	}
}

.no-result {
	span {
		font-size: 0.8rem;
	}
}

.search-result {
	max-height: 75vh;
	max-height: 75dvh;
	transition: all 0.5s;
	scroll-padding: var(--fadeout-height);
}

.search-item {
	transition: background-color 0.1s, opacity 0.2s;
}

.tip {
	max-height: 1rem;
	margin: 0 1em 0.5rem;
	font-size: 0.8em;
	text-align: center;
	color: var(--c-text-3);
	transition: all 0.5s;
}

.expand-enter-active,
.expand-leave-active {
	transition: all 0.5s;
}

.expand-enter-from,
.expand-leave-to {
	opacity: 0;
	max-height: 0;
}

@media (max-width: $breakpoint-phone) {
	.blog-search {
		inset: max(4.75rem, env(safe-area-inset-top)) 0.75rem auto;
		width: auto;
		max-height: calc(100dvh - 5.5rem - env(safe-area-inset-bottom));
		margin: 0;
		border-radius: 1.15rem;
	}

	.search-heading {
		padding: 0.7rem 0.55rem 0.25rem 0.85rem;

		button {
			width: var(--touch-target);
			height: var(--touch-target);
		}
	}

	.input {
		margin: 0.2rem 0.7rem 0.65rem;
	}

	.search-result {
		max-height: 56dvh;
	}

	.tip {
		display: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.search-heading button,
	.no-result,
	.search-empty,
	.search-result,
	.tip,
	.expand-enter-active,
	.expand-leave-active {
		transition: none;
	}
}
</style>
