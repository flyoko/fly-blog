<script setup lang="ts">
import type { NavItem } from '~/types/nav'

defineProps<{
	list: NavItem[]
}>()
</script>

<template>
<ul class="icon-nav-list">
	<li v-for="{ text, icon, url } in list" :key="text">
		<UtilLink
			v-tip="text"
			:to="url"
			:aria-label="text"
		>
			<Icon :name="icon" />
		</UtilLink>
	</li>
</ul>
</template>

<style lang="scss" scoped>
.icon-nav-list {
	display: flex;
	justify-content: center;
	margin: 0;
	padding: 0;
	list-style: none;

	a {
		padding: 0.5em;
		border-radius: 2em;
		transition: background-color 0.2s;

		&:hover {
			background-color: var(--c-bg-soft);
		}

		.iconify {
			display: block;
		}
	}
}
</style>
