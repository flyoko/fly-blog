<script setup lang="ts">
const route = useRoute()
const sidebarOpen = ref(false)
const isLogin = computed(() => route.path === '/admin/login')

watch(() => route.fullPath, () => {
	sidebarOpen.value = false
})
</script>

<template>
<div class="admin-app">
	<div v-if="isLogin" class="admin-shell admin-shell-login">
		<slot />
	</div>
	<div v-else class="admin-shell">
		<a class="admin-skip-link" href="#admin-main-content">跳转到主要内容</a>
		<AdminSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
		<div class="admin-main">
			<AdminTopbar @menu="sidebarOpen = true" />
			<main id="admin-main-content" class="admin-content" tabindex="-1">
				<slot />
			</main>
		</div>
	</div>
</div>
</template>
