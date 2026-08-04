<script setup lang="ts">
withDefaults(defineProps<{
	tone?: 'neutral' | 'positive' | 'warning' | 'danger'
}>(), {
	tone: 'neutral',
})
</script>

<template>
<span class="admin-status-pill" :data-tone="tone">
	<slot />
</span>
</template>
