import { resolve } from 'node:path'
import { arch, env, version as nodeVersion, platform } from 'node:process'
import { pathToFileURL } from 'node:url'
import { name as ciName, CLOUDFLARE_PAGES, GITHUB_ACTIONS, NETLIFY } from 'ci-info'
import { mapValues } from 'es-toolkit/object'
import { pascalCase } from 'es-toolkit/string'
import { Temporal } from 'temporal-polyfill'
import blogConfig from './blog.config'
import modulesRaw from './config/site/modules.json'
import packageJson from './package.json'
import redirectList from './redirects.json'
import { disabledModulePathPrefixes, isModuleEnabled } from './shared/admin/modules'
import { modulesConfigSchema } from './shared/admin/site-config'
import { filterArticlePreviewPages } from './shared/article-preview-build'

function pluginPath(path: string) {
	return pathToFileURL(resolve(`./remark-plugins/${path}.mjs`)).href
}

// Content 构建与后台 MDC 预览共用浏览器安全插件，避免格式漂移和 Node 依赖进入客户端。
const markdownRemarkPlugins = {
	[pluginPath('remark-music')]: {},
	[pluginPath('remark-reading-time')]: {},
	'remark-breaks': {},
	'remark-math': {},
}
const markdownRehypePlugins = {
	[pluginPath('rehype-meta-slots')]: {},
	'rehype-katex': {},
}

const cloudflareWebAnalyticsToken = env.NUXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN?.trim()
const devApiOrigin = env.NUXT_DEV_API_ORIGIN?.trim().replace(/\/+$/u, '')
const configuredModules = modulesConfigSchema.parse(modulesRaw)
const articlesEnabled = isModuleEnabled(configuredModules, 'articles')
const articlePreviewBuild = env.NUXT_ARTICLE_PREVIEW === '1'
const disabledModulePrerenderPaths = [
	...disabledModulePathPrefixes(configuredModules),
	...(articlePreviewBuild ? ['/admin/**'] : []),
]

