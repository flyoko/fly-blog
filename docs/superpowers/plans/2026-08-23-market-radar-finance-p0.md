# 市场雷达与财经多源 P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不破坏现有博客主题和财经接口的前提下，建立少而精的财经 Provider/去重基础，并上线独立黑金视觉域的 `/market` 页面骨架。

**Architecture:** 继续使用现有 Hono Worker + D1 + 5 分钟 Cron。华尔街见闻保持公开基线；金十通过官方 MCP Provider 接入但默认禁止公开展示；新浪只实现可验证的签名/Provider 边界并在缺正式凭据时禁用。公开财经列表在 Worker 内对可公开来源进行确定性去重。`/market` 只通过根节点局部 CSS token 切换黑金皮肤，不改变全局 color-mode。

**Tech Stack:** Nuxt 4 / Vue 3 / Hono / Cloudflare Workers / D1 / Vitest / Playwright / official Model Context Protocol TypeScript client.

## Global Constraints

- 不把任何真实 Token、appSecret、Cookie 或 Bearer 值写入仓库、D1、客户端 bundle、错误响应或日志。
- 金十公开展示默认关闭，未取得可再展示授权前不在公开 API 直接返回仅来源于金十的正文。
- 新浪无正式 `appKey/appSecret` 时不发送请求，不抓取网页内部接口冒充正式 API。
- `/market` 黑金 token 必须限制在 `.market-terminal` 作用域，离开路由后不能污染其他页面。
- 不生成模拟行情、模拟资金流或随机财经数据。
- 保持 `/api/finance/flash` 向后兼容，只允许添加字段。
- 继续复用现有 `*/5 * * * *` finance-sync，不新增更高频 Cron。
- 不提交、不推送；所有实现停留在独立 worktree。

---

### Task 1: 扩展市场模块配置

**Files:**
- Modify: `shared/admin/site-config.ts`
- Modify: `shared/admin/modules.ts`
- Modify: `config/site/modules.json`
- Modify: `config/site/navigation.json`
- Test: `test/nuxt/module-runtime-integration.spec.ts` 或现有模块配置测试

**Interfaces:**
- Produces: ModuleId `market`, public path `/market`, navigation item `{ id: 'market', url: '/market' }`.

- [ ] **Step 1: 写失败测试**：断言 `modulesConfigSchema` 接受且要求 `market`，`moduleIdForPublicPath('/market') === 'market'`，导航排序为 AI 阅闻后、瞬间前。
- [ ] **Step 2: 运行目标测试确认失败**：`pnpm vitest run test/nuxt/module-runtime-integration.spec.ts --config vitest.config.ts`。
- [ ] **Step 3: 最小实现**：

```ts
export const allowedModuleIds = [
  'articles', 'about', 'moments', 'ai-news', 'market', 'weather', 'music', 'links', 'archive',
] as const
```

并在 `navigationModuleIds`/`modulePublicPathPrefixes` 增加 `market`；配置文件中 market `enabled: true, order: 2`，后续顺序连续递增。
- [ ] **Step 4: 运行目标测试通过**。

### Task 2: 财经 DTO 增加多来源/公开可见语义

**Files:**
- Modify: `shared/admin/finance.ts`
- Create: `workers/api/migrations/0013_finance_source_visibility.sql`
- Modify: `workers/api/src/features/finance/service.ts`
- Test: `workers/api/test/finance.spec.ts`

**Interfaces:**
- Produces: `FinanceFlashSourceDto`, `FinanceFlashDto.sourceCount`, `FinanceFlashDto.sources`, `AdminFinanceFlashDto.publicVisible`.
- Storage: `finance_flash_items.public_visible INTEGER NOT NULL DEFAULT 1`.

- [ ] **Step 1: 写失败测试**：公开列表过滤 `public_visible=0`，管理列表仍能看到私有来源；旧数据默认公开。
- [ ] **Step 2: 运行 `pnpm --filter @fly-living/api-worker test -- finance.spec.ts` 确认失败**。
- [ ] **Step 3: 添加迁移与 DTO 字段**：只增加字段，不删除现有列。
- [ ] **Step 4: `syncAdapter()` 写入 `public_visible`；`list()` 永远只选择可公开条目；`adminList()` 返回可见性字段**。
- [ ] **Step 5: 目标 Worker 测试通过**。

