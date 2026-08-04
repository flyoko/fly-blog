<script setup lang="ts">
withDefaults(defineProps<{
	title?: string
	description?: string
	open?: boolean
}>(), {
	title: '高级详情',
	description: '仅在排查或需要精确信息时展开。',
	open: false,
})
</script>

<template>
<details class="admin-advanced-details" :open="open">
	<summary>
		<span class="admin-advanced-details-icon" aria-hidden="true"><Icon name="tabler:settings-code" /></span>
		<span><strong>{{ title }}</strong><small>{{ description }}</small></span>
		<Icon class="admin-advanced-details-chevron" name="tabler:chevron-down" aria-hidden="true" />
	</summary>
	<div class="admin-advanced-details-body">
		<slot />
	</div>
</details>
</template>
