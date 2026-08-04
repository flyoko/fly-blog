<script setup lang="ts">
withDefaults(defineProps<{
	variant?: 'header' | 'moments' | 'about'
	speech?: string
	characterSrc?: string
}>(), {
	variant: 'moments',
	speech: '',
})
</script>

<template>
<div class="shinchan-scene" :class="[`is-${variant}`, { 'has-custom-character': characterSrc }]" aria-hidden="true">
	<span class="scene-orbit scene-orbit-one" />
	<span class="scene-orbit scene-orbit-two" />
	<span class="scene-track" />
	<span v-if="variant === 'about'" class="scene-planet" />
	<span class="scene-spark scene-spark-one">✦</span>
	<span class="scene-spark scene-spark-two">✦</span>
	<span class="scene-spark scene-spark-three">·</span>
	<span v-if="variant === 'header'" class="scene-rocket">🚀</span>
	<span v-if="speech" class="scene-speech">{{ speech }}</span>
	<span class="scene-character">
		<img
			src="/assets/shinchan-user-cutout.webp"
			alt=""
			width="390"
			height="333"
			draggable="false"
			decoding="async"
		>
	</span>
	<span v-if="characterSrc" class="scene-profile-avatar">
		<img
			:src="characterSrc"
			alt=""
			width="160"
			height="160"
			draggable="false"
			decoding="async"
		>
		<span class="scene-profile-badge">✦</span>
	</span>
</div>
</template>

<style scoped lang="scss">
.shinchan-scene {
	display: block;
	position: absolute;
	overflow: hidden;
	inset: 0;
	border-radius: inherit;
	pointer-events: none;
	z-index: 0;
}

:global(.light .shinchan-scene) {
	opacity: 0.84;
}

:global(.dark .shinchan-scene) {
	opacity: 0.92;
}

:global(.dynamic .shinchan-scene) {
	opacity: 1;
}

.scene-orbit,
.scene-track,
.scene-spark,
.scene-rocket,
.scene-speech,
.scene-character,
.scene-profile-avatar,
.scene-planet {
	position: absolute;
	will-change: transform, opacity;
}

.scene-orbit {
	border: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent);
	border-radius: 50%;
	animation: shinchan-orbit 10s linear infinite;
}

.scene-orbit-one {
	inset: 13% 3% 3% 42%;
}

.scene-orbit-two {
	inset: 24% -8% -18% 55%;
	border-style: dashed;
	animation-direction: reverse;
	animation-duration: 15s;
}

.scene-track {
	top: 34%;
	right: -8%;
	width: 58%;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--c-flow-blue), transparent);
	transform: rotate(-12deg);
	animation: shinchan-track 3.8s ease-in-out infinite alternate;
}

.scene-spark {
	color: color-mix(in srgb, var(--c-primary) 62%, white);
	animation: shinchan-spark 2.8s ease-in-out infinite;
}

.scene-spark-one {
	top: 13%;
	right: 7%;
}

.scene-spark-two {
	right: 29%;
	bottom: 13%;
	animation-delay: -1.2s;
}

.scene-spark-three {
	top: 28%;
	right: 40%;
	animation-delay: -2s;
}

.scene-character {
	display: block;
	transform: translate3d(var(--scene-shift-x, 0), var(--scene-shift-y, 0), 0);
	transform-origin: 54% 88%;
	animation: shinchan-bob 3.9s cubic-bezier(0.45, 0, 0.2, 1) infinite;
	filter: drop-shadow(0 16px 26px rgb(28 61 120 / 18%));
}

