<script setup lang="ts">
const props = withDefaults(defineProps<{
	variant?: 'header' | 'moments' | 'about'
	speech?: string
	characterSrc?: string
	portraitSrc?: string
}>(), {
	variant: 'moments',
	speech: '',
})

const avatarFailed = ref(false)
const profileImageSrc = computed(() => props.portraitSrc || props.characterSrc || '')

watch(() => profileImageSrc.value, () => {
	avatarFailed.value = false
})
</script>

<template>
<div
	class="shinchan-scene"
	:class="[`is-${variant}`, { 'has-custom-character': characterSrc && !avatarFailed }]"
	aria-hidden="true"
>
	<span v-if="variant === 'about'" class="scene-atmosphere" />
	<span class="scene-orbit scene-orbit-one" />
	<span class="scene-orbit scene-orbit-two" />
	<span class="scene-track" />
	<span v-if="variant === 'about'" class="scene-planet">
		<span class="scene-planet-light" />
	</span>
	<span v-if="variant === 'about'" class="scene-avatar-tether" />
	<span class="scene-spark scene-spark-one">✦</span>
	<span class="scene-spark scene-spark-two">✦</span>
	<span class="scene-spark scene-spark-three">·</span>
	<span v-if="variant === 'about'" class="scene-heart">♥</span>
	<span v-if="variant === 'about'" class="scene-ripple" />
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
	<span v-if="profileImageSrc && !avatarFailed" class="scene-profile-avatar">
		<span class="scene-profile-halo" />
		<img
			:src="profileImageSrc"
			alt=""
			width="160"
			height="160"
			draggable="false"
			loading="eager"
			fetchpriority="high"
			decoding="async"
			@error="avatarFailed = true"
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

.scene-atmosphere,
.scene-orbit,
.scene-track,
.scene-spark,
.scene-rocket,
.scene-speech,
.scene-character,
.scene-profile-avatar,
.scene-planet,
.scene-avatar-tether,
.scene-heart,
.scene-ripple {
	position: absolute;
	will-change: transform, opacity;
}

.scene-atmosphere {
	inset: 0 0 0 44%;
	background:
		radial-gradient(circle at 69% 36%, color-mix(in srgb, var(--c-primary) 24%, transparent), transparent 26%),
		radial-gradient(circle at 82% 76%, color-mix(in srgb, var(--c-flow-blue) 22%, transparent), transparent 42%);
	mask-image: linear-gradient(90deg, transparent, black 28%);
	animation: shinchan-atmosphere 7s ease-in-out infinite;
}

.scene-orbit {
	border: 1px solid color-mix(in srgb, var(--c-primary) 34%, transparent);
	border-radius: 50%;
	transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0);
	animation: shinchan-orbit 11s linear infinite;
}

.scene-orbit::after {
	content: "";
	position: absolute;
	top: -0.2rem;
	left: 48%;
	width: 0.42rem;
	aspect-ratio: 1;
	border-radius: 50%;
	box-shadow:
		0 0 0 0.22rem color-mix(in srgb, var(--c-primary) 12%, transparent),
		0 0 1rem color-mix(in srgb, var(--c-primary) 72%, transparent);
	background: color-mix(in srgb, var(--c-primary) 78%, white);
}

.scene-orbit-one {
	inset: 13% 3% 3% 42%;
}

.scene-orbit-two {
	inset: 24% -8% -18% 55%;
	border-style: dashed;
	animation-direction: reverse;
	animation-duration: 16s;
}

.scene-track {
	top: 34%;
	right: -8%;
	width: 58%;
	height: 1px;
	background: linear-gradient(90deg, transparent, var(--c-flow-blue), transparent);
	transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(-12deg);
	animation: shinchan-track 4.2s ease-in-out infinite alternate;
}

.scene-spark {
	color: color-mix(in srgb, var(--c-primary) 66%, white);
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
	transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), var(--scene-character-y, var(--scene-shift-y, 0)), 0);
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
	border: 1px solid color-mix(in srgb, var(--c-primary) 56%, white 16%);
	border-radius: 50%;
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 55%),
		inset 0 -1px 0 color-mix(in srgb, var(--c-primary) 20%, transparent),
		0 0 0 0.55rem color-mix(in srgb, var(--c-primary) 9%, transparent),
		0 1.4rem 3.2rem rgb(15 43 105 / 22%);
	background: color-mix(in srgb, var(--c-surface-fill) 32%, transparent);
	backdrop-filter: blur(12px) saturate(1.12);
	animation: shinchan-profile-float 4.8s cubic-bezier(0.45, 0, 0.2, 1) infinite;
	z-index: 5;
}

