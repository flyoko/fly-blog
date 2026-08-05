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
	<span v-if="variant === 'about'" class="scene-shooting-star" />
	<span class="scene-orbit scene-orbit-one" />
	<span class="scene-orbit scene-orbit-two" />
	<span v-if="variant === 'about'" class="scene-orbit scene-orbit-three" />
	<span class="scene-track" />
	<span v-if="variant === 'about'" class="scene-planet">
		<span class="scene-planet-texture" />
		<span class="scene-planet-clouds" />
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
.scene-shooting-star,
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
	inset: 0 0 0 42%;
	background:
		radial-gradient(circle at 72% 30%, rgb(63 132 255 / 24%), transparent 25%),
		radial-gradient(circle at 70% 83%, rgb(33 104 255 / 22%), transparent 44%),
		radial-gradient(circle at 28% 52%, rgb(25 69 158 / 15%), transparent 38%);
	mask-image: linear-gradient(90deg, transparent, black 25%);
	animation: shinchan-atmosphere 7s ease-in-out infinite;
}

.scene-shooting-star {
	top: 19%;
	left: 46%;
	width: clamp(5rem, 8vw, 8.5rem);
	height: 1px;
	border-radius: 999px;
	box-shadow: 0 0 1.2rem rgb(86 151 255 / 42%);
	background: linear-gradient(90deg, transparent, rgb(96 157 255 / 28%) 18%, rgb(222 237 255 / 96%) 88%, white);
	transform: rotate(-38deg);
	transform-origin: right center;
	animation: shinchan-shooting-star 6.8s ease-in-out infinite;
	z-index: 2;
}

.scene-shooting-star::after {
	content: "";
	position: absolute;
	top: 50%;
	right: -0.12rem;
	width: 0.42rem;
	aspect-ratio: 1;
	border-radius: 50%;
	box-shadow: 0 0 1.1rem rgb(154 199 255 / 90%);
	background: #F6FAFF;
	transform: translateY(-50%);
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
	overflow: hidden;
	right: -9%;
	bottom: -58%;
	width: min(58%, 44rem);
	aspect-ratio: 1;
	border: 1px solid rgb(132 188 255 / 62%);
	border-radius: 50%;
	box-shadow:
		inset 0 1.5rem 3.4rem rgb(255 255 255 / 20%),
		inset 1.8rem -3rem 6rem rgb(1 14 67 / 48%),
		inset -1.5rem 0 4rem rgb(33 108 236 / 22%),
		0 -0.35rem 2rem rgb(104 177 255 / 46%),
		0 0 5rem rgb(29 99 232 / 38%);
	background:
		radial-gradient(circle at 32% 12%, rgb(255 255 255 / 30%), transparent 19%),
		radial-gradient(circle at 43% 34%, #2A83E2 0, #1764C9 42%, #0D45A2 73%, #061D5A 100%);
	transform: translate3d(var(--scene-planet-x, 0), var(--scene-planet-y, 0), 0);
	animation: shinchan-planet-breathe 7.2s ease-in-out infinite;
	z-index: 3;
}

.scene-planet::before {
	content: "";
	position: absolute;
	inset: -4%;
	border: 1px solid rgb(96 166 255 / 36%);
	border-radius: inherit;
	box-shadow:
		0 -0.3rem 1.6rem rgb(118 190 255 / 42%),
		0 0 0 0.55rem rgb(50 114 237 / 8%);
	pointer-events: none;
}

.scene-planet::after {
	content: "";
	position: absolute;
	inset: 0;
	border-radius: inherit;
	background:
		radial-gradient(circle at 78% 70%, transparent 0 48%, rgb(0 7 35 / 46%) 82%),
		linear-gradient(122deg, rgb(255 255 255 / 12%), transparent 31% 72%, rgb(0 8 45 / 24%));
	pointer-events: none;
}

.scene-planet-texture,
.scene-planet-clouds,
.scene-planet-light {
	position: absolute;
	inset: 0;
	border-radius: inherit;
	pointer-events: none;
}

.scene-planet-texture {
	opacity: 0.78;
	background-image:
		url("/assets/about-earth-texture.svg"),
		repeating-radial-gradient(ellipse at 38% 25%, transparent 0 1.35rem, rgb(180 222 255 / 5%) 1.45rem 1.55rem);
	background-position: center;
	background-repeat: no-repeat, repeat;
	background-size: cover, auto;
	mix-blend-mode: normal;
}

.scene-planet-clouds {
	opacity: 0.46;
	inset: 2%;
	background:
		radial-gradient(ellipse at 24% 22%, rgb(224 240 255 / 34%) 0 8%, transparent 10%),
		radial-gradient(ellipse at 43% 31%, rgb(220 239 255 / 24%) 0 11%, transparent 13%),
		radial-gradient(ellipse at 68% 21%, rgb(233 246 255 / 28%) 0 8%, transparent 10%),
		radial-gradient(ellipse at 72% 48%, rgb(218 238 255 / 18%) 0 12%, transparent 14%),
		radial-gradient(ellipse at 38% 55%, rgb(224 241 255 / 20%) 0 9%, transparent 11%);
	animation: shinchan-cloud-drift 16s linear infinite;
	filter: blur(2px);
}

.scene-planet-light {
	inset: -1%;
	background:
		linear-gradient(112deg, transparent 17%, rgb(255 255 255 / 18%) 45%, transparent 66%),
		radial-gradient(circle at 34% 13%, rgb(255 255 255 / 24%), transparent 22%);
	mask-image: linear-gradient(to bottom, black 0 41%, transparent 72%);
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
	right: 3.6%;
	bottom: 40%;
	width: clamp(8rem, 14vw, 10.5rem);
	aspect-ratio: 390 / 333;
	clip-path: inset(0 0 8% 0);
	animation-name: shinchan-peek-about;
	z-index: 2;
}

.is-about.has-custom-character .scene-profile-avatar {
	top: 23%;
	right: 12.5%;
	width: min(23%, 15.5rem);
	aspect-ratio: 1;
	border-width: 1.5px;
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 65%),
		inset 0 -1rem 2.8rem rgb(34 91 183 / 20%),
		0 0 0 0.75rem rgb(76 139 255 / 10%),
		0 0 3.4rem rgb(75 145 255 / 30%),
		0 1.8rem 4rem rgb(0 10 40 / 42%);
	background:
		radial-gradient(circle at 31% 20%, rgb(255 255 255 / 30%), transparent 29%),
		radial-gradient(circle at 62% 76%, rgb(52 117 233 / 22%), transparent 44%),
		rgb(8 27 67 / 45%);
}

