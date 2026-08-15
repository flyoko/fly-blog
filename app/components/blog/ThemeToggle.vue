<script setup lang="ts">
const appConfig = useAppConfig()
const colorMode = useColorMode()
const themeSwitching = useState<boolean>('theme-compositor-switching', () => false)

const themeSettleMs = 600
let releaseTimer: ReturnType<typeof setTimeout> | undefined
let switchFrame: number | undefined
let pendingPreference: string | undefined

function switchTheme(themeName: string | number) {
	const nextPreference = String(themeName)
	if (colorMode.preference === nextPreference && pendingPreference === undefined)
		return

	if (releaseTimer !== undefined) {
		clearTimeout(releaseTimer)
		releaseTimer = undefined
	}
	if (switchFrame !== undefined)
		cancelAnimationFrame(switchFrame)

	// Freeze the full-screen atmosphere first. Web Animations pause is committed
	// on the next rendering tick in Chromium, so swap the color-mode class only
	// after that frame instead of invalidating animated SVG layers immediately.
	themeSwitching.value = true
	pendingPreference = nextPreference
	switchFrame = requestAnimationFrame(() => {
		colorMode.preference = pendingPreference ?? nextPreference
		pendingPreference = undefined
		switchFrame = undefined
		releaseTimer = setTimeout(() => {
			themeSwitching.value = false
			releaseTimer = undefined
		}, themeSettleMs)
	})
}

onBeforeUnmount(() => {
	if (releaseTimer !== undefined)
		clearTimeout(releaseTimer)
	if (switchFrame !== undefined)
		cancelAnimationFrame(switchFrame)
	pendingPreference = undefined
	themeSwitching.value = false
})
</script>

<template>
<div class="theme-toggle">
	<button
		v-for="(themeData, themeName) in appConfig.themes"
		:key="themeName"
		v-tip="themeData.tip"
		:aria-label="themeData.tip"
		:class="{ active: colorMode.preference === themeName }"
		@click="switchTheme(themeName)"
	>
		<Icon :name="themeData.icon" />
	</button>
</div>
</template>

<style lang="scss" scoped>
.theme-toggle {
	display: flex;
	gap: 3px;
	width: fit-content;
	margin: 0 auto;
	padding: 2px;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--c-bg-2);

	> button {
		padding: 4px 1rem;
		border-radius: 1rem;
		transition: all 0.1s;

		&:hover {
			background-color: var(--c-bg-soft);
			color: var(--c-text-1);
		}

		&.active {
			box-shadow: var(--box-shadow-2);
			background-color: var(--ld-bg-card);
			color: var(--c-text-1);
			cursor: auto;
		}
	}
}
</style>
