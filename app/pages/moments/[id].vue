<script setup lang="ts">
import type { MomentDto } from '#shared/admin/moments'

const route = useRoute()
const api = useMomentsApi()
const moment = ref<MomentDto | null>(null)
const loading = ref(true)
const error = ref('')
const id = computed(() => String(route.params.id))

useSeoMeta({
	title: () =>
		moment.value
			? `瞬间 · ${new Date(moment.value.publishedAt || moment.value.createdAt).toLocaleDateString('zh-CN')}`
			: '瞬间',
	description: () =>
		moment.value?.content.slice(0, 120) || 'fly living 的一条瞬间。',
	ogDescription: () =>
		moment.value?.content.slice(0, 120) || 'fly living 的一条瞬间。',
})
useHead(() => ({
	link: [
		{ rel: 'canonical', href: `https://flyovo.cc.cd/moments/${id.value}` },
	],
}))

async function load() {
	loading.value = true
	error.value = ''
	try {
		moment.value = await api.get(id.value)
	}
	catch (cause) {
		error.value = cause instanceof Error ? cause.message : '瞬间不存在'
	}
	finally {
		loading.value = false
	}
}
async function toggleLike() {
	if (moment.value) {
		Object.assign(
			moment.value,
			await api.like(moment.value.id, Boolean(moment.value.liked)),
		)
	}
}
onMounted(load)
</script>

<template>
<div class="mobile-only">
	<BlogHeader to="/moments" />
</div>
<section class="moment-detail-page">
	<h1 class="visually-hidden">
		瞬间详情
	</h1>
	<NuxtLink class="moment-back" to="/moments">
		<Icon name="tabler:arrow-left" />返回瞬间
	</NuxtLink>
	<div v-if="loading" class="moment-detail-loading card">
		正在加载这条瞬间…
	</div>
	<p v-else-if="error" class="moment-detail-loading card">
		{{ error }}
	</p>
	<template v-else-if="moment">
		<MomentCard :moment="moment" detail @like="toggleLike" />
		<PostComment :path="`/moments/${moment.id}`" />
	</template>
</section>
</template>

<style scoped lang="scss">
.moment-detail-page {
	margin: 1rem;
}

.moment-back {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
	margin-bottom: 1rem;
	color: var(--c-text-2);
}

.moment-detail-loading {
	padding: 3rem;
	text-align: center;
	color: var(--c-text-2);
}
</style>
