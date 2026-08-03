<script setup lang="ts">
import { adminNavigation } from '~/types/admin'

const emit = defineEmits<{ menu: [] }>()
const route = useRoute()
const colorMode = useColorMode()

const pageTitle = computed(() => {
	return adminNavigation.find(item => item.to === '/admin'
		? route.path === item.to
		: route.path.startsWith(item.to))?.label ?? '创作工作台'
})

function toggleColorMode() {
	colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
<header class="admin-topbar">
	<div class="admin-topbar-title">
		<button class="admin-icon-button admin-topbar-menu" type="button" aria-label="打开导航" @click="emit('menu')">
			<Icon name="tabler:menu-2" />
		</button>
		<div>
			<span>fly living</span>
			<strong>{{ pageTitle }}</strong>
		</div>
	</div>
	<div class="admin-topbar-actions">
		<a class="admin-icon-button" href="/" target="_blank" rel="noopener" aria-label="查看博客" title="查看博客">
			<Icon name="tabler:external-link" />
		</a>
		<button class="admin-icon-button" type="button" aria-label="切换明暗模式" title="切换明暗模式" @click="toggleColorMode">
			<Icon :name="colorMode.value === 'dark' ? 'tabler:sun' : 'tabler:moon'" />
		</button>
	</div>
</header>
</template>