// 此处配置无需修改
export default defineNuxtConfig({
	app: {
		head: {
			title: blogConfig.title,
			htmlAttrs: { lang: 'zh-CN' },
			meta: [
				{ name: 'author', content: [blogConfig.author.name, blogConfig.author.email].filter(Boolean).join(', ') },
				{ name: 'color-scheme', content: 'light dark' },
				// 此处为元数据的生成器标识，不建议修改
				{ name: 'generator', content: `${pascalCase(packageJson.name)} ${packageJson.version}` },
				{ name: 'mobile-web-app-capable', content: 'yes' },
			],
			link: [
				{ rel: 'icon', href: blogConfig.favicon },
				...(articlesEnabled ? [{ rel: 'alternate', type: 'application/atom+xml', href: '/atom.xml' }] : []),
				{ rel: 'preconnect', href: blogConfig.twikoo.preload },
				{ rel: 'stylesheet', href: 'https://cdnjs.snrat.com/ajax/libs/KaTeX/0.16.44/katex.min.css', media: 'print', onload: 'this.media="all"' },
				// "InterVariable", "Inter", "InterDisplay"
				{ rel: 'stylesheet', href: 'https://rsms.me/inter/inter.css', media: 'print', onload: 'this.media="all"' },
				// "JetBrains Mono", 思源宋体 "Noto Serif SC"
				{ rel: 'preconnect', href: 'https://fonts.gstatic.cn', crossorigin: '' },
				{ rel: 'stylesheet', href: 'https://fonts.googleapis.cn/css2?family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Noto+Serif+SC:wght@200..900&display=swap', media: 'print', onload: 'this.media="all"' },
				// 抖音美好体 "DOUYINSANSBOLD-GB"
				{ rel: 'stylesheet', href: 'https://fonts.bytedance.com/dfd/api/v1/css?family=DOUYINSANSBOLD-GB&display=swap', media: 'print', onload: 'this.media="all"' },
			],
			script: [
				...blogConfig.scripts,
				...(cloudflareWebAnalyticsToken
					? [{
							'src': 'https://static.cloudflareinsights.com/beacon.min.js',
							'data-cf-beacon': JSON.stringify({ token: cloudflareWebAnalyticsToken }),
							'defer': true,
						}]
					: []),
			],
		},
		rootAttrs: {
			id: 'blog-root',
		},
	},

	compatibilityDate: '2024-08-03',

	components: [
		{ path: '~/components/partial', prefix: 'Z' },
		'~/components',
	],

	css: [
		'@/assets/css/admin-analytics.scss',
		'@/assets/css/admin-management.scss',
		'@/assets/css/admin.scss',
		'@/assets/css/animation.scss',
		'@/assets/css/article.scss',
		'@/assets/css/color.scss',
		'@/assets/css/font.scss',
		'@/assets/css/main.scss',
		'@/assets/css/polish.scss',
		'@/assets/css/reusable.scss',
	],

	// @keep-sorted
	experimental: {
		emitRouteChunkError: 'automatic-immediate',
		extractAsyncDataHandlers: true,
		restoreState: true,
		typescriptPlugin: true,
	},

	nitro: {
		devProxy: devApiOrigin ? { '/api': `${devApiOrigin}/api` } : {},
		prerender: {
			routes: articlePreviewBuild ? [] : ['/admin/analytics'],
			ignore: disabledModulePrerenderPaths,
			// 修复部分平台会在文章路径后添加 `/`，导致闪现 404 错误
			// https://github.com/nuxt/content/issues/2378
			autoSubfolderIndex: CLOUDFLARE_PAGES || GITHUB_ACTIONS || NETLIFY ? false : undefined,
		},
	},

	// @keep-sorted
	routeRules: {
		...mapValues(redirectList, to => ({ redirect: { to, statusCode: 308 as const } })),
		'/about/profile': { redirect: '/me' },
		'/admin': { ssr: false },
		'/admin/**': { ssr: false },
		'/api/stats': { prerender: true, headers: { 'Content-Type': 'application/json' } },
		'/atom.xml': { prerender: true, headers: { 'Content-Type': 'application/xml' } },
		'/favicon.ico': { redirect: { to: blogConfig.favicon } },
		'/moments/**': { ssr: false },
		'/subscriptions.opml': { prerender: true, headers: { 'Content-Type': 'application/xml' } },
	},

	runtimeConfig: {
		// @keep-sorted
		public: {
			arch,
			buildTime: Temporal.Now.zonedDateTimeISO().toString(),
			// EdgeOne 检测暂时不可用
			ci: env.TENCENTCLOUD_RUNENV === 'SCF' ? 'EdgeOne' : ciName || '',
			nodeVersion,
			platform,
		},
	},

	/** 在生产环境启用 sourcemap */
	// sourcemap: true,

	typescript: {
		nodeTsConfig: {
			// @keep-sorted
			include: [
				'../remark-plugins/**/*.ts',
				'../scripts/**/*.ts',
				'../shared/admin/**/*.ts',
			],
		},
	},

	vite: {
		worker: {
			format: 'es',
		},
		css: {
			preprocessorOptions: {
				scss: {
					additionalData: '@use "@/assets/css/_variable.scss" as *;',
				},
			},
		},
		define: {
			/** 在生产环境启用 Vue DevTools */
			// __VUE_PROD_DEVTOOLS__: 'true',
			/** 在生产环境启用 Vue 水合不匹配详情 */
			// __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
		},
		optimizeDeps: {
			// @keep-sorted
			include: ['@shikijs/colorized-brackets', '@shikijs/transformers', '@unhead/schema-org/vue', '@vue/devtools-core', '@vue/devtools-kit', 'embla-carousel-autoplay', 'embla-carousel-vue', 'embla-carousel-wheel-gestures', 'es-toolkit/array', 'es-toolkit/math', 'es-toolkit/object', 'es-toolkit/promise', 'es-toolkit/string', 'minisearch', 'parse-domain', 'plain-shiki', 'shiki/themes/catppuccin-latte.mjs', 'shiki/themes/one-dark-pro.mjs', 'temporal-polyfill', 'vue-tippy'],
		},
		server: {
			allowedHosts: true,
		},
	},

	// @keep-sorted
	modules: [
		'@bikariya/image-viewer',
		'@bikariya/modals',
		'@bikariya/shiki',
		'@nuxt/a11y',
		'@nuxt/content',
		'@nuxt/hints',
		'@nuxt/icon',
		'@nuxt/image',
		'@nuxtjs/color-mode',
		'@nuxtjs/seo',
		'@pinia/nuxt',
		'@vueuse/nuxt',
		'nuxt-llms',
		'unplugin-yaml/nuxt',
	],

	colorMode: {
		preference: 'system',
		fallback: 'light',
		classSuffix: '',
	},

	content: {
		build: {
			markdown: {
				highlight: false,
				remarkPlugins: markdownRemarkPlugins,
				rehypePlugins: markdownRehypePlugins,
				toc: { depth: 4, searchDepth: 4 },
			},
		},
		experimental: {
			sqliteConnector: 'native',
		},
	},

	mdc: {
		highlight: false,
		remarkPlugins: markdownRemarkPlugins,
		rehypePlugins: markdownRehypePlugins,
	},

	dxup: {
		features: {
			namedLayoutSlots: false,
		},
	},

	hooks: {
		'pages:extend': (pages) => {
			if (articlePreviewBuild)
				pages.splice(0, pages.length, ...filterArticlePreviewPages(pages))
			if (env.NUXT_E2E !== '1')
				return
			pages.push({
				name: 'e2e-modules',
				path: '/__e2e__',
				file: resolve('./e2e/fixtures/modules-page.vue'),
			})
		},
		'ready': () => {
			console.info(`
================================
${pascalCase(packageJson.name)} ${packageJson.version}
${packageJson.homepage}
================================
`)
		},
		'content:file:afterParse': (ctx) => {
			const { permalink, path } = ctx.content as Record<string, string | undefined>
			// 优先使用自定义链接（permalink/abbrlink），其次隐藏基于文件路由的 URL 中的 /posts 前缀
			if (permalink)
				ctx.content.path = permalink
			else if (blogConfig.article.hidePostPrefix && path?.startsWith('/posts/'))
				ctx.content.path = path.slice('/posts'.length)
		},
	},

	icon: {
		customCollections: [
			{ prefix: 'zi', dir: './app/assets/icons' },
		],
		clientBundle: {
			// 动态配置中的图标无法稳定被源码扫描，需显式进入客户端包。
			// @keep-sorted
			icons: [
				'ri:sun-cloudy-line',
				'tabler:archive',
				'tabler:cloud-question',
				'tabler:cloud-rain',
				'tabler:cloud-storm',
				'tabler:cloud',
				'tabler:file-text',
				'tabler:files',
				'tabler:friends',
				'tabler:headphones',
				'tabler:home',
				'tabler:leaf',
				'tabler:link',
				'tabler:mail',
				'tabler:message-circle',
				'tabler:mist',
				'tabler:news',
				'tabler:rss',
				'tabler:snowflake',
				'tabler:sparkles',
				'tabler:sun',
				'tabler:umbrella',
				'tabler:user-circle',
			],
			scan: {
				globInclude: ['**\/*.{vue,jsx,tsx,ts,md,mdc,mdx}'],
			},
		},
	},

	image: {
		// 尽量以这些密度点对点显示
		densities: [1, 1.5, 2],
		format: ['avif', 'webp'],
		// Neylify 下 netlify 处理器无法显示站外图片，ipx 处理器无法显示站内图片，需彻底禁用
		// https://github.com/nuxt/image/issues/1353
		provider: NETLIFY ? 'none' : undefined,
	},

	linkChecker: {
		// @keep-sorted
		skipInspections: [
			'no-baseless',
			'no-non-ascii-chars',
			'no-uppercase-chars',
		],
	},

	llms: {
		domain: blogConfig.url,
		title: blogConfig.title,
		description: blogConfig.description,
	},

	ogImage: {
		enabled: false,
	},

	robots: {
		disableNuxtContentIntegration: true,
		disallow: blogConfig.article.robotsNotIndex,
	},

	site: {
		name: blogConfig.title,
		url: blogConfig.url,
		defaultLocale: blogConfig.language,
	},
})
