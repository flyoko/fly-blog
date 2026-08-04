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
.scene-profile-avatar {
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
	overflow: hidden;
	border: 1px solid color-mix(in srgb, var(--c-primary) 28%, var(--c-border));
	border-radius: 36%;
	box-shadow: var(--box-shadow-3);
	background: color-mix(in srgb, var(--c-surface-fill) 86%, transparent);
	animation: shinchan-profile-float 4.6s cubic-bezier(0.45, 0, 0.2, 1) infinite;
	z-index: 1;
}

.scene-profile-avatar img {
	display: block;
	width: 100%;
	height: 100%;
	transform: scale(1.35);
	object-fit: cover;
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
	right: 5%;
	bottom: -2%;
	width: clamp(8rem, 20vw, 13rem);
	aspect-ratio: 390 / 333;
}

.is-about.has-custom-character .scene-character {
	right: clamp(0.35rem, 2vw, 1.25rem);
	bottom: -5%;
	width: clamp(5.6rem, 11vw, 7.8rem);
	z-index: 2;
}

.is-about.has-custom-character .scene-profile-avatar {
	top: 50%;
	right: clamp(1.5rem, 7vw, 5rem);
	width: clamp(7.5rem, 15vw, 10rem);
	aspect-ratio: 1;
}

.is-about::before {
	content: "";
	position: absolute;
	right: 3%;
	bottom: -20%;
	width: clamp(10rem, 24vw, 16rem);
	aspect-ratio: 1;
	border-radius: 42%;
	box-shadow: inset 0 1px 0 rgb(255 255 255 / 38%), 0 22px 48px rgb(44 93 194 / 22%);
	background: linear-gradient(145deg, #3B86FF, #294FCD);
	animation: shinchan-blob 5s ease-in-out infinite alternate;
}

.is-about .scene-speech {
	top: 16%;
	right: 28%;
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

@keyframes shinchan-blob {
	from {
		border-radius: 42% 44% 40% 48%;
		transform: rotate(-3deg) scale(0.96);
	}

	to {
		border-radius: 47% 39% 48% 41%;
		transform: rotate(3deg) scale(1.04);
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
		right: 2%;
		bottom: 0;
		width: 6.2rem;
	}

	.is-about.has-custom-character .scene-character {
		right: -0.2rem;
		bottom: -0.4rem;
		width: 4.8rem;
	}

	.is-about.has-custom-character .scene-profile-avatar {
		--profile-base-y: 0px;

		top: auto;
		right: 1.25rem;
		bottom: 1.25rem;
		width: 6rem;
	}

	.is-about::before {
		right: -1%;
		bottom: -7%;
		width: 7.6rem;
	}

	.is-about .scene-speech {
		top: auto;
		right: 24%;
		bottom: 10%;
		font-size: 0.58rem;
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
	.shinchan-scene.is-about::before {
		animation: none;
	}
}
</style>
