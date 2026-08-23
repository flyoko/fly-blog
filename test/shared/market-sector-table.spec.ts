import type { SectorFlowItem } from '../../shared/market'
import { describe, expect, it } from 'vitest'
import { paginateSectorFlowItems, SECTOR_PAGE_SIZE, sectorPageCount, sortSectorFlowItems } from '../../app/utils/market-sector-table'

function item(name: string, changePct: number | null, today: number | null, d3: number | null): SectorFlowItem {
	return {
		code: name,
		name,
		kind: 'industry',
		changePct,
		mainNetInflow: today,
		mainNetInflowRatio: null,
		leaderStockCode: null,
		leaderStockName: null,
		marketAt: '2026-08-21T07:00:00.000Z',
		windows: [
			{ days: 1, netInflow: today, availableDays: 1, complete: true },
			{ days: 3, netInflow: d3, availableDays: d3 === null ? 1 : 3, complete: d3 !== null },
			{ days: 5, netInflow: null, availableDays: 1, complete: false },
			{ days: 10, netInflow: null, availableDays: 1, complete: false },
			{ days: 20, netInflow: null, availableDays: 1, complete: false },
		],
	}
}

describe('market sector table', () => {
	it('uses 10 rows per page and clamps the requested page', () => {
		const items = Array.from({ length: 23 }, (_, index) => item(`S${index + 1}`, index, index, index))
		expect(SECTOR_PAGE_SIZE).toBe(10)
		expect(sectorPageCount(items.length)).toBe(3)
		expect(paginateSectorFlowItems(items, 1)).toHaveLength(10)
		expect(paginateSectorFlowItems(items, 3)).toHaveLength(3)
		expect(paginateSectorFlowItems(items, 99).map(value => value.name)).toEqual(['S21', 'S22', 'S23'])
	})

	it('sorts change, current flow and rolling windows while keeping missing values last', () => {
		const items = [
			item('A', 2, 10, null),
			item('B', -1, 30, 50),
			item('C', 5, -20, -10),
		]
		expect(sortSectorFlowItems(items, 'changePct', 'desc').map(value => value.name)).toEqual(['C', 'A', 'B'])
		expect(sortSectorFlowItems(items, 'mainNetInflow', 'asc').map(value => value.name)).toEqual(['C', 'A', 'B'])
		expect(sortSectorFlowItems(items, 3, 'desc').map(value => value.name)).toEqual(['B', 'C', 'A'])
	})
})
