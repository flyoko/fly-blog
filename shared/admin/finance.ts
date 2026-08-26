export const financeCategories = ['market', 'company', 'macro', 'overseas', 'tech'] as const
export const financeSourceIds = ['cls-telegraph-7x24', 'jin10-mcp-7x24', 'wallstreetcn-7x24'] as const

export type FinanceCategory = typeof financeCategories[number]
export type FinanceSourceId = typeof financeSourceIds[number]
export type FinanceFilter = 'all' | FinanceCategory
export type FinanceImportanceOrigin = 'upstream' | 'rule' | 'model' | 'prototype'
export type FinanceAdminVisibility = 'all' | 'visible' | 'hidden'

export interface FinanceFlashSourceDto {
	sourceId: string
	sourceName: string
	sourceUrl: string | null
	publishedAt: string
}

export interface FinanceFlashDto {
	id: string
	sourceId: string
	title: string
	summary: string | null
	publishedAt: string
	category: FinanceCategory
	categoryLabel: string
	topic: string | null
	important: boolean
	importanceOrigin: FinanceImportanceOrigin
	importanceScore: number | null
	sourceName: string
	sourceUrl: string | null
	sourceCount?: number
	sources?: FinanceFlashSourceDto[]
}

export type FinanceFlashQuality = 'live' | 'degraded' | 'stale' | 'prototype' | 'unavailable'

export interface FinanceFlashListDto {
	items: FinanceFlashDto[]
	total: number
	updatedAt: string | null
	prototype: boolean
	stale: boolean
	quality: FinanceFlashQuality
}

export interface FinanceTodayThemeDto {
	topic: string
	count: number
}

export interface FinanceTodayThemesDto {
	themes: FinanceTodayThemeDto[]
	eventCount: number
	sourceCount: number
	updatedAt: string | null
}

export interface AdminFinanceFlashDto extends FinanceFlashDto {
	publicVisible: boolean
	hidden: boolean
	hiddenAt: string | null
}

export interface AdminFinanceFlashListDto {
	items: AdminFinanceFlashDto[]
	total: number
	visibleTotal: number
	hiddenTotal: number
	updatedAt: string | null
	prototype: boolean
}

export interface FinanceSourceSettingDto {
	sourceId: FinanceSourceId
	sourceName: string
	enabled: boolean
	available: boolean
	updatedAt: string | null
}

export interface FinanceSourceSettingUpdate {
	enabled: boolean
}
