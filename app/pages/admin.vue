<script setup lang="ts">
definePageMeta({
	layout: 'admin',
	middleware: 'admin-auth',
})
</script>

<template>
<div class="admin-route-view">
	<NuxtPage />
</div>
</template>