.is-about.has-custom-character .scene-profile-avatar::before {
	inset: 0.62rem;
	box-shadow:
		inset 0 0 1.7rem rgb(255 255 255 / 16%),
		0 0 1.5rem rgb(93 163 255 / 10%);
}

.is-about.has-custom-character .scene-profile-avatar img {
	inset: 0.78rem;
	width: calc(100% - 1.56rem);
	height: calc(100% - 1.56rem);
	box-shadow: 0 1rem 2.2rem rgb(2 13 46 / 42%);
	background: radial-gradient(circle at 42% 28%, rgb(48 77 126 / 52%), rgb(4 11 31 / 86%) 72%);
	object-fit: contain;
}

.is-about .scene-profile-halo {
	inset: -18%;
	border-color: rgb(86 153 255 / 34%);
	box-shadow:
		0 0 2.7rem rgb(64 139 255 / 22%),
		inset 0 0 2rem rgb(70 135 255 / 8%);
}

.is-about .scene-profile-badge {
	top: 4%;
	right: -3%;
	width: clamp(2.35rem, 4vw, 3.15rem);
	box-shadow:
		inset 0 1px 0 rgb(255 255 255 / 20%),
		0 0 1.7rem rgb(72 145 255 / 46%);
	background: rgb(18 47 100 / 72%);
	font-size: clamp(0.9rem, 1.6vw, 1.25rem);
	color: #DCEBFF;
}

.is-about .scene-orbit-one {
	inset: 5% -5% 26% 48%;
	border-color: rgb(91 155 255 / 42%);
	rotate: -18deg;
}

.is-about .scene-orbit-two {
	inset: 20% -12% 5% 54%;
	border-color: rgb(101 169 255 / 52%);
	rotate: 19deg;
}

.is-about .scene-orbit-three {
	inset: 43% -14% -37% 40%;
	border-style: solid;
	border-color: rgb(79 142 255 / 34%);
	animation-duration: 20s;
	rotate: -7deg;
}

