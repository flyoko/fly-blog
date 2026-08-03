<script setup lang="ts">
withDefaults(defineProps<{
	icon?: string
	title: string
	description: string
	badge?: string
}>(), {
	icon: 'tabler:sparkles',
	badge: '',
})
</script>

<template>
<section class="admin-empty-state">
	<div class="admin-empty-state-icon" aria-hidden="true">
		<Icon :name="icon" />
	</div>
	<span v-if="badge" class="admin-badge">{{ badge }}</span>
	<h1>{{ title }}</h1>
	<p>{{ description }}</p>
	<slot />
</section>
</template>
