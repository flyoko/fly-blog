<script setup lang="ts">
const props = withDefaults(defineProps<{
	open: boolean
	title: string
	description: string
	confirmLabel?: string
	verificationText?: string
	busy?: boolean
	danger?: boolean
}>(), {
	confirmLabel: '确认',
	verificationText: '',
	busy: false,
	danger: false,
})

const emit = defineEmits<{
	close: []
	confirm: []
}>()

const verification = ref('')
const input = ref<HTMLInputElement | null>(null)
const canConfirm = computed(() => !props.busy && (!props.verificationText || verification.value === props.verificationText))

watch(() => props.open, async (open) => {
	verification.value = ''
	if (open && props.verificationText) {
		await nextTick()
		input.value?.focus()
	}
})

function submit() {
	if (canConfirm.value)
		emit('confirm')
}
</script>

<template>
<Teleport to="body">
	<div v-if="open" class="admin-modal" role="dialog" aria-modal="true" :aria-labelledby="`${$attrs.id || 'admin-confirm'}-title`">
		<button class="admin-modal-backdrop" type="button" aria-label="取消操作" :disabled="busy" @click="emit('close')" />
		<section class="admin-modal-panel admin-confirm-dialog">
			<div class="admin-confirm-dialog-icon" :data-danger="danger" aria-hidden="true">
				<Icon :name="danger ? 'tabler:alert-triangle' : 'tabler:help-circle'" />
			</div>
			<div class="admin-confirm-dialog-content">
				<h2 :id="`${$attrs.id || 'admin-confirm'}-title`">
					{{ title }}
				</h2>
				<p>{{ description }}</p>
				<label v-if="verificationText" class="admin-field">
					<span>请输入 <strong>{{ verificationText }}</strong> 继续</span>
					<input
						ref="input"
						v-model="verification"
						type="text"
						autocomplete="off"
						:placeholder="verificationText"
						@keyup.enter="submit"
					>
				</label>
			</div>
			<div class="admin-confirm-dialog-actions">
				<button class="admin-button" type="button" :disabled="busy" @click="emit('close')">
					取消
				</button>
				<button
					class="admin-button"
					:class="danger ? 'admin-button-danger-solid' : 'admin-button-primary'"
					type="button"
					:disabled="!canConfirm"
					@click="submit"
				>
					{{ busy ? '处理中…' : confirmLabel }}
				</button>
			</div>
		</section>
	</div>
</Teleport>
</template>
