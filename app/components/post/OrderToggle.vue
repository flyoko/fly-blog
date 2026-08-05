<script setup lang="ts">
import type { ArticleOrderType } from '~/types/article'

type HideDropdown = (restoreFocus?: boolean) => void

const props = defineProps<{
	// 强制允许或禁止升序
	enableAscending?: boolean
	disableAscending?: boolean
	categories?: string[]
	category?: string
	sortOrder?: ArticleOrderType
	isAscending?: boolean
	secretDelay?: string
}>()

const emit = defineEmits<{
	'update:category': [value: string | undefined]
	'update:sortOrder': [value: ArticleOrderType]
	'update:isAscending': [value: boolean]
}>()

const appConfig = useAppConfig()
const orderMap = computed(() => appConfig.article.order)
const orderEntries = computed(() => Object.entries(orderMap.value) as [ArticleOrderType, string][])
const currentOrder = computed<ArticleOrderType>(() => props.sortOrder ?? 'date')
const currentAscending = computed(() => props.isAscending ?? false)
// 配置文件中允许升序时，且未明确禁用升序时，允许升序
const allowAscending = computed(() => appConfig.pagination.allowAscending ? !props.disableAscending : props.enableAscending)
const directionText = computed(() => currentAscending.value ? '最早优先' : '最新优先')
const directionAction = computed(() => currentAscending.value ? '切换为最新优先' : '切换为最早优先')

function selectCategory(value: string | undefined, hide: HideDropdown) {
	emit('update:category', value)
	hide()
}

function selectOrder(value: ArticleOrderType, hide: HideDropdown) {
	emit('update:sortOrder', value)
	hide()
}

function toggleDirection() {
	if (!allowAscending.value)
		return
	emit('update:isAscending', !currentAscending.value)
}
</script>

<template>
<div class="order-toggle" :style="{ '--secret-delay': props.secretDelay }">
	<slot />

	<ZDropdown :disabled="!props.categories?.length">
		<Icon :name="getCategoryIcon(props.category)" />
		<span class="order-text">{{ props.category ?? '全部分类' }}</span>

		<template #content="{ hide }">
			<button type="button" :class="{ active: !props.category }" @click="selectCategory(undefined, hide)">
				<Icon :name="getCategoryIcon()" />
				<span>全部分类</span>
			</button>

			<button
				v-for="item in props.categories"
				:key="item"
				type="button"
				:class="{ active: item === props.category }"
				@click="selectCategory(item, hide)"
			>
				<Icon :name="getCategoryIcon(item)" />
				<span>{{ item }}</span>
			</button>
		</template>
	</ZDropdown>

	<span class="sort-controls">
		<button
			v-if="allowAscending"
			type="button"
			:aria-label="directionAction"
			:title="directionAction"
			@click="toggleDirection"
		>
			<Icon name="tabler:sort-descending" class="toggle-direction" :class="{ ascending: currentAscending }" />
		</button>

		<ZDropdown>
			<Icon v-if="!allowAscending" name="tabler:sort-descending" />
			<span class="order-text">{{ orderMap[currentOrder] || currentOrder }} · {{ directionText }}</span>

			<template #content="{ hide }">
				<button
					v-for="[order, label] in orderEntries"
					:key="order"
					type="button"
					:class="{ active: order === currentOrder }"
					@click="selectOrder(order, hide)"
				>
					<Icon :name="order === 'date' ? 'tabler:calendar-plus' : 'tabler:calendar-time'" />
					<span>{{ label }}</span>
				</button>
			</template>
		</ZDropdown>
	</span>
</div>
</template>

<style lang="scss" scoped>
.order-toggle {
	display: flex;
	align-items: center;
	gap: 1rem;
	color: var(--c-text-2);

	:deep(button), :deep(a) {
		transition: color 0.2s;

		&:hover {
			color: var(--c-primary);
		}
	}

	.toggle-direction {
		display: inline-block;
		margin-inline-end: 0.1em;
		transition: transform 0.2s;

		&.ascending {
			transform: scaleY(-1);
		}
	}
}

.sort-controls {
	display: inline-flex;
	align-items: center;
	gap: 0.2rem;
}

:deep(.secret-container) {
	margin-inline-end: auto;
}

.iconify + span {
	margin-inline-start: 0.2em;
}

@media (max-width: $breakpoint-phone) {
	.order-toggle {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.5rem;
		width: 100%;
	}

	.sort-controls {
		justify-self: end;
		min-width: 0;

		> button {
			display: grid;
			place-items: center;
			width: var(--touch-target);
			height: var(--touch-target);
			min-width: var(--touch-target);
			padding: 0;
			border-radius: var(--interactive-radius);
		}
	}

	.order-text {
		overflow: hidden;
		max-width: min(10rem, 42vw);
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	:deep(.secret-container) {
		grid-column: 1 / -1;
	}
}
</style>
