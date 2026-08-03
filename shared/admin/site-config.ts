import { z } from 'zod'

function isValidTimeZone(value: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0))
		return true
	}
	catch {
		return false
	}
}

function addDuplicateIssues<T>(
	values: T[],
	getKey: (value: T) => string | number,
	ctx: z.RefinementCtx,
	label: string,
) {
	const seen = new Set<string | number>()
	values.forEach((value, index) => {
		const key = getKey(value)
		if (seen.has(key)) {
			ctx.addIssue({
				code: 'custom',
				message: `Duplicate ${label}: ${key}`,
				path: [index],
			})
		}
		seen.add(key)
	})
}

const navItemSchema = z.object({
	id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
	icon: z.string().min(1),
	text: z.string().min(1),
	url: z.string().min(1),
	external: z.boolean().optional(),
})

const navGroupSchema = z.object({
	id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
	title: z.string(),
	items: z.array(navItemSchema).superRefine((items, ctx) => {
		addDuplicateIssues(items, item => item.id, ctx, 'navigation item id')
	}),
})

export const categoriesConfigSchema = z.array(z.object({
	name: z.string().min(1),
	icon: z.string().min(1),
	color: z.string().regex(/^#[a-f0-9]{6}$/iu).optional(),
})).min(1).superRefine((categories, ctx) => {
	addDuplicateIssues(categories, category => category.name, ctx, 'category name')
})

export const navigationConfigSchema = z.array(navGroupSchema).min(1).superRefine((groups, ctx) => {
	addDuplicateIssues(groups, group => group.id, ctx, 'navigation group id')
})

export const footerConfigSchema = z.object({
	showPersonalGitHub: z.boolean(),
	showThemeSource: z.boolean(),
	showSiteSource: z.boolean(),
	iconNav: z.array(navItemSchema).superRefine((items, ctx) => {
		addDuplicateIssues(items, item => item.id, ctx, 'footer icon id')
	}),
	nav: z.array(navGroupSchema).superRefine((groups, ctx) => {
		addDuplicateIssues(groups, group => group.id, ctx, 'footer group id')
	}),
})

export const allowedModuleIds = [
	'articles',
	'about',
	'moments',
	'ai-news',
	'weather',
	'music',
	'links',
	'archive',
] as const

export const moduleIdSchema = z.enum(allowedModuleIds)

export const modulesConfigSchema = z.array(z.object({
	id: moduleIdSchema,
	enabled: z.boolean(),
	order: z.number().int().nonnegative(),
})).length(allowedModuleIds.length).superRefine((modules, ctx) => {
	addDuplicateIssues(modules, module => module.id, ctx, 'module id')
	addDuplicateIssues(modules, module => module.order, ctx, 'module order')
	const orders = modules.map(module => module.order).sort((left, right) => left - right)
	orders.forEach((order, index) => {
		if (order !== index)
			ctx.addIssue({ code: 'custom', path: [index, 'order'], message: 'Module orders must be continuous from zero' })
	})
})

export const weatherConfigSchema = z.object({
	enabled: z.boolean(),
	provider: z.literal('open-meteo'),
	city: z.string().max(160),
	latitude: z.number().min(-90).max(90).nullable(),
	longitude: z.number().min(-180).max(180).nullable(),
	timezone: z.string().min(1).max(120).refine(isValidTimeZone, 'Timezone must be a valid IANA timezone'),
}).superRefine((config, ctx) => {
	if (!config.enabled)
		return
	if (!config.city.trim())
		ctx.addIssue({ code: 'custom', path: ['city'], message: 'Enabled weather requires a city' })
	if (config.latitude === null)
		ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Enabled weather requires latitude' })
	if (config.longitude === null)
		ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Enabled weather requires longitude' })
})

export const newsSourceAdapterSchema = z.enum([
	'zaihua-rss',
	'aihot-items',
	'aihot-full',
	'aihot-daily',
])

const newsSourceSchema = z.object({
	id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
	title: z.string().min(1),
	type: z.enum(['rss', 'rest']),
	url: z.url(),
	enabled: z.boolean(),
	priority: z.number().int().nonnegative(),
	adapter: newsSourceAdapterSchema,
	intervalMinutes: z.number().int().min(30).max(1_440),
	publishItems: z.boolean(),
})

export const newsSourcesConfigSchema = z.object({
	enabled: z.boolean(),
	sources: z.array(newsSourceSchema).superRefine((sources, ctx) => {
		addDuplicateIssues(sources, source => source.id, ctx, 'news source id')
		addDuplicateIssues(sources, source => source.priority, ctx, 'news source priority')
	}),
})

export type CategoriesConfig = z.infer<typeof categoriesConfigSchema>
export type NavigationConfig = z.infer<typeof navigationConfigSchema>
export type FooterConfig = z.infer<typeof footerConfigSchema>
export type ModulesConfig = z.infer<typeof modulesConfigSchema>
export type WeatherConfig = z.infer<typeof weatherConfigSchema>
export type NewsSourcesConfig = z.infer<typeof newsSourcesConfigSchema>
