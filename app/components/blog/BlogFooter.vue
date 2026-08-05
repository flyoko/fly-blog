<script setup lang="ts">
const appConfig = useAppConfig()
</script>

<template>
<footer class="blog-footer">
	<nav class="footer-nav" aria-label="页脚导航">
		<div v-for="(group, groupIndex) in appConfig.footer.nav" :key="groupIndex">
			<h2 class="text-creative" v-text="group.title" />
			<menu>
				<li v-for="(item, itemIndex) in group.items" :key="itemIndex">
					<UtilLink :to="item.url">
						<Icon :name="item.icon" />
						<span class="nav-text">{{ item.text }}</span>
					</UtilLink>
				</li>
			</menu>
		</div>
	</nav>
	<p v-html="appConfig.footer.copyright" />
</footer>
</template>

<style lang="scss" scoped>
.blog-footer {
	margin: 4rem 1rem 2rem;
	padding-top: 1.25rem;
	border-top: 1px solid var(--c-surface-line);
	font-size: 0.88em;
	color: var(--c-text-2);

	.footer-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 2rem clamp(2rem, 5%, 4rem);
		padding-block: 1rem 2.25rem;

		h2 {
			margin: 0.4em 0.55em 0.7em;
			font: inherit;
			font-size: 0.78em;
			letter-spacing: 0.06em;
			color: var(--c-text-1);
		}

		a {
			display: flex;
			align-items: center;
			gap: 0.4em;
			width: fit-content;
			padding: 0.35em 0.55em;
			border: 1px solid transparent;
			border-radius: 0.5rem;
			font-size: 0.9em;
			transition: background-color 0.2s, border-color 0.2s, color 0.2s;

			&:hover {
				border-color: var(--c-surface-line);
				background-color: var(--c-surface-fill);
				color: var(--c-text);
			}
		}
	}

	p {
		margin: 0.5em;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: $breakpoint-phone) {
		margin: 2.75rem 0.75rem 1rem;

		.footer-nav {
			gap: 1rem 1.5rem;
			padding-block: 0.5rem 1.5rem;

			a {
				min-height: var(--touch-target);
				padding: 0.55rem 0.65rem;
			}
		}
	}
}
</style>
