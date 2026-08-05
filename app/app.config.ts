import type { Nav, NavItem } from './types/nav'
import { Temporal } from 'temporal-polyfill'
import { filterAndSortModuleItems, isModuleEnabled } from '#shared/admin/modules'
import {
	footerConfigSchema,
	modulesConfigSchema,
	navigationConfigSchema,
} from '#shared/admin/site-config'
import blogConfig from '../blog.config'
import footerRaw from '../config/site/footer.json'
import modulesRaw from '../config/site/modules.json'
import navigationRaw from '../config/site/navigation.json'
import { version } from '../package.json'

const footerConfig = footerConfigSchema.parse(footerRaw)
const featureModules = modulesConfigSchema.parse(modulesRaw).toSorted((left, right) => left.order - right.order)
const navigationConfig = navigationConfigSchema.parse(navigationRaw)

function shouldShowFooterItem(id: string) {
	if (id === 'atom')
		return isModuleEnabled(featureModules, 'articles')
	if (id === 'personal-github')
		return footerConfig.showPersonalGitHub
	if (id === 'theme-source')
		return footerConfig.showThemeSource
	if (id === 'site-source')
		return footerConfig.showSiteSource
	return true
}

function toNavItem(item: typeof navigationConfig[number]['items'][number]): NavItem {
	const { id, ...navItem } = item
	return id === 'theme-source'
		? { ...navItem, text: `${navItem.text} ${version}` }
		: navItem
}

function toNav(groups: typeof navigationConfig, applyModules = false): Nav {
	return groups.map((group) => {
		const visibleItems = group.items.filter(item => shouldShowFooterItem(item.id))
		return {
			title: group.title,
			items: (applyModules ? filterAndSortModuleItems(visibleItems, featureModules) : visibleItems).map(toNavItem),
		}
	}).filter(group => group.items.length > 0)
}

// 图标查询：https://yesicon.app/tabler
// 图标插件：https://marketplace.visualstudio.com/items?itemName=antfu.iconify

// @keep-sorted
export default defineAppConfig({
	// 将 blog.config 中的配置项复制到 appConfig，方便调用
	...blogConfig,

	component: {
		alert: {
			/** 默认使用卡片风格还是扁平风格 */
			defaultStyle: 'card' as 'card' | 'flat',
		},

		codeblock: {
			/** 代码块触发折叠的行数 */
			triggerRows: 32,
			/** 代码块折叠后的行数 */
			collapsedRows: 16,
			/** 启用代码块缩进导航会关闭空格渲染 */
			enableIndentGuide: true,
			/** 代码块缩进导航(Indent Guige)竖线匹配空格数 */
			indent: 4,
			/** tab渲染宽度 */
			tabSize: 3,
		},

		/** 文章开头摘要 */
		excerpt: {
			animation: true,
			caret: '_',
		},

		/** 精选文章 Slide */
		slide: {
			/** 适合封面图无字时启用 */
			showTitle: true,
		},

		stats: {
			/** 归档页面每年标题对应的年龄 */
			birthYear: 2002,
			/** blog-stats widget 的预置文本 */
			wordCount: '持续更新',
		},
	},

	/** 后台可管理的公开模块状态与导航顺序。 */
	featureModules,

	// @keep-sorted
	footer: {
		/** 页脚版权信息，支持 <br> 换行等 HTML 标签 */
		copyright: `© ${Temporal.Now.plainDateISO().year.toString()} ${blogConfig.author.name}`,
		/** 侧边栏底部图标导航 */
		iconNav: footerConfig.iconNav.filter(item => shouldShowFooterItem(item.id)).map(toNavItem),
		/** 页脚站点地图 */
		nav: toNav(footerConfig.nav),
	},

	/** 左侧栏顶部 Logo */
	header: {
		logo: blogConfig.author.avatar,
		/** 展示标题文本，否则展示纯 Logo */
		showTitle: true,
		subtitle: blogConfig.subtitle,
		emojiTail: ['💻', '📚', '🚀'],
	},

	/** 友链页面 */
	link: {
		/** 无订阅源展示静音图标 */
		remindNoFeed: true,
		/** 友链分组内随机排序 */
		randomInGroup: true,
	},

	/** 左侧栏导航 */
	nav: toNav(navigationConfig, true),

	pagination: {
		perPage: 10,
		/** 默认排序方式，需要是 this.article.order 中的键名 */
		sortOrder: 'date' as keyof typeof blogConfig.article.order,
		/** 允许（普通/预览/归档）文章列表正序，开启后排序方式左侧图标可切换顺序 */
		allowAscending: false,
	},

	/** 公开个人资料入口；统一控制个人 GitHub 是否出现在访客页面。 */
	profile: {
		showGitHub: footerConfig.showPersonalGitHub,
	},

	themes: {
		light: {
			icon: 'tabler:sun',
			tip: '浅色模式',
		},
		system: {
			icon: 'tabler:device-desktop',
			tip: '跟随系统',
		},
		dark: {
			icon: 'tabler:moon',
			tip: '深色模式',
		},
		dynamic: {
			icon: 'tabler:sparkles',
			tip: '动态模式',
		},
	},
})
