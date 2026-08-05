import type { FeedEntry } from './app/types/feed'
import { articlePresentationConfigSchema, categoriesConfigSchema } from '#shared/admin/site-config'
import articlePresentationRaw from './config/site/article.json'
import categoriesRaw from './config/taxonomy/categories.json'

const articlePresentationConfig = articlePresentationConfigSchema.parse(articlePresentationRaw)
const categoriesConfig = categoriesConfigSchema.parse(categoriesRaw)

const basicConfig = {
	title: 'fly living',
	subtitle: '记录技术、学习与生活',
	// 长 description 利好于 SEO
	description: 'fly living 的个人博客，记录技术、学习与生活。',
	author: {
		name: 'fly',
		avatar: 'https://github.com/flyoko.png',
		email: '',
		homepage: 'https://github.com/flyoko',
	},
	copyright: {
		abbr: 'CC BY-NC-SA 4.0',
		name: '署名-非商业性使用-相同方式共享 4.0 国际',
		url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans',
	},
	favicon: 'https://github.com/flyoko.png',
	language: 'zh-CN',
	timeEstablished: '2026-08-02',
	timeZone: 'Asia/Shanghai',
	url: 'https://flyovo.cc.cd/',
	defaultCategory: '未分类',
	domainRegistration: {
		status: '正常',
		registeredAt: '2026-08-02T17:31:00+08:00',
		expiresAt: '2027-08-02T17:31:00+08:00',
	},
}

// 存储 nuxt.config 和 app.config 共用的配置
// 此处为启动时需要的配置，启动后可变配置位于 app/app.config.ts
// @keep-sorted
const blogConfig = {
	...basicConfig,

	article: {
		categories: Object.fromEntries(categoriesConfig.map(({ name, ...category }) => [name, category])),
		/** 文章头部推广横幅；由后台站点设置管理，未启用时不渲染占位。 */
		headerAds: articlePresentationConfig.headerAds,
		/** 文章版式，首个为默认版式 */
		types: {
			tech: {},
			story: {},
		},
		/** 分类排序方式，键为排序字段，值为显示名称 */
		order: {
			date: '创建日期',
			updated: '更新日期',
			// title: '标题',
		},
		/** 使用 pnpm new 新建文章时自动生成自定义链接（permalink/abbrlink） */
		useRandomPremalink: false,
		/** 隐藏基于文件路由（不是自定义链接）的 URL /post 路径前缀 */
		hidePostPrefix: true,
		/** 禁止搜索引擎收录的路径 */
		robotsNotIndex: ['/preview', '/previews/*'],
	},

	/** 博客 Atom 订阅源 */
	feed: {
		/** 订阅源最大文章数量 */
		limit: 50,
		/** 订阅源是否启用XSLT样式 */
		enableStyle: true,
	},

	/** 向 <head> 中添加脚本 */
	scripts: [
		// Twikoo 评论系统
		{ src: 'https://cdnjs.snrat.com/ajax/libs/twikoo/1.7.13/twikoo.min.js', defer: true, crossorigin: 'anonymous' as const },
	],

	/** 自己部署的 Twikoo 服务 */
	twikoo: {
		envId: 'https://comment.flyovo.cc.cd/',
		preload: 'https://comment.flyovo.cc.cd/',
	},
}

/** 用于生成 OPML 和友链页面配置 */
export const myFeed: FeedEntry = {
	author: blogConfig.author.name,
	sitenick: 'fly living',
	title: blogConfig.title,
	desc: blogConfig.subtitle || blogConfig.description,
	link: blogConfig.url,
	feed: new URL('/atom.xml', blogConfig.url).toString(),
	icon: blogConfig.favicon,
	avatar: blogConfig.author.avatar,
	archs: ['Nuxt', 'Cloudflare Pages'],
	date: blogConfig.timeEstablished,
	comment: '记录技术、学习与生活',
}

export default blogConfig
