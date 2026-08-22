import type { ModulesConfig } from './site-config'
import { allowedModuleIds } from './site-config'

export type ModuleId = ModulesConfig[number]['id']

export const navigationModuleIds = [
	'articles',
	'ai-news',
	'market',
	'moments',
	'about',
	'links',
	'archive',
] as const satisfies readonly ModuleId[]

const moduleIdSet = new Set<string>(allowedModuleIds)
const navigationModuleIdSet = new Set<string>(navigationModuleIds)

const modulePublicPathPrefixes: Record<ModuleId, string[]> = {
	'about': ['/me', '/about/profile'],
	'ai-news': ['/ai.news'],
	'archive': ['/archive'],
	'articles': ['/atom.xml', '/preview', '/raw/'],
	'links': ['/link'],
	'market': ['/market'],
	'moments': ['/moments'],
	'music': [],
	'weather': [],
}

export function isModuleId(value: string): value is ModuleId {
	return moduleIdSet.has(value)
}

export function isNavigationModuleId(value: string): value is typeof navigationModuleIds[number] {
	return navigationModuleIdSet.has(value)
}

export function isModuleEnabled(modules: ModulesConfig, id: ModuleId): boolean {
	return modules.some(module => module.id === id && module.enabled)
}

export function filterAndSortModuleItems<T extends { id: string }>(items: readonly T[], modules: ModulesConfig): T[] {
	const order = new Map(modules.map(module => [module.id, module.order]))
	const moduleItems = items
		.filter(item => !isModuleId(item.id) || isModuleEnabled(modules, item.id))
		.filter(item => isModuleId(item.id))
		.slice()
		.sort((left, right) => (order.get(left.id as ModuleId) ?? Number.MAX_SAFE_INTEGER)
			- (order.get(right.id as ModuleId) ?? Number.MAX_SAFE_INTEGER))
	const customItems = items.filter(item => !isModuleId(item.id))
	return [...moduleItems, ...customItems]
}

export function disabledModulePathPrefixes(modules: ModulesConfig): string[] {
	return modules
		.filter(module => !module.enabled)
		.flatMap(module => modulePublicPathPrefixes[module.id])
}

export function moduleIdForPublicPath(path: string): ModuleId | null {
	const pathname = path.split(/[?#]/u, 1)[0]?.replace(/\/+$/u, '') || '/'
	if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/__e2e__')
		return null
	if (pathname === '/moments' || pathname.startsWith('/moments/'))
		return 'moments'
	if (pathname === '/ai.news' || pathname.startsWith('/ai.news/'))
		return 'ai-news'
	if (pathname === '/market' || pathname.startsWith('/market/'))
		return 'market'
	if (pathname === '/me' || pathname === '/about/profile')
		return 'about'
	if (pathname === '/link')
		return 'links'
	if (pathname === '/archive')
		return 'archive'
	return 'articles'
}
