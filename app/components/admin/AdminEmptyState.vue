<script setup lang="ts">
withDefaults(defineProps<{
	icon?: string
	title: string
	description: string
	badge?: string
	headingLevel?: 1 | 2 | 3
}>(), {
	icon: 'tabler:sparkles',
	badge: '',
	headingLevel: 2,
})
</script>

<template>
<section class="admin-empty-state">
	<div class="admin-empty-state-icon" aria-hidden="true">
		<Icon :name="icon" />
	</div>
	<span v-if="badge" class="admin-badge">{{ badge }}</span>
	<component :is="`h${headingLevel}`">
		{{ title }}
	</component>
	<p>{{ description }}</p>
	<slot />
</section>
</template>
