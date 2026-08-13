export const financeCategories = ['market', 'company', 'macro', 'overseas', 'tech'] as const

export type FinanceCategory = typeof financeCategories[number]
export type FinanceFilter = 'all' | FinanceCategory
export type FinanceImportanceOrigin = 'upstream' | 'rule' | 'model' | 'prototype'

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
}

export interface FinanceFlashListDto {
	items: FinanceFlashDto[]
	total: number
	updatedAt: string | null
	prototype: boolean
}
