<script setup lang="ts">
const emit = defineEmits<{ command: [] }>()
const route = useRoute()

const actions = [
	{ label: '首页', to: '/admin', icon: 'tabler:layout-dashboard' },
	{ label: '写文章', to: '/admin/articles/new', icon: 'tabler:pencil-plus' },
	{ label: '发瞬间', to: '/admin/moments?compose=1', icon: 'tabler:sparkles' },
	{ label: '媒体', to: '/admin/media', icon: 'tabler:photo' },
] as const

function active(to: string) {
	if (to === '/admin')
		return route.path === '/admin'
	return route.path.startsWith(to.split('?')[0]!)
}
</script>

<template>
<nav class="admin-mobile-dock" aria-label="常用后台操作">
	<NuxtLink
		v-for="action in actions"
		:key="action.to"
		:to="action.to"
		:class="{ 'is-active': active(action.to) }"
	>
		<Icon :name="action.icon" aria-hidden="true" />
		<span>{{ action.label }}</span>
	</NuxtLink>
	<button type="button" aria-label="打开更多操作" @click="emit('command')">
		<Icon name="tabler:dots" aria-hidden="true" />
		<span>更多</span>
	</button>
</nav>
</template>
