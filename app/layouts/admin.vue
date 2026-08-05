<script setup lang="ts">
const route = useRoute()
const sidebarOpen = ref(false)
const commandOpen = ref(false)
const isLogin = computed(() => route.path === '/admin/login')
const isArticleEditor = computed(() => /^\/admin\/articles\/[^/]+$/u.test(route.path))

watch(() => route.fullPath, () => {
	sidebarOpen.value = false
	commandOpen.value = false
})

function onGlobalKeydown(event: KeyboardEvent) {
	if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k')
		return
	event.preventDefault()
	commandOpen.value = !commandOpen.value
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
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
			<AdminTopbar @menu="sidebarOpen = true" @command="commandOpen = true" />
			<main
				id="admin-main-content"
				class="admin-content"
				:class="{ 'admin-content-editor': isArticleEditor }"
				tabindex="-1"
			>
				<slot />
			</main>
		</div>
		<AdminMobileDock @command="commandOpen = true" />
		<AdminCommandPalette :open="commandOpen" @close="commandOpen = false" />
	</div>
</div>
</template>