.scene-character img {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.scene-profile-avatar {
	--profile-base-y: -50%;

	display: block;
	overflow: visible;
	padding: 0.42rem;
	border: 1px solid color-mix(in srgb, var(--c-primary) 48%, white 12%);
	border-radius: 50%;
	box-shadow:
		inset 0 0 0 0.55rem color-mix(in srgb, var(--c-surface-fill) 72%, transparent),
		inset 0 1px 0 rgb(255 255 255 / 34%),
		0 0 0 0.65rem color-mix(in srgb, var(--c-primary) 10%, transparent),
		0 1.25rem 3rem rgb(15 43 105 / 24%);
	background:
		radial-gradient(circle at 32% 22%, rgb(255 255 255 / 20%), transparent 34%),
		color-mix(in srgb, var(--c-surface-fill) 76%, transparent);
	backdrop-filter: blur(12px) saturate(1.12);
	animation: shinchan-profile-float 4.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
	z-index: 4;
}

.scene-profile-avatar img {
	display: block;
	width: 100%;
	height: 100%;
	border-radius: inherit;
	transform: scale(0.94);
	object-fit: contain;
}

.scene-profile-avatar::before {
	content: "";
	position: absolute;
	inset: 10%;
	border: 1px solid rgb(255 255 255 / 18%);
	border-radius: inherit;
	pointer-events: none;
}

.scene-profile-badge {
	display: grid;
	place-items: center;
	position: absolute;
	top: 5%;
	right: 2%;
	width: 1.8rem;
	aspect-ratio: 1;
	border: 1px solid color-mix(in srgb, var(--c-primary) 44%, white 14%);
	border-radius: 50%;
	box-shadow: 0 0 1rem color-mix(in srgb, var(--c-primary) 28%, transparent);
	background: color-mix(in srgb, var(--c-surface-fill) 78%, transparent);
	font-size: 0.75rem;
	color: color-mix(in srgb, var(--c-primary) 70%, white);
}

.scene-planet {
	right: -6%;
	bottom: -74%;
	width: clamp(19rem, 40vw, 31rem);
	aspect-ratio: 1;
	border: 1px solid color-mix(in srgb, var(--c-primary) 42%, white 8%);
	border-radius: 50%;
	box-shadow:
		inset 0 1.1rem 2.5rem rgb(255 255 255 / 16%),
		inset 0 -2rem 4rem rgb(20 53 150 / 28%),
		0 0 3rem color-mix(in srgb, var(--c-flow-blue) 32%, transparent);
	background:
		radial-gradient(circle at 35% 14%, rgb(255 255 255 / 28%), transparent 22%),
		linear-gradient(155deg, color-mix(in srgb, var(--c-flow-blue) 88%, white 6%), color-mix(in srgb, var(--c-primary) 82%, #15378F));
	animation: shinchan-planet-breathe 6.8s ease-in-out infinite;
	z-index: 2;
}

.scene-planet::before {
	content: "";
	position: absolute;
	opacity: 0.7;
	inset: -8%;
	border: 1px solid color-mix(in srgb, var(--c-primary) 24%, transparent);
	border-radius: inherit;
}

.scene-speech {
	padding: 0.42rem 0.68rem;
	border: 1px solid color-mix(in srgb, var(--c-text) 22%, transparent);
	border-radius: 0.75rem 0.75rem 0.2rem;
	box-shadow: 0 8px 18px rgb(40 72 125 / 12%);
	background: color-mix(in srgb, var(--ld-bg-card) 88%, transparent);
	font-size: 0.68rem;
	color: var(--c-text-1);
	animation: shinchan-speech 4.4s ease-in-out infinite;
}

.is-header .scene-character {
	right: -0.55rem;
	bottom: -1rem;
	width: 5.7rem;
	aspect-ratio: 390 / 333;
	animation-name: shinchan-peek;
}

.is-header .scene-orbit-one {
	inset: 4% -10% -28% 52%;
}

.is-header .scene-orbit-two {
	inset: -22% 14% 22% 30%;
}

.is-header .scene-track {
	top: 24%;
	right: -4%;
	width: 68%;
}

.is-header .scene-rocket {
	top: 12%;
	right: 36%;
	font-size: 1.05rem;
	animation: shinchan-rocket 4.8s ease-in-out infinite;
}

.is-header .scene-spark-one {
	top: 62%;
	right: 45%;
}

.is-moments .scene-character {
	right: 1%;
	bottom: -10%;
	width: clamp(9.5rem, 23vw, 15rem);
	aspect-ratio: 390 / 333;
}

.is-moments .scene-speech {
	top: 17%;
	right: 24%;
}

.is-about .scene-character {
	right: 2.2%;
	bottom: -8%;
	width: clamp(7rem, 14vw, 9.5rem);
	aspect-ratio: 390 / 333;
	z-index: 3;
}

.is-about.has-custom-character .scene-character {
	right: 1.8%;
	bottom: -8%;
	width: clamp(6.8rem, 13vw, 9rem);
}

.is-about.has-custom-character .scene-profile-avatar {
	top: 42%;
	right: clamp(6.5rem, 16vw, 11rem);
	width: clamp(7rem, 14vw, 9.5rem);
	aspect-ratio: 1;
}

.is-about .scene-orbit-one {
	inset: -24% -12% -42% 48%;
	border-color: color-mix(in srgb, var(--c-primary) 24%, transparent);
}

.is-about .scene-orbit-two {
	inset: 2% -18% -50% 55%;
	border-color: color-mix(in srgb, var(--c-primary) 36%, transparent);
}

.is-about .scene-track {
	opacity: 0.66;
	top: 40%;
	right: -2%;
	width: 47%;
}

.is-about .scene-spark-one {
	top: 11%;
	right: 7%;
}

.is-about .scene-spark-two {
	right: 30%;
	bottom: 18%;
}

.is-about .scene-spark-three {
	top: 52%;
	right: 43%;
}

@keyframes shinchan-orbit {
	to { transform: rotate(1turn); }
}

@keyframes shinchan-track {
	from {
		opacity: 0.32;
		transform: translateX(-5%) rotate(-12deg);
	}

	to {
		opacity: 0.85;
		transform: translateX(7%) rotate(-8deg);
	}
}

@keyframes shinchan-spark {
	0%, 100% {
		opacity: 0.25;
		transform: scale(0.72) rotate(0deg);
	}

	48% {
		opacity: 1;
		transform: scale(1.25) rotate(38deg);
	}
}

@keyframes shinchan-bob {
	0%, 100% { transform: translate3d(var(--scene-shift-x, 0), var(--scene-shift-y, 0), 0) rotate(-1deg); }
	50% { transform: translate3d(var(--scene-shift-x, 0), calc(var(--scene-shift-y, 0) - 7px), 0) rotate(1.5deg); }
}

@keyframes shinchan-peek {
	0%, 100% { transform: translate3d(var(--scene-shift-x, 0), 10%, 0) rotate(-2deg); }
	45% { transform: translate3d(var(--scene-shift-x, 0), -2%, 0) rotate(1deg); }
	70% { transform: translate3d(var(--scene-shift-x, 0), 1%, 0) rotate(-1deg); }
}

@keyframes shinchan-rocket {
	0%, 100% {
		opacity: 0.48;
		transform: translate3d(-8px, 8px, 0) rotate(-18deg);
	}

	50% {
		opacity: 1;
		transform: translate3d(12px, -10px, 0) rotate(-8deg);
	}
}

@keyframes shinchan-speech {
	0%, 20%, 100% {
		opacity: 0;
		transform: translateY(5px) scale(0.92);
	}

	34%, 74% {
		opacity: 1;
		transform: translateY(0) scale(1);
	}
}

@keyframes shinchan-profile-float {
	0%, 100% {
		transform: translate3d(var(--scene-shift-x, 0), calc(var(--profile-base-y) + 2px), 0) rotate(-1deg);
	}

	50% {
		transform: translate3d(var(--scene-shift-x, 0), calc(var(--profile-base-y) - 6px), 0) rotate(1deg);
	}
}

@keyframes shinchan-planet-breathe {
	0%, 100% {
		transform: translateY(0) scale(0.985);
	}

	50% {
		transform: translateY(-4px) scale(1.015);
	}
}

@media (max-width: 600px) {
	.is-moments .scene-character {
		right: -5%;
		bottom: -6%;
		width: 9.2rem;
	}

	.is-moments .scene-speech {
		top: auto;
		right: 29%;
		bottom: 12%;
	}

	.is-about .scene-character {
		right: -0.25rem;
		bottom: -0.5rem;
		width: 5rem;
	}

	.is-about.has-custom-character .scene-profile-avatar {
		--profile-base-y: 0px;

		top: auto;
		right: 5.2rem;
		bottom: 3.6rem;
		width: 5.8rem;
	}

	.is-about .scene-planet {
		right: -13%;
		bottom: -46%;
		width: 13rem;
	}

	.is-about .scene-orbit-one {
		inset: 38% -24% -35% 30%;
	}

	.is-about .scene-orbit-two {
		inset: 46% -40% -52% 44%;
	}
}

@media (prefers-reduced-motion: reduce) {
	.shinchan-scene .scene-orbit,
	.shinchan-scene .scene-track,
	.shinchan-scene .scene-spark,
	.shinchan-scene .scene-rocket,
	.shinchan-scene .scene-speech,
	.shinchan-scene .scene-character,
	.shinchan-scene .scene-profile-avatar,
	.shinchan-scene .scene-planet {
		animation: none;
	}
}
</style>
