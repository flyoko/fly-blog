<script setup lang="ts">
const props = withDefaults(defineProps<{
	disabled?: boolean
}>(), {
	disabled: false,
})

const root = ref<HTMLElement | null>(null)
const triggerButton = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const contentId = useId()

function show() {
	if (!props.disabled)
		open.value = true
}

function hide(restoreFocus = false) {
	open.value = false
	if (restoreFocus)
		nextTick(() => triggerButton.value?.focus())
}

function toggle() {
	if (open.value)
		hide()
	else
		show()
}

function focusFirstOption() {
	show()
	nextTick(() => root.value?.querySelector<HTMLButtonElement>('.dropdown-content button:not(:disabled)')?.focus())
}

function handleFocusOut() {
	nextTick(() => {
		if (open.value && root.value && !root.value.contains(document.activeElement))
			hide()
	})
}

function handleDocumentPointer(event: PointerEvent) {
	if (open.value && root.value && !root.value.contains(event.target as Node))
		hide()
}

function handleDocumentKey(event: KeyboardEvent) {
	if (open.value && event.key === 'Escape') {
		event.preventDefault()
		hide(true)
	}
}

watch(() => props.disabled, (disabled) => {
	if (disabled)
		hide()
})

onMounted(() => {
	document.addEventListener('pointerdown', handleDocumentPointer)
	document.addEventListener('keydown', handleDocumentKey)
})

onBeforeUnmount(() => {
	document.removeEventListener('pointerdown', handleDocumentPointer)
	document.removeEventListener('keydown', handleDocumentKey)
})
</script>

<template>
<div ref="root" class="dropdown" @focusout="handleFocusOut">
	<button
		ref="triggerButton"
		class="dropdown-trigger"
		type="button"
		:disabled="disabled"
		:aria-expanded="open"
		:aria-controls="contentId"
		@click="toggle"
		@keydown.down.prevent="focusFirstOption"
	>
		<slot />
	</button>
	<div v-show="open" :id="contentId" class="dropdown-content">
		<slot name="content" :hide="hide" />
	</div>
</div>
</template>

<style lang="scss" scoped>
.dropdown {
	position: relative;
}

.dropdown-trigger {
	color: inherit;
}

.dropdown-content {
	display: grid;
	position: absolute;
	inset-inline-start: 0;
	top: calc(100% + 0.25rem);
	min-width: max-content;
	padding: 0.3em;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	box-shadow: var(--box-shadow-2);
	background: var(--c-bg-1);
	font-size: inherit;
	z-index: var(--z-index-popover);
}

.dropdown-content :deep(button) {
	padding: 0.3em 0.5em;
	border-radius: 0.3em;
	text-align: start;
	color: var(--c-text-1);
	transition: color 0.1s, background-color 0.2s;
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background-color: var(--c-bg-soft);
		color: var(--c-text-1);
	}

	&.active {
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}
}
</style>
