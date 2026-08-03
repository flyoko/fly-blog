<script setup lang="ts">
import { adminNavigation } from '~/types/admin'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
const adminStore = useAdminStore()

function isActive(to: string) {
	return to === '/admin' ? route.path === to : route.path.startsWith(to)
}
</script>

<template>
<aside class="admin-sidebar" :class="{ 'is-open': open }" aria-label="后台导航">
	<div class="admin-brand">
		<div class="admin-brand-mark" aria-hidden="true">
			f
		</div>
		<div>
			<strong>fly living</strong>
			<span>创作工作台</span>
		</div>
	</div>

	<nav class="admin-navigation">
		<NuxtLink
			v-for="item in adminNavigation"
			:key="item.to"
			:to="item.to"
			class="admin-navigation-item"
			:class="{ 'is-active': isActive(item.to) }"
			@click="emit('close')"
		>
			<Icon :name="item.icon" aria-hidden="true" />
			<span>{{ item.label }}</span>
		</NuxtLink>
	</nav>

	<div class="admin-sidebar-footer">
		<div class="admin-profile">
			<img
				v-if="adminStore.session.user?.avatarUrl"
				:src="adminStore.session.user.avatarUrl"
				alt=""
				width="36"
				height="36"
				decoding="async"
			>
			<div v-else class="admin-profile-fallback" aria-hidden="true">
				f
			</div>
			<div>
				<strong>{{ adminStore.session.user?.login || 'flyoko' }}</strong>
				<span>站点管理员</span>
			</div>
		</div>
		<button class="admin-icon-button" type="button" aria-label="退出登录" title="退出登录" @click="adminStore.logout">
			<Icon name="tabler:logout" />
		</button>
	</div>
</aside>
<button
	v-if="open"
	class="admin-sidebar-backdrop"
	type="button"
	aria-label="关闭导航"
	@click="emit('close')"
/>
</template>
