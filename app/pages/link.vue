<script setup lang="ts">
const appConfig = useAppConfig()

const { data: postLink } = await useAsyncData(
	'content:/link',
	() => queryCollection('content').path('/link').first(),
)

useSeoMeta({
	title: '友链',
	description: `${appConfig.title} 的友链页面，当前暂未开放友链。`,
})
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/" suffix="友链" tag="h1" />
</div>

<section class="link-page card">
	<ContentRenderer
		v-if="postLink"
		:value="postLink"
		class="article"
	/>
	<p v-else class="text-center">
		友链暂未开放。
	</p>
</section>
</template>

<style lang="scss" scoped>
.link-page {
	margin: 1rem;
	padding: 1rem;
}
</style>
