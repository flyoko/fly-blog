import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const service = readFileSync('workers/api/src/features/finance/service.ts', 'utf8')

describe('finance public read CPU contracts', () => {
	it('groups the full public set without loading every long summary body', () => {
		expect(service).toContain('const FINANCE_GROUPING_SELECT_COLUMNS')
		expect(service).toContain('NULL AS summary')
		expect(service).toContain('SELECT id, summary FROM finance_flash_items WHERE id IN')
		expect(service).not.toMatch(/async list\([\s\S]*?SELECT f\.\* FROM finance_flash_items f[\s\S]*?async todayThemes/u)
	})

	it('reuses the lightweight grouping projection for today themes', () => {
		expect(service).toMatch(/async todayThemes\([\s\S]*?SELECT \$\{FINANCE_GROUPING_SELECT_COLUMNS\} FROM finance_flash_items f/u)
	})
})