.scene-profile-avatar::before {
	content: "";
	position: absolute;
	inset: 0.42rem;
	border: 1px solid rgb(255 255 255 / 34%);
	border-radius: inherit;
	box-shadow: inset 0 0 1.2rem rgb(255 255 255 / 12%);
	pointer-events: none;
	z-index: 3;
}

.scene-profile-avatar img {
	display: block;
	position: absolute;
	inset: 0.48rem;
	width: calc(100% - 0.96rem);
	height: calc(100% - 0.96rem);
	border-radius: 50%;
	box-shadow: 0 0.65rem 1.6rem rgb(18 45 96 / 18%);
	background: var(--ld-bg-card);
	object-fit: cover;
	object-position: center;
	z-index: 2;
}

.scene-profile-halo {
	position: absolute;
	inset: -16%;
	border: 1px solid color-mix(in srgb, var(--c-primary) 28%, transparent);
	border-radius: inherit;
	box-shadow: 0 0 2rem color-mix(in srgb, var(--c-primary) 14%, transparent);
	animation: shinchan-profile-halo 3.8s ease-out infinite;
	z-index: -1;
}

.scene-profile-badge {
	display: grid;
	place-items: center;
	position: absolute;
	top: 2%;
	right: -4%;
	width: 1.85rem;
	aspect-ratio: 1;
	border: 1px solid color-mix(in srgb, var(--c-primary) 52%, white 18%);
	border-radius: 50%;
	box-shadow: 0 0 1rem color-mix(in srgb, var(--c-primary) 30%, transparent);
	background: color-mix(in srgb, var(--c-surface-fill) 72%, transparent);
	font-size: 0.72rem;
	color: color-mix(in srgb, var(--c-primary) 72%, white);
	animation: shinchan-badge 3.2s ease-in-out infinite;
	z-index: 6;
}

.scene-planet {
	right: -3%;
	bottom: -64%;
	width: clamp(18rem, 30vw, 23rem);
	aspect-ratio: 1;
	border: 1px solid color-mix(in srgb, var(--c-primary) 50%, white 10%);
	border-radius: 50%;
	box-shadow:
		inset 0 1.2rem 2.6rem rgb(255 255 255 / 18%),
		inset 0 -2.4rem 5rem rgb(18 47 140 / 34%),
		0 0 3.8rem color-mix(in srgb, var(--c-flow-blue) 34%, transparent);
	background:
		radial-gradient(circle at 32% 13%, rgb(255 255 255 / 28%), transparent 18%),
		linear-gradient(155deg, color-mix(in srgb, var(--c-flow-blue) 84%, white 7%), color-mix(in srgb, var(--c-primary) 82%, #15378F));
	transform: translate3d(var(--scene-planet-x, 0), var(--scene-planet-y, 0), 0);
	animation: shinchan-planet-breathe 7.2s ease-in-out infinite;
	z-index: 2;
}

.scene-planet::before {
	content: "";
	position: absolute;
	inset: -4%;
	border: 1px solid color-mix(in srgb, var(--c-primary) 26%, transparent);
	border-radius: inherit;
	box-shadow: 0 -0.25rem 1.4rem color-mix(in srgb, var(--c-primary) 24%, transparent);
}

.scene-planet-light {
	position: absolute;
	inset: -1%;
	border-radius: inherit;
	background: linear-gradient(112deg, transparent 20%, rgb(255 255 255 / 16%) 47%, transparent 68%);
	mask-image: linear-gradient(to bottom, black 0 35%, transparent 64%);
	animation: shinchan-planet-light 5.4s ease-in-out infinite;
}

.scene-avatar-tether {
	opacity: 0.62;
	top: 46%;
	right: 14%;
	width: 19%;
	height: 1px;
	background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--c-primary) 68%, white), transparent);
	transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(22deg);
	transform-origin: right center;
	animation: shinchan-tether 3.6s ease-in-out infinite;
	z-index: 3;
}

