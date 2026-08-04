<script setup lang="ts">
definePageMeta({
	articlePage: true,
})

const route = useRoute()

const { data: post } = await useAsyncData(
	`content:${route.path}`,
	() => queryCollection('content').path(route.path).first(),
)

const excerpt = computed(() => post.value?.description || '')
const commentPath = computed(() => route.path.replace(/\/+$/u, '') || '/')

if (post.value) {
	useSeoMeta({
		title: post.value.title,
		ogType: 'article',
		ogImage: post.value.image,
		description: post.value.description,
	})
}
else {
	const event = useRequestEvent()
	event && setResponseStatus(event, 404)
	route.meta.title = '404'
}
</script>

<template>
<template v-if="post">
	<PostHeader v-bind="post" />
	<PostExcerpt v-if="excerpt" :excerpt />
	<div class="article-window">
		<div class="article-window-bar" aria-hidden="true">
			<span class="article-window-dot article-window-dot-close" />
			<span class="article-window-dot article-window-dot-minimize" />
			<span class="article-window-dot article-window-dot-expand" />
		</div>

		<!-- 使用 float-in 动画会导致搜索跳转不准确 -->
		<ContentRenderer
			class="article"
			:class="getPostTypeClassName(post?.type, { prefix: 'md' })"
			:value="post"
			tag="article"
		/>
	</div>

	<PostFooter v-bind="post" />
	<PostSurround />
	<PostComment :path="commentPath" />
</template>

<ZError
	v-else
	icon="line-md:document-delete-twotone"
	title="内容为空或页面不存在"
/>
</template>
