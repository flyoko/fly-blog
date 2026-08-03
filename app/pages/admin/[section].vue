<script setup lang="ts">
import type { AdminUnavailableSection } from '~/types/admin'
import {

	adminUnavailableSections,
} from '~/types/admin'

const route = useRoute()
const section = computed(() => route.params.section as AdminUnavailableSection)
const content = computed(() => adminUnavailableSections[section.value])

if (!content.value)
	throw createError({ statusCode: 404, statusMessage: '后台页面不存在' })

useSeoMeta({
	title: () => content.value?.title ?? '后台',
	robots: 'noindex, nofollow',
})
</script>

<template>
<AdminEmptyState
	v-if="content"
	icon="tabler:tools"
	:title="content.title"
	:description="content.description"
	:badge="`周期 ${content.cycle}`"
>
	<NuxtLink class="admin-button" to="/admin">
		<Icon name="tabler:arrow-left" />
		返回概览
	</NuxtLink>
</AdminEmptyState>
</template>