### Task 3: 金十官方 MCP Provider

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `workers/api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `workers/api/src/env.ts`
- Create: `workers/api/src/features/finance/jin10.ts`
- Modify: `workers/api/src/features/finance/service.ts`
- Test: `workers/api/test/finance-jin10.spec.ts`

**Interfaces:**
- Consumes: `env.JIN10_MCP_TOKEN?: string`.
- Produces: `Jin10FinanceFlashAdapter implements FinanceFlashAdapter`, `id = 'jin10-mcp-7x24'`, `publicVisible = false`.

- [ ] **Step 1: 写 Provider 映射测试**：验证空标题、正文标题提取、ISO 时间、URL 白名单、默认私有。
- [ ] **Step 2: 写缺 Secret 测试**：无 Token 返回 disabled/skipped，不产生网络请求。
- [ ] **Step 3: 加 official MCP client 依赖**：在 worker catalog 固定当前稳定版并只在 API Worker 引入。
- [ ] **Step 4: 实现连接**：

```ts
const authProvider = { token: async () => token }
const transport = new StreamableHTTPClientTransport(new URL('https://mcp.jin10.com/mcp'), { authProvider })
const client = new Client({ name: 'fly-living-api', version: '1.0.0' })
await client.connect(transport)
const result = await client.callTool({ name: 'list_flash', arguments: {} })
await client.close()
```

对 `structuredContent` 和 text JSON 两种结果做严格解析；超时/401/格式错误转为来源失败，不回显 Token。
- [ ] **Step 5: service 增加 `syncAll()`**：华尔街见闻始终同步；JIN10 secret 存在时再同步 Jin10；一个来源失败不阻断另一个来源。
- [ ] **Step 6: 目标测试通过**。

### Task 4: 新浪 iNews 正式接入边界

**Files:**
- Modify: `workers/api/src/env.ts`
- Create: `workers/api/src/features/finance/sina-inews.ts`
- Test: `workers/api/test/finance-sina-inews.spec.ts`
- Modify: `docs/superpowers/specs/2026-08-23-market-radar-finance-aggregation-design.md`

**Interfaces:**
- Consumes: optional `SINA_INEWS_APP_KEY`, `SINA_INEWS_APP_SECRET`, `SINA_INEWS_TYPE_IDS`.
- Produces: `signSinaINewsParams(params, secret): string`, `SinaINewsFinanceFlashAdapter` only enabled when both credentials exist.

- [ ] **Step 1: 写签名单测**：过滤空值、按 key 排序、`URLSearchParams` 风格 query、末尾 `&secret`、MD5。
- [ ] **Step 2: 写禁用测试**：缺任一凭据时 `enabled=false` 且不发 fetch。
- [ ] **Step 3: 实现官方 `live7x24_list` GET/JSON Adapter，但默认不加入 `syncAll()` 生产来源**。
- [ ] **Step 4: 文档写明启用流程：联系新浪启用项目 → 获得 appKey/appSecret → Wrangler secret → 预览 Worker → 5 个交易日观测 → 授权确认 → source registry enable**。
- [ ] **Step 5: 目标测试通过**。

### Task 5: 确定性财经去重

**Files:**
- Create: `workers/api/src/features/finance/dedupe.ts`
- Modify: `workers/api/src/features/finance/service.ts`
- Test: `workers/api/test/finance-dedupe.spec.ts`
- Test: `workers/api/test/finance.spec.ts`

**Interfaces:**
- Produces: `groupFinanceEvents(rows): CanonicalFinanceEvent[]`.
- Rules: L0 source unique id；L1 normalized exact title；L2 120 分钟窗口内 bigram/trigram Jaccard；L3 数字和反向语义冲突保护。

- [ ] **Step 1: 写真实风格样本测试**：同事件换序/换前缀合并；涨跌/金额冲突不合并。
- [ ] **Step 2: 实现 normalize**：去来源前缀、全半角/标点/空白归一，不删除数字和方向词。
- [ ] **Step 3: 实现 n-gram/Jaccard 与冲突检测**，阈值集中为常量，所有比较只在分类+120 分钟候选内执行。
- [ ] **Step 4: `list()` 对公开 rows 分组，主事件附加 `sourceCount/sources`；现有单来源返回结构保持兼容。
- [ ] **Step 5: 目标 Worker 测试通过**。

### Task 6: 调度与来源健康

**Files:**
- Modify: `workers/api/src/scheduled-tasks.ts`
- Modify: `workers/api/src/features/finance/routes.ts`
- Modify: `app/components/admin/news/AdminNewsSourceHealth.vue`
- Test: `workers/api/test/scheduled.spec.ts`
- Test: `workers/api/test/finance.spec.ts`

**Interfaces:**
- `syncFinance` 改为 `FinanceFlashService.syncAll()`；仍由现有 `finance-sync` job 调度。

- [ ] **Step 1: 写测试**：5 分钟 job 仍只有一个 `finance-sync`；syncAll 单源失败时结果包含 per-source status 且整体不抛出。
- [ ] **Step 2: 后台手动 `/api/admin/finance/sync` 使用 syncAll，返回来源结果数组**。
- [ ] **Step 3: 来源健康组件识别 `jin10-mcp-7x24` 与 `sina-inews-7x24`，无凭据来源明确显示未启用而非故障**。
- [ ] **Step 4: 目标测试通过**。

### Task 7: `/market` 黑金终端页面

**Files:**
- Create: `app/pages/market/index.vue`
- Create: `app/components/market/MarketStatusStrip.vue`
- Create: `app/components/market/MarketUnavailablePanel.vue`
- Create: `app/components/market/MarketFinanceFeed.vue`
- Create: `app/assets/css/market-terminal.scss` 或 scoped page style
- Modify: `nuxt.config.ts` only if route CSS import is required; prefer page-local import.
- Test: `test/nuxt/market-page.spec.ts`

**Interfaces:**
- Consumes: `/api/finance/flash?limit=8`.
- First release data contract: finance is real; index/sector/watchlist panels are explicit `unavailable/pending-provider`, no fake numbers.

- [ ] **Step 1: 写 Nuxt 单测**：页面含 `.market-terminal`、无硬编码模拟指数数字、财经请求存在、其他主题 token 不被改写。
- [ ] **Step 2: 页面结构**：状态栏 → 指数/市场宽度占位 → 今日资金主线占位 → 自选雷达占位 → 资金持续性占位 → 真实财经事件。
- [ ] **Step 3: 黑金 token**：炭黑背景、石墨面板、香槟金焦点、红涨绿跌；所有 selector 从 `.market-terminal` 开始。
- [ ] **Step 4: 响应式**：桌面双区信息密度；<=680px 单列；数据表自身 `overflow-x:auto`；无整页横向滚动。
- [ ] **Step 5: reduced-motion/transparency**：关闭扫描/位移，实体面板 fallback。
- [ ] **Step 6: 单测通过**。

### Task 8: 浏览器与全量验证

**Files:**
- Create/Modify: `e2e/market.spec.ts`
- Update: acceptance report only if project convention requires.

- [ ] **Step 1: Playwright/浏览器验证 1440×900**：市场黑金、导航、财经加载、控制台无错误。
- [ ] **Step 2: 验证 390×844**：无横向溢出，卡片单列，触控尺寸合格。
- [ ] **Step 3: 从 `/market` 导航到 `/ai.news` 和 `/`**：确认黑金样式不残留。
- [ ] **Step 4: 运行 `pnpm lint`**，预期 0 errors。
- [ ] **Step 5: 运行 `pnpm typecheck`**，预期成功。
- [ ] **Step 6: 运行 `pnpm test:unit && pnpm test:workers`**，预期全部通过。
- [ ] **Step 7: 运行 `pnpm generate && pnpm check:smoke && pnpm check:links && pnpm check:secrets`**。
- [ ] **Step 8: Secret 扫描**：`git grep -nE 'Bearer sk-|JIN10_MCP_TOKEN\s*[:=]\s*[^<]'` 不得出现真实 Token。

## Self-Review

- Spec coverage：覆盖本轮已批准的“少而精数据源、金十 MCP、Sina 正式接入边界、财经去重、市场独立黑金皮肤、移动端与主题隔离”。板块资金、自选实时数据、财报筛选属于下一实施计划，不在本 P0 伪造数据占位。
- Placeholder scan：计划不包含 TBD/TODO/“以后补实现”式占位；未接行情模块明确以 unavailable 状态作为产品行为，而非开发占位。
- Type consistency：`FinanceFlashDto` 为向后兼容增量字段；`syncAll()` 是新增接口，保留 `sync()`；ModuleId `market` 同时进入 schema、模块表和路径映射。
