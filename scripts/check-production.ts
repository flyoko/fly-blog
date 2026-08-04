import process from 'node:process'
import { runProductionProbe } from './production-probe'

function optionalPositiveInteger(value: string | undefined, label: string) {
	if (!value)
		return undefined
	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed <= 0)
		throw new TypeError(`${label} must be a positive integer.`)
	return parsed
}

const checks = await runProductionProbe({
	attempts: optionalPositiveInteger(process.env.PRODUCTION_PROBE_ATTEMPTS, 'PRODUCTION_PROBE_ATTEMPTS'),
	timeoutMs: optionalPositiveInteger(process.env.PRODUCTION_PROBE_TIMEOUT_MS, 'PRODUCTION_PROBE_TIMEOUT_MS'),
	baseDelayMs: optionalPositiveInteger(process.env.PRODUCTION_PROBE_DELAY_MS, 'PRODUCTION_PROBE_DELAY_MS'),
	expectedDeploymentOrigin: process.env.EXPECTED_PAGES_DEPLOYMENT_URL,
})

for (const check of checks)
	console.info(`[production-probe] PASS ${check.name}：${check.detail}`)

console.info(`[production-probe] PASS ${checks.length} 项生产入口检查全部通过。`)
