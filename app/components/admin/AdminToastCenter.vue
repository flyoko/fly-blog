<script setup lang="ts">
const notifications = useAdminNotifications()

const icons = {
	info: 'tabler:info-circle',
	success: 'tabler:circle-check',
	warning: 'tabler:alert-triangle',
	danger: 'tabler:alert-circle',
} as const
</script>

<template>
<Teleport to="body">
	<section class="admin-toast-region" aria-label="后台通知" aria-live="polite" aria-relevant="additions removals">
		<TransitionGroup name="admin-toast">
			<article v-for="notice in notifications.notices.value" :key="notice.id" class="admin-toast" :data-tone="notice.tone" role="status">
				<Icon :name="icons[notice.tone]" aria-hidden="true" />
				<div>
					<strong>{{ notice.title }}</strong>
					<p v-if="notice.message">
						{{ notice.message }}
					</p>
				</div>
				<button type="button" aria-label="关闭通知" @click="notifications.remove(notice.id)">
					<Icon name="tabler:x" aria-hidden="true" />
				</button>
			</article>
		</TransitionGroup>
	</section>
</Teleport>
</template>