.scene-heart {
	right: 4.8%;
	bottom: 28%;
	font-size: 0.78rem;
	color: color-mix(in srgb, #FF5C8A 82%, white);
	animation: shinchan-heart 3.2s ease-in-out infinite;
	z-index: 5;
}

.scene-ripple {
	opacity: 0;
	right: 10%;
	bottom: 10%;
	width: 3.2rem;
	aspect-ratio: 1;
	border: 1px solid color-mix(in srgb, var(--c-primary) 30%, transparent);
	border-radius: 50%;
	z-index: 1;
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
	right: 3.5%;
	bottom: -2.4rem;
	width: clamp(5.8rem, 10vw, 7.1rem);
	aspect-ratio: 390 / 333;
	clip-path: inset(0 0 17% 0);
	animation-name: shinchan-peek-about;
	z-index: 4;
}

.is-about.has-custom-character .scene-profile-avatar {
	top: 43%;
	right: clamp(6.5rem, 14vw, 10rem);
	width: clamp(7.5rem, 13vw, 9.8rem);
	aspect-ratio: 1;
}

.is-about .scene-orbit-one {
	inset: -18% -4% -34% 50%;
	border-color: color-mix(in srgb, var(--c-primary) 35%, transparent);
}

.is-about .scene-orbit-two {
	inset: 8% -11% -42% 58%;
	border-color: color-mix(in srgb, var(--c-primary) 44%, transparent);
}

.is-about .scene-track {
	opacity: 0.74;
	top: 42%;
	right: 0;
	width: 45%;
}

.is-about .scene-spark-one {
	top: 12%;
	right: 7%;
}

.is-about .scene-spark-two {
	right: 29%;
	bottom: 19%;
}

.is-about .scene-spark-three {
	top: 54%;
	right: 43%;
}

.is-about .scene-orbit::after {
	animation: shinchan-node-pulse 2.4s ease-in-out infinite;
}

@keyframes shinchan-orbit {
	from { transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(0); }
	to { transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(1turn); }
}

@keyframes shinchan-track {
	from {
		opacity: 0.32;
		transform: translate3d(calc(var(--scene-orbit-x, 0) - 5%), var(--scene-orbit-y, 0), 0) rotate(-12deg);
	}

	to {
		opacity: 0.9;
		transform: translate3d(calc(var(--scene-orbit-x, 0) + 7%), var(--scene-orbit-y, 0), 0) rotate(-8deg);
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
	0%, 100% { transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), var(--scene-character-y, var(--scene-shift-y, 0)), 0) rotate(-1deg); }
	50% { transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), calc(var(--scene-character-y, var(--scene-shift-y, 0)) - 7px), 0) rotate(1.5deg); }
}

@keyframes shinchan-peek {
	0%, 100% { transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), 10%, 0) rotate(-2deg); }
	45% { transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), -2%, 0) rotate(1deg); }
	70% { transform: translate3d(var(--scene-character-x, var(--scene-shift-x, 0)), 1%, 0) rotate(-1deg); }
}

@keyframes shinchan-peek-about {
	0%, 100% { transform: translate3d(var(--scene-character-x, 0), calc(var(--scene-character-y, 0) + 9px), 0) rotate(-1.5deg); }
	42% { transform: translate3d(var(--scene-character-x, 0), calc(var(--scene-character-y, 0) - 4px), 0) rotate(1deg); }
	68% { transform: translate3d(var(--scene-character-x, 0), calc(var(--scene-character-y, 0) - 1px), 0) rotate(-0.5deg); }
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
		transform: translate3d(var(--scene-avatar-x, 0), calc(var(--profile-base-y) + var(--scene-avatar-y, 0) + 2px), 0) rotate(-0.8deg);
	}

	50% {
		transform: translate3d(var(--scene-avatar-x, 0), calc(var(--profile-base-y) + var(--scene-avatar-y, 0) - 6px), 0) rotate(0.8deg);
	}
}

@keyframes shinchan-profile-halo {
	0%, 100% {
		opacity: 0.24;
		transform: scale(0.92);
	}

	55% {
		opacity: 0.72;
		transform: scale(1.05);
	}
}

@keyframes shinchan-badge {
	0%, 100% {
		transform: translateY(0) rotate(0);
	}

	50% {
		transform: translateY(-3px) rotate(18deg);
	}
}

