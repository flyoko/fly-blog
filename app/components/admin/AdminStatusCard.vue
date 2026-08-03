<script setup lang="ts">
withDefaults(defineProps<{
	label: string
	value: string | number | null
	icon: string
	note?: string
	tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}>(), {
	note: '',
	tone: 'neutral',
})
</script>

<template>
<article class="admin-status-card" :data-tone="tone">
	<div class="admin-status-card-icon" aria-hidden="true">
		<Icon :name="icon" />
	</div>
	<div>
		<span>{{ label }}</span>
		<strong>{{ value === null ? '—' : value }}</strong>
		<small v-if="note">{{ note }}</small>
	</div>
</article>
</template>