.is-about .scene-track {
	opacity: 0.82;
	top: 42%;
	right: -2%;
	width: 55%;
	box-shadow: 0 0 1.2rem rgb(76 151 255 / 34%);
}

.is-about .scene-avatar-tether {
	top: 47%;
	right: 12%;
	width: 27%;
}

.is-about .scene-heart {
	right: 4.8%;
	bottom: 44%;
	font-size: clamp(1rem, 2vw, 1.45rem);
	text-shadow: 0 0 1.2rem rgb(255 79 132 / 56%);
}

.is-about .scene-ripple {
	right: 8%;
	bottom: 26%;
	width: 5rem;
}

.is-about .scene-spark-one {
	top: 9%;
	right: 7%;
	font-size: 1.35rem;
}

.is-about .scene-spark-two {
	right: 26%;
	bottom: 28%;
	font-size: 1.05rem;
}

.is-about .scene-spark-three {
	top: 49%;
	right: 45%;
	font-size: 1.2rem;
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

@keyframes shinchan-shooting-star {
	0%, 12%, 100% {
		opacity: 0;
		translate: -1.2rem 1.2rem;
	}

	20%, 42% {
		opacity: 1;
		translate: 0 0;
	}

	54% {
		opacity: 0;
		translate: 1.5rem -1.5rem;
	}
}

@keyframes shinchan-cloud-drift {
	from { transform: rotate(-4deg) translateX(-1.5%); }
	to { transform: rotate(5deg) translateX(1.5%); }
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

@media (max-width: 900px) {
	.is-about .scene-atmosphere {
		inset: 39% 0 0;
		mask-image: linear-gradient(to bottom, transparent, black 22%);
	}

	.is-about .scene-shooting-star {
		top: 57%;
		left: 32%;
	}

	.is-about .scene-character {
		right: 1.2rem;
		bottom: 50%;
		width: 10rem;
	}

	.is-about.has-custom-character .scene-profile-avatar {
		--profile-base-y: 0px;

		top: auto;
		right: 11.5rem;
		bottom: 10.5rem;
		width: 12rem;
	}

	.is-about .scene-planet {
		right: -13%;
		bottom: -24%;
		width: 34rem;
	}

	.is-about .scene-orbit-one {
		inset: 41% -13% 6% 34%;
	}

	.is-about .scene-orbit-two {
		inset: 49% -27% -14% 42%;
	}

	.is-about .scene-orbit-three {
		inset: 59% -34% -39% 29%;
	}

	.is-about .scene-track {
		top: 67%;
		right: -7%;
		width: 73%;
	}

	.is-about .scene-avatar-tether {
		top: auto;
		right: 27%;
		bottom: 29%;
		width: 31%;
	}

	.is-about .scene-heart {
		right: 5.5%;
		bottom: 30%;
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
		inset: 45% 0 0;
	}

	.is-about .scene-shooting-star {
		top: 61%;
		left: 21%;
		width: 4.5rem;
	}

	.is-about .scene-character {
		right: -0.35rem;
		bottom: 35%;
		width: 7.8rem;
	}

	.is-about.has-custom-character .scene-profile-avatar {
		right: 6.6rem;
		bottom: 8.2rem;
		width: 8.6rem;
	}

	.is-about .scene-profile-badge {
		width: 2.25rem;
		font-size: 0.85rem;
	}

	.is-about .scene-planet {
		right: -26%;
		bottom: -20%;
		width: 23rem;
	}

	.is-about .scene-orbit-one {
		inset: 48% -34% 5% 17%;
	}

	.is-about .scene-orbit-two {
		inset: 57% -48% -16% 30%;
	}

	.is-about .scene-orbit-three {
		inset: 65% -58% -39% 12%;
	}

	.is-about .scene-track {
		top: 72%;
		right: -11%;
		width: 88%;
	}

	.is-about .scene-avatar-tether {
		right: 29%;
		bottom: 27%;
		width: 35%;
	}

	.is-about .scene-heart {
		right: 3.5%;
		bottom: 31%;
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
	.shinchan-scene .scene-shooting-star,
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
	.shinchan-scene .scene-planet-clouds,
	.shinchan-scene .scene-planet-light,
	.shinchan-scene .scene-avatar-tether,
	.shinchan-scene .scene-heart,
	.shinchan-scene .scene-ripple,
	.shinchan-scene .scene-orbit::after {
		animation: none;
	}
}
</style>
