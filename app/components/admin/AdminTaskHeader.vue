<script setup lang="ts">
withDefaults(defineProps<{
	eyebrow?: string
	title: string
	description: string
	status?: string | null
	statusTone?: 'neutral' | 'positive' | 'warning' | 'danger'
}>(), {
	eyebrow: '',
	status: null,
	statusTone: 'neutral',
})
</script>

<template>
<header class="admin-task-header">
	<div class="admin-task-header-copy">
		<span v-if="eyebrow" class="admin-badge">{{ eyebrow }}</span>
		<h1>{{ title }}</h1>
		<p>{{ description }}</p>
		<div v-if="status" class="admin-task-status" :data-tone="statusTone" aria-live="polite">
			<span class="admin-task-status-dot" aria-hidden="true" />
			{{ status }}
		</div>
	</div>
	<div v-if="$slots.actions" class="admin-task-header-actions">
		<slot name="actions" />
	</div>
</header>
</template>
