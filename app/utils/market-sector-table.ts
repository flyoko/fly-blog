import type { SectorFlowItem, SectorWeekOffset, SectorWindowDays } from '#shared/market'

export type SectorWeekSortKey = `week:${SectorWeekOffset}`
export type SectorSortKey = 'changePct' | 'mainNetInflow' | SectorWindowDays | SectorWeekSortKey
export type SectorSortDirection = 'asc' | 'desc'

export const SECTOR_PAGE_SIZE = 10

function windowValue(item: SectorFlowItem, days: SectorWindowDays): number | null {
	return item.windows.find(window => window.days === days)?.netInflow ?? null
}

function weekValue(item: SectorFlowItem, weekOffset: SectorWeekOffset): number | null {
	return item.weeks?.find(week => week.weekOffset === weekOffset)?.netInflow ?? null
}

export function sectorSortValue(item: SectorFlowItem, key: SectorSortKey): number | null {
	if (key === 'changePct')
		return item.changePct
	if (key === 'mainNetInflow')
		return item.mainNetInflow
	if (typeof key === 'number')
		return windowValue(item, key)
	return weekValue(item, Number(key.slice('week:'.length)) as SectorWeekOffset)
}

export function sortSectorFlowItems(items: SectorFlowItem[], key: SectorSortKey, direction: SectorSortDirection): SectorFlowItem[] {
	return [...items].sort((left, right) => {
		const leftValue = sectorSortValue(left, key)
		const rightValue = sectorSortValue(right, key)
		if (leftValue === null)
			return rightValue === null ? left.name.localeCompare(right.name, 'zh-CN') : 1
		if (rightValue === null)
			return -1
		const difference = direction === 'desc' ? rightValue - leftValue : leftValue - rightValue
		return difference || left.name.localeCompare(right.name, 'zh-CN')
	})
}

export function sectorPageCount(total: number, pageSize = SECTOR_PAGE_SIZE): number {
	return Math.max(1, Math.ceil(total / pageSize))
}

export function paginateSectorFlowItems(items: SectorFlowItem[], page: number, pageSize = SECTOR_PAGE_SIZE): SectorFlowItem[] {
	const safePage = Math.min(Math.max(1, page), sectorPageCount(items.length, pageSize))
	const start = (safePage - 1) * pageSize
	return items.slice(start, start + pageSize)
}
