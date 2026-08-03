<template>
<BlogWidget card dim title="GitHub">
	<a
		class="github-link"
		href="https://github.com/flyoko"
		target="_blank"
		rel="noopener noreferrer"
	>
		<Icon name="tabler:brand-github" />
		<span class="title text-creative">flyoko</span>
	</a>
</BlogWidget>
</template>

<style lang="scss" scoped>
.github-link {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	color: inherit;

	> .iconify {
		font-size: 1.8em;
	}

	&:hover > .title {
		background-position: 0 0;
	}
}

.title {
	background-clip: text;
	background-image: linear-gradient(60deg, var(--c-accent) -30%, var(--c-primary), var(--c-text-1));
	background-position: 100% 0;
	background-size: 200%;
	font-size: 1.8em;
	color: transparent;
	transition: background-position 0.2s;
}
</style>