@keyframes shinchan-planet-breathe {
	0%, 100% {
		transform: translate3d(var(--scene-planet-x, 0), var(--scene-planet-y, 0), 0) scale(0.992);
	}

	50% {
		transform: translate3d(var(--scene-planet-x, 0), calc(var(--scene-planet-y, 0) - 3px), 0) scale(1.008);
	}
}

@keyframes shinchan-planet-light {
	0%, 100% {
		opacity: 0.18;
		transform: translateX(-14%) rotate(-4deg);
	}

	50% {
		opacity: 0.58;
		transform: translateX(12%) rotate(2deg);
	}
}

@keyframes shinchan-tether {
	0%, 100% {
		opacity: 0.32;
		transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(22deg) scaleX(0.82);
	}

	50% {
		opacity: 0.8;
		transform: translate3d(var(--scene-orbit-x, 0), var(--scene-orbit-y, 0), 0) rotate(22deg) scaleX(1);
	}
}

@keyframes shinchan-heart {
	0%, 100% {
		opacity: 0.35;
		transform: translateY(4px) scale(0.8) rotate(-8deg);
	}

	50% {
		opacity: 1;
		transform: translateY(-4px) scale(1.08) rotate(6deg);
	}
}

@keyframes shinchan-atmosphere {
	0%, 100% {
		opacity: 0.55;
		transform: translateX(-1.5%);
	}

	50% {
		opacity: 0.94;
		transform: translateX(1.5%);
	}
}

@keyframes shinchan-node-pulse {
	0%, 100% {
		box-shadow:
			0 0 0 0.18rem color-mix(in srgb, var(--c-primary) 10%, transparent),
			0 0 0.7rem color-mix(in srgb, var(--c-primary) 58%, transparent);
	}

	50% {
		box-shadow:
			0 0 0 0.36rem color-mix(in srgb, var(--c-primary) 14%, transparent),
			0 0 1.25rem color-mix(in srgb, var(--c-primary) 78%, transparent);
	}
}

@keyframes shinchan-click-ripple {
	0% {
		opacity: 0.7;
		transform: scale(0.4);
	}

	100% {
		opacity: 0;
		transform: scale(2.6);
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

	.is-about .scene-atmosphere {
		inset: 43% 0 0;
		mask-image: linear-gradient(to bottom, transparent, black 26%);
	}

	.is-about .scene-character {
		right: 0.65rem;
		bottom: -1.5rem;
		width: 5.3rem;
	}

	.is-about.has-custom-character .scene-profile-avatar {
		--profile-base-y: 0px;

		top: auto;
		right: 5.7rem;
		bottom: 3.8rem;
		width: 6.1rem;
	}

	.is-about .scene-planet {
		right: -18%;
		bottom: -32%;
		width: 14.5rem;
	}

	.is-about .scene-orbit-one {
		inset: 43% -20% -35% 27%;
	}

	.is-about .scene-orbit-two {
		inset: 49% -38% -52% 43%;
	}

	.is-about .scene-track {
		top: 68%;
		right: -6%;
		width: 69%;
	}

	.is-about .scene-avatar-tether {
		top: auto;
		right: 25%;
		bottom: 34%;
		width: 24%;
	}

	.is-about .scene-heart {
		right: 4.5%;
		bottom: 30%;
	}
}

@media (prefers-reduced-transparency: reduce) {
	.scene-profile-avatar {
		background: var(--ld-bg-card);
		backdrop-filter: none;
	}
}

@media (prefers-reduced-motion: reduce) {
	.shinchan-scene .scene-atmosphere,
	.shinchan-scene .scene-orbit,
	.shinchan-scene .scene-track,
	.shinchan-scene .scene-spark,
	.shinchan-scene .scene-rocket,
	.shinchan-scene .scene-speech,
	.shinchan-scene .scene-character,
	.shinchan-scene .scene-profile-avatar,
	.shinchan-scene .scene-profile-halo,
	.shinchan-scene .scene-profile-badge,
	.shinchan-scene .scene-planet,
	.shinchan-scene .scene-planet-light,
	.shinchan-scene .scene-avatar-tether,
	.shinchan-scene .scene-heart,
	.shinchan-scene .scene-ripple,
	.shinchan-scene .scene-orbit::after {
		animation: none;
	}
}
</style>
