<script setup lang="ts">
const appConfig = useAppConfig()

useHead({
	titleTemplate: titleChunk => titleChunk
		? `${titleChunk} | ${appConfig.title}`
		: appConfig.title,
})
</script>

<template>
<NuxtLayout>
	<NuxtPage />
</NuxtLayout>
</template>
