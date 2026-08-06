import {
	collectMobileAssetMetrics,
	evaluateMobileAssetBudget,
	formatBudgetViolations,
	formatMobileAssetMetrics,
	mobileAssetBudget,
} from './mobile-performance-budget'

const metrics = await collectMobileAssetMetrics()
const violations = evaluateMobileAssetBudget(metrics, mobileAssetBudget)

if (violations.length) {
	throw new Error(`Mobile performance budget exceeded:\n${formatBudgetViolations(violations)}`)
}

console.info(`Mobile performance budget passed: ${formatMobileAssetMetrics(metrics)}.`)
