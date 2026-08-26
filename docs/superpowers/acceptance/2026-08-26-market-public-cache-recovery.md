# 市场公共缓存恢复验收标准

- 日期：2026-08-26
- 修复提交：`82b43997cf1a097b6a682c2052c223135dbb3398`
- 范围：公共 API 缓存判定、市场/财经接口稳定性与防复发门禁

## A. 根因与缓存语义

- [x] A1. 普通访客仅携带 `fly_analytics_visitor` / `fly_analytics_session` 时，不再被判定为有状态请求。
- [x] A2. 仅 analytics Cookie 的公共请求可进入 `MISS -> HIT` 缓存流程，避免每次直打上游。
- [x] A3. `fly_admin_session`、`fly_moment_visitor`、任意未知 Cookie 仍强制 `BYPASS`。
- [x] A4. `Authorization` 请求仍强制 `BYPASS`，避免认证内容进入公共缓存。

## B. 市场与财经回归

- [x] B1. `/api/finance/flash`、`/api/finance/themes/today`、`/api/market/overview`、`/api/market/sector-flows` 的正常公共读取合同不变。
- [x] B2. 行业/概念资金、中信期货、财报策略、自选/信号既有接口语义不回归。
- [x] B3. 市场页面与资金表格现有前端契约测试通过。

## C. 自动化防复发

- [x] C1. `public-cache.spec.ts` 明确覆盖 analytics Cookie 可缓存、状态 Cookie 必须 BYPASS、Authorization 必须 BYPASS。
- [x] C2. 回归测试已验证红绿循环：修复前 analytics Cookie 场景失败，修复后通过。
- [x] C3. API Worker 类型检查、目标 ESLint、`git diff --check` 通过。
- [x] C4. 市场/Citic 后端测试 161/161 通过；缓存影响范围中的 moments/music/news/weather 32/32 通过；缓存+市场路由+财经 23/23 通过；市场前端契约 26/26 通过。

## D. 生产验收

- [ ] D1. 修复提交进入 `main` 并完成生产部署。
- [ ] D2. 新浏览器访问 `/market` 后，携带 analytics Cookie 的公共市场/财经接口不再持续显示 `X-Fly-Cache: BYPASS`。
- [ ] D3. 生产浏览器切换行业/概念资金、中信期货、策略页时无本次 502 故障复现。
- [ ] D4. 生产关键 API 连续探测无新增 5xx，并确认自选/信号未登录状态仍按预期鉴权。

## 当前验收证据

- 修复前：`public-cache.spec.ts` 5 个测试中 analytics Cookie 用例失败，实际为 `BYPASS`；其余 4 条安全边界通过。
- 修复后：`public-cache.spec.ts` 5/5 通过。
- 市场/Citic：10 个测试文件，161/161 通过。
- moments/music/news/weather：32/32 通过。
- 缓存+市场路由+财经：23/23 通过。
- 市场 Nuxt/sector table：26/26 通过。
- API Worker `wrangler types && tsc -p tsconfig.json --noEmit`：exit 0。
- 目标 ESLint 与 `git diff --check`：exit 0。
