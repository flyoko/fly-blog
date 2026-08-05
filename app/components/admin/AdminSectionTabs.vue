<script setup lang="ts">
export interface AdminTaskTab {
	id: string
	label: string
	description?: string
	icon?: string
	count?: number
}

const props = withDefaults(defineProps<{
	modelValue: string
	tabs: AdminTaskTab[]
	label?: string
}>(), {
	label: '任务分区',
})

const emit = defineEmits<{
	'update:modelValue': [value: string]
}>()

const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

function select(id: string) {
	emit('update:modelValue', id)
}

function handleKeydown(event: KeyboardEvent, index: number) {
	if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
		return
	event.preventDefault()
	let target = index
	if (event.key === 'Home')
		target = 0
	else if (event.key === 'End')
		target = props.tabs.length - 1
	else if (event.key === 'ArrowRight')
		target = (index + 1) % props.tabs.length
	else
		target = (index - 1 + props.tabs.length) % props.tabs.length
	const tab = props.tabs[target]
	if (!tab)
		return
	select(tab.id)
	nextTick(() => buttons.value?.[target]?.focus())
}
</script>

<template>
<div class="admin-section-tabs" role="tablist" :aria-label="label">
	<button
		v-for="(tab, index) in tabs"
		:key="tab.id"
		ref="buttons"
		class="admin-section-tab"
		:class="{ 'is-active': modelValue === tab.id }"
		type="button"
		role="tab"
		:aria-selected="modelValue === tab.id"
		:tabindex="modelValue === tab.id ? 0 : -1"
		@click="select(tab.id)"
		@keydown="handleKeydown($event, index)"
	>
		<Icon v-if="tab.icon" :name="tab.icon" aria-hidden="true" />
		<span class="admin-section-tab-copy">
			<strong>{{ tab.label }}</strong>
			<small v-if="tab.description">{{ tab.description }}</small>
		</span>
		<span v-if="typeof tab.count === 'number'" class="admin-section-tab-count">{{ tab.count }}</span>
	</button>
</div>
</template>
