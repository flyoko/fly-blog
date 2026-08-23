# 自选股雷达 P2A 验收标准

- 日期：2026-08-23
- 依据：`docs/superpowers/specs/2026-08-23-watchlist-radar-p2a-design.md`
- 范围：最多 30 只私有自选股、批量个股报价、5 分钟真实快照、单股质量降级、Private API、`/market` 自选工作区、Cloudflare Remote Provider Gate
- 非目标：全市场扫描、分钟 K/逐笔、Level2、持仓账本、成本价、自动交易、RSI/MACD/KDJ、异常放量/T 信号、完整行业/概念映射

## A. 范围与隐私边界

- [x] A1. P2A 只处理用户主动维护的自选股，业务层与调度层均有**全局最多 30 只**硬门禁，不存在全 A 股扫描路径。
- [x] A2. P2A 明确为单管理员自选雷达；D1 使用 `owner_id` 隔离身份，但当前实现不得扩张为“每个用户各 30 只”的多租户行情服务。
- [x] A3. 后台任务在读取 enabled 自选并请求 Provider 前先统计全局自选总记录数；异常数据导致总记录数超过 30 时 fail-closed，Provider fetch 调用次数为 0，并记录安全健康错误。
- [x] A4. `enabled=false` 的条目仍计入总容量上限，不能通过禁用状态绕过 30 只限制；disabled 条目不参加页面报价和后台同步。
- [x] A5. 自选列表、备注、关注价、标签不会出现在公开 `/api/market/*`、静态生成 payload、公开页面源数据或 URL query 中。
- [x] A6. P2A 不保存持仓数量、仓位、市值、买入成本等账户级投资信息；`attentionPrice` 的语义始终是“关注价”。
- [x] A7. P2A 与 P2B 明确拆分：P2A 不产生异常放量、突破、回撤、T 点、买入/卖出结论，也不做全市场机会扫描。
- [x] A8. 无真实报价时只允许返回/显示可信 last-good 或 unavailable，不存在随机行情、静态示例行情、fixture 行情进入真实运行路径。

## B. 股票身份与自选配置

- [x] B1. 共享模型定义本站标准 `StockExchange` / `StockSymbol`，至少支持 `SSE`、`SZSE`、`BSE`，业务主键不直接使用第三方 Provider secid。
- [x] B2. SSE/SZSE/BSE 股票代码能够被严格 normalize/parse；非法 exchange、非法代码长度/格式、混入任意 URL/查询字符的输入返回 400，不进入上游请求。
- [x] B3. 新增自选时服务端通过 Provider/可信结果确认股票存在并取得名称；浏览器提交的股票名称不能作为可信事实直接写入。
- [x] B4. `market_watchlist` 以 `(owner_id, symbol)` 唯一，重复添加同一股票不会产生重复行。
- [x] B5. 第 31 只自选在服务端被拒绝；并发新增不能通过竞态产生超过 30 条总记录，disabled 条目同样计数。
- [x] B6. `attentionPrice` 仅允许 `null` 或大于 0 的有限数值；`NaN`、Infinity、0、负数及非法字符串被拒绝。
- [x] B7. `note`、tag 数量、单 tag 长度都有明确服务端上限；超限返回验证错误，不静默截断成歧义数据。
- [x] B8. `sortOrder` 由服务端规范化；前端临时排序（涨跌幅、距关注价、成交额）不会自动覆盖持久化自定义顺序。

## C. 个股 Quote Provider 与解析

- [x] C1. P2A 使用独立 `StockQuoteProvider` 边界，不把个股解析逻辑硬塞入 Vue 页面或 P1 指数/板块 Provider 的公共职责。
- [x] C2. 0 只自选时 Provider fetch 调用次数为 0。
- [x] C3. 1–30 只股票使用单批请求；primary Host 返回有效批量 payload 时**正常 30 股刷新上游请求数必须为 1**，不得循环执行 30 次 HTTP fetch。
- [x] C4. 上游返回顺序与请求顺序不一致时，仍能按标准 `StockSymbol` 正确映射股票，不依赖数组位置。
- [x] C5. 有效实时 `StockQuote` 至少要求 `price/change/changePct/marketAt`；任一核心字段缺失，该股票不得标记为 live。
- [x] C6. `open/high/low/previousClose/volume/turnover/turnoverRate` 允许为 null；`'-'`、空字符串、`null`、非法数字不得转成 0。
- [x] C7. `marketAt` 来自可信行情时间，不能以 Worker `fetchedAt` 或浏览器当前时间冒充交易所行情时间。
- [x] C8. Provider 支持部分成功：30 只中只有 28 只有效时返回 28 个 quote + 2 个 missing，不把整个批次折叠成失败。
- [x] C9. primary Host 网络错误、4xx、5xx、timeout 时尝试 fallback；primary 成功且 payload 有效时不得额外请求 fallback。
- [x] C10. primary HTTP 200 但 payload 无效、空数据或解析不通过时同样尝试 fallback；parser 必须在每个 Host attempt 内执行。
- [x] C11. primary + fallback 均失败时返回安全失败，不生成兜底数字；错误摘要有长度上限且不包含响应头、Cookie、Session、Secret 或完整私人自选列表。
- [x] C12. Cloudflare Workers 运行时使用正确的全局 `fetch` 调用方式，远端 probe 不出现 P1 已发现的 `Illegal invocation` 回归。

## D. D1 快照与质量语义

- [x] D1. 新迁移创建 `market_watchlist` 与 `market_watchlist_quote_5m`，主键/索引支持按 owner、symbol、时间桶读取自选和 last-good。
- [x] D2. `market_watchlist_quote_5m` 保存真实 `market_at` 与 `fetched_at`，并使用稳定 5 分钟 `bucket_at`；同 owner/symbol/bucket 重复同步不会生成重复行。
- [x] D3. 页面 45 秒实时报价成功默认不写 `market_watchlist_quote_5m`；5 分钟历史只由后台同步路径写入。
- [x] D4. 当前实时 Provider 有该股票有效 quote 时该股票 `quality=live`，`quote` 来自当前真实响应。
- [x] D5. 当前实时 Provider 缺失/失败且 D1 有最后成功真实快照时该股票 `quality=stale`，并返回正确的 `staleAgeMs`。
- [x] D6. 当前实时 Provider 缺失/失败且 D1 无可信快照时该股票 `quality=unavailable`、`quote=null`，不显示示例价格。
- [x] D7. 混合 28 live + 1 stale + 1 unavailable 时，其余 28 只保持 live，外层聚合 `quality=degraded`。
- [x] D8. 所有可展示项目均只能使用 last-good 时外层 `quality=stale`；所有项目均无可信报价时为 `unavailable`。
- [x] D9. 已登录但自选数为 0 时返回明确空 `items`/空状态，不把“没有自选”误判为 unavailable。
- [x] D10. 页面实时 Provider 部分缺股时不覆盖/删除对应历史；后台 5 分钟同步单股失败也不回滚其他股票的成功快照。
- [x] D11. `market_source_health` 能记录 stock quote/watchlist sync 的最近尝试、最近成功、条数、延迟、失败摘要，不记录私人 watchlist 明细或秘密信息。
- [x] D12. D1/内部基础设施错误与上游行情不可用区分处理；数据库故障不能被伪装成正常 stale 行情。

## E. 后台 5 分钟调度与资源预算

- [x] E1. 复用现有 `*/5 * * * *` Cron/Queue 链路增加 `market-watchlist-sync`，不新增 Cloudflare Cron trigger。
- [x] E2. 后台同步仅在既有 A 股交易窗口门禁内请求上游；盘外/周末/休市时 Provider fetch 调用次数为 0。
- [x] E3. 空自选或全部 disabled 时后台 Provider fetch 调用次数为 0。
- [x] E4. 正常后台同步读取最多 30 只 enabled 自选，并使用一次批量报价；不产生一股一请求的放大。
- [x] E5. Provider 整体失败时不写虚假 bucket；此前 last-good 快照保持不变。
- [x] E6. 单股缺失时其他成功股票照常写入同一 5 分钟桶，不做全批次事务回滚。
- [x] E7. 5 分钟快照规模符合设计预算；P2A 不新增全市场 Tick、逐笔或分钟 K 存储。
- [x] E8. Queue/调度日志只记录 capability、数量、requestId、安全错误摘要和时间，不输出完整私有自选列表。

## F. Private API 与安全

- [x] F1. `GET /api/admin/market/watchlist` 仅登录用户可访问，返回当前 owner 的私人自选配置；未登录返回 HTTP 401 / `UNAUTHENTICATED`，与现有 `requireSession` 合同一致。
- [x] F2. `POST /api/admin/market/watchlist` 要求 Session + CSRF + write rate-limit，并执行股票存在性验证和 30 只上限。
- [x] F3. `PATCH /api/admin/market/watchlist/:symbol` 要求 Session + CSRF + write rate-limit，只能修改当前 owner 的记录。
- [x] F4. `DELETE /api/admin/market/watchlist/:symbol` 要求 Session + CSRF + write rate-limit，只能删除当前 owner 的记录。
- [x] F5. `GET /api/admin/market/watchlist/quotes` 要求 Session，读取当前 owner 的 0–30 自选并一次返回配置 + 当前/last-good quote。
- [x] F6. 所有 admin market 响应包含 `Cache-Control: private, no-store`，不得进入 P1 的公共 Cache API。
- [x] F7. quote GET 有 session 级 read limiter；正常 45 秒轮询和少量手动刷新可用，但每秒刷接口会被限制。
- [x] F8. API 不返回第三方原始 payload、内部 D1 SQL 字段、调用堆栈、凭据、Cookie 或其他 owner 的私人数据。
- [x] F9. 路由参数 `symbol` 经过严格 parse/normalize 后才进入 Service/Provider，不能直接字符串拼接到第三方 URL。
- [x] F10. 公开 `/api/market/*` 的响应结构不新增任何 watchlist、note、attentionPrice、tags 字段。

## G. `/market` 自选工作区 UI

- [x] G1. `/market` 保留 `雷达 / 资金 / 自选 / 信号 / 策略` 工作区，自选被激活时显示“私有自选 · 最多30只”和手动刷新入口。
- [x] G2. 未登录访问公开 `/market` 时不调用私人 watchlist API，只显示“自选雷达 · 私有 / 登录后查看 0–30 只自选股”类明确入口。
- [x] G3. 已登录但 0 只自选时显示空状态和添加入口，不显示 unavailable 错误态。
- [x] G4. Desktop 主体按设计展示股票、现价、涨跌幅、日内高低、成交额、距关注价、状态；A 股严格红涨绿跌。
- [x] G5. `距关注价` 按当前真实 price 与 `attentionPrice` 派生；未设置关注价显示 `--`，不把关注价解释成成本价/盈亏。
- [x] G6. 日内 high-low 使用轻量 range bar；high/low 缺失时显示缺失态，不补造区间或 0。
- [x] G7. 交易时段单股状态明确显示 `LIVE`、`STALE · Xm`、`UNAVAILABLE`；混合状态时摘要区正确统计各状态数量并显示 `DEGRADED`。
- [x] G8. 正常收盘后不继续使用用户可见 `LIVE` 文案误导为实时行情，改为“已收盘 · HH:mm”/“最近行情”等闭市语义，并保留真实最后交易时间。
- [x] G9. `unavailable` 股票不显示静态示例价；页面有可见说明“无真实报价时显示 unavailable / last-good，不生成模拟行情”。
- [x] G10. Desktop 允许前端切换涨跌幅、距关注价、成交额等排序，但刷新/切换不会意外覆盖持久化 `sortOrder`。
- [x] G11. “最近相关事件”只使用本站已有可信财经数据做轻量关联；无可信关联时显示空状态，不生成 AI 因果事件或虚构公告。
- [x] G12. Mobile 使用单列股票卡，不把 Desktop 宽表硬压缩；卡片至少包含名称/代码、当前价、涨跌幅、距关注价、日内区间、成交额和质量状态。
- [x] G13. 320、360、390、430、768、1024、1280、1440、1728px 不产生 document-level 横向溢出；移动端关键触控目标 >=44px。
- [x] G14. light/dark/dynamic 下 `/market` 局部黑金主题不回退；SPA `/market -> /` 后 `body/#blog-root` 不残留 `--market-*` 样式变量。
- [x] G15. `prefers-reduced-motion` / `prefers-reduced-transparency` 继续符合 P0/P1 基线；关键操作不依赖 hover。

## H. 页面轮询生命周期

- [x] H1. 进入自选工作区且页面 visible 时立即刷新一次，之后以 45,000ms 周期请求私人 quote endpoint；测试可用 fake timers 精确验证单个周期。
- [x] H2. 切换到雷达/资金/信号/策略工作区后停止自动 quote 轮询。
- [x] H3. `document.visibilityState !== 'visible'` 时停止自动轮询；回到 visible 且仍在自选工作区时立即刷新一次并恢复周期。
- [x] H4. 正常盘外不持续执行 45 秒上游轮询；页面展示最近可信交易时间，允许用户手动刷新。
- [x] H5. 上一轮 quote 请求尚未结束时不会叠加下一轮自动刷新。
- [x] H6. 离开自选工作区/页面卸载时中止未完成请求，不留下幽灵刷新或 Vue unmount 后状态写入。
- [x] H7. 手动刷新与自动刷新共享同一请求状态/并发保护，不会同时触发两次批量 Provider 请求。
- [x] H8. 页面轮询成功不会写 5 分钟历史，验证“用户开几个标签页”不会改变 D1 历史采样密度。

## I. Cloudflare Remote Provider Gate

- [x] I1. 使用 `wrangler dev --remote` 或独立临时 probe Worker，从 Cloudflare 实际执行环境测试 30 股批量报价；本机 curl/Node 成功不能替代该证据。
- [x] I2. Remote probe 至少覆盖设计上限的 30 股完整批量，并记录 attempts、成功、部分缺失、4xx、5xx、network/timeout、P50、P95 和实际命中 Host。
- [x] I3. Instant Gate：批量请求成功率 `>=95%`。
- [x] I4. Instant Gate：有效股票返回率 `>=99%`；缺失股票按 missing/stale/unavailable 处理，不以 0 补齐。
- [x] I5. Instant Gate：P95 `<2500ms`。
- [x] I6. 正常 30 股 remote 请求上游 fetch 数为 1；primary 失败后的最大请求数为 2。
- [x] I7. Remote fixture/probe 明确验证 4xx、5xx、timeout、HTTP 200 + 无效 payload 都能触发 fallback。
- [x] I8. 未通过任一 Instant Gate 时不得把个股实时 Provider 标 production-ready；UI 保持真实 last-good/unavailable，不以 mock 绕过。
- [x] I9. Remote probe 不修改生产 Worker、不写正式 D1/Queue/Secret；临时 Worker/目录如创建，在验收后清理并留证据。
- [x] I10. P2A 本地实现完成不等于正式生产 SLA 已完成；连续多交易日稳定性如未观察，验收记录必须明确写“未宣称通过正式生产 SLA”。

## J. 自动化、回归与收尾

- [x] J1. Provider tests 覆盖 symbol 编码、1/30 股批量、乱序映射、null/`-`、部分缺股、4xx/5xx/timeout fallback、HTTP 200 无效 payload fallback、双 Host 失败与 Workers fetch wrapper。
- [x] J2. Service/D1 tests 覆盖 30 只硬上限、并发第 31 只、owner 隔离、live/stale/unavailable、聚合 degraded/stale、空自选、页面不写 5m、后台 bucket upsert、单股失败不回滚、盘外 zero-fetch。
- [x] J3. Route/Auth tests 覆盖未登录、CSRF、read/write limiter、`private, no-store`、非法 symbol/attentionPrice/tag/note、第 31 只、跨 owner 访问拒绝。
- [x] J4. Nuxt/unit tests 覆盖未登录、空自选、mixed quality、关注价距离、收盘文案、无模拟价格、45 秒轮询生命周期、visibility/workspace pause、并发刷新保护。
- [x] J5. `pnpm verify` exit 0，包含 lint/typecheck/unit/workers/generate/smoke/links/secrets 等现有总门禁，无新增回归。
- [x] J6. Worker `wrangler deploy --dry-run` 成功，体积未突破当前 Cloudflare 部署限制；只做 dry-run，不生产部署。
- [x] J7. Browser acceptance 至少覆盖 1440×900 与 390×844，并扩展检查 320/360/390/430/768/1024/1280/1440/1728 的无页面级横向溢出。
- [x] J8. Browser acceptance 覆盖 live/degraded/stale/unavailable、未登录、空自选、单股 unavailable、收盘语义、Desktop/Mobile、三主题、reduced motion、SPA 离开和 console/errors。
- [x] J9. `git diff --check` 通过；Secret 扫描无新增生产凭据；日志/测试产物无私人 watchlist 明细泄露。
- [x] J10. 用户已在实施阶段明确授权 commit、push 与生产部署；仅在 I/J 其余技术门禁通过后执行生产发布，并记录目标 SHA、工作流与线上 smoke。

## 验收记录模板

实施完成后在本文件下方追加真实证据，不预填通过结果：

### Provider / D1 证据

- Provider 专项测试：`market-eastmoney-stock.spec.ts` 18/18 PASS，含 1/30 股批量、乱序、null、missing、4xx/5xx/timeout/200-invalid fallback 与 30 股上限。
- Service/D1 专项测试：`market-watchlist.spec.ts` 13/13 PASS，含全局 30 只、disabled 计数、owner 隔离、质量回退、5m upsert、盘外 zero-fetch、sortOrder 连续归一。
- Route/Auth 专项测试：`market-watchlist-routes.spec.ts` 7/7 PASS；`scheduled.spec.ts` 11/11 PASS，覆盖 401/CSRF/read-write limiter/private no-store/CRUD/Queue。

### Cloudflare Remote Gate 证据

| metric | result | gate | verdict |
| --- | ---: | ---: | --- |
| batch success rate | 20/20 = 100% | >=95% | PASS |
| valid stock return rate | 600/600 = 100% | >=99% | PASS |
| P50 | 178ms | info | PASS |
| P95 | 351ms | <2500ms | PASS |
| normal upstream requests / 30 stocks | 1（20/20 样本） | 1 | PASS |
| max requests after primary failure | 2 | 2 | PASS |

### Cloudflare Remote Gate 详细证据

- 方式：临时 `wrangler dev --remote` preview，Worker 名 `fly-market-watchlist-probe-20260823`；无 D1/R2/Queue/Secret binding，30 股请求由 Cloudflare edge 执行。
- 首次样本暴露 Host 顺序缺陷：旧顺序 `push2 -> push2delay` 虽 30/30 有效，但总延迟 1040ms 且 `upstreamRequests=2`，未满足“正常批量请求=1”门禁。
- TDD 修复：先把 Provider 测试改为要求 Cloudflare 已验证可达的 `push2delay` 优先，得到 3 个预期红测；随后将 Host 顺序改为 `push2delay -> push2`，18/18 Provider tests 重新通过。
- 最新 remote 正常路径：20 次 × 30 股，共 600 个请求股票位，20/20 批次成功、600/600 有效、missing=0；P50=178ms、P95=351ms、max=467ms；20/20 都只执行 1 次 upstream；成功 endpoint 全部为 `push2delay.eastmoney.com/api/qt/ulist.np/get`。
- Remote 故障注入：`force-403`、`force-502`、`force-invalid`、`force-timeout` 均显示 `upstreamRequests=2`，证明 parser/HTTP/timeout 失败都会进入 fallback。备用 `push2.eastmoney.com` 在当前 Cloudflare 出口返回 HTTP 502，因此这些注入请求最终安全失败，没有生成伪行情。
- 客户端采样说明：Python `urllib` 访问本地 Wrangler preview 被 preview 层直接 403，未进入 Worker；正式 20 次 Gate 样本统一使用 `curl`，均得到 Worker JSON 200，不把 preview 客户端兼容问题计入 Provider 成功率。
- preview 关闭后执行 `wrangler deployments list --name fly-market-watchlist-probe-20260823 --json` 返回 Cloudflare `10007 Worker does not exist on your account`，确认没有持久 Worker 部署。
- 正式连续多交易日生产 SLA 尚未观察，本轮只宣称 P2A Instant Gate 通过。

### 自动化总门禁

- `git diff --check`：PASS（最新生产代码与测试工作树）。
- `pnpm verify`：PASS，root 33 files / 273 tests；Edge 1 file / 34 tests；API 28 files / 261 tests；generate/smoke/links/secrets 全通过。
- Worker dry-run：PASS，Total Upload 1938.38 KiB / gzip 374.52 KiB，`MARKET_READ_RATE_LIMITER` 等 binding 正常。
- Secret scan：PASS，791 个 tracked/generated 文件无 Secret pattern 命中。

### 浏览器验收

- Desktop：PASS，1440×900 mixed quality、CRUD、关注价、相关事件、收盘语义、四种临时排序均通过；排序切换产生 0 次 PATCH。
- Mobile：PASS，320/360/390/430 使用单列卡片，关键触控目标（含排序/CRUD）最小 44px；768+ 回到桌面表格。
- quality states：PASS，live（收盘文案）、degraded/mixed、stale、unavailable、未登录、空自选、单股 unavailable 均覆盖。
- themes / reduced motion / SPA：PASS，light/dark/dynamic 下 Market token 一致；reduced-motion 命中且 animation=none；`/market -> /` 后 Market token/节点无残留。
- console/errors：PASS，最终 Playwright 验收 console/page/network failures 均为 0。

### i9 最终自动化与浏览器证据

- 最终 `git diff --check && pnpm verify`：exit 0。
- Root：33 files / **273 tests**；Edge：1 file / **34 tests**；API：28 files / **261 tests**。
- `pnpm generate` 成功；Nuxt Link Checker 0 error / 0 warning；generated smoke 通过；29 个 HTML 无 broken internal href。
- Secret scan：791 个 tracked/generated 文件，无新增 Secret pattern。
- API Worker dry-run：**1938.38 KiB / gzip 374.52 KiB**，exit 0。
- 浏览器宽度 sweep：320/360/390/430/768/1024/1280/1440/1728 全部 `documentElement.scrollWidth === clientWidth`。
- 320/360/390/430：Mobile card 模式，关键触控目标（含排序和 CRUD）最小 **44px**；768+ Desktop table 模式。
- 未登录：进入自选工作区只请求 `/api/auth/session`，**0 次** `/api/admin/market/watchlist*` 私有请求。
- CRUD：POST/PATCH/DELETE 全通过，最终 request failure=0；DELETE 从 204 调整为 200 JSON 后消除 Chromium `net::ERR_ABORTED` 噪声。
- 临时排序：自定义顺序/涨跌幅/距关注价/成交额四种模式通过；排序切换产生 **0 次 PATCH**，不会覆盖持久 `sortOrder`；服务端重排测试验证 sort index 归一为连续 `0..n-1`。
- 质量状态：stale 全部 `STALE · 3m`；unavailable 全部 `UNAVAILABLE`；收盘后的真实最新行情显示 `已收盘 · 15:00`，不显示 LIVE；mixed 同时保留收盘/STALE/UNAVAILABLE。
- 三主题：light/dark/dynamic 下 `/market` 局部 token 一致；reduced-motion matches=true、scrollBehavior=auto、terminalAnimation=none。
- SPA `/market -> /`：`.market-terminal` 卸载，`body/#blog-root` 无 `--market-gold` 残留；console/page/network errors 最终均为 0。
- 当前 Agent 最终代码审查：公开 `/api/market/*` 无 watchlist/attentionPrice/tags 泄漏；生产代码无 `Math.random`/mock quote；部署期 Edge 修复只扩展既有 API namespace 到 `/api/market/`，对应 overview/sector-flows 红绿测试与线上 200 JSON 已验证；二次复审未发现剩余 Critical/Important。

### J10 生产发布与 Edge 回归证据

- 最终生产代码 SHA：`d9a251663ed6c3ba37246c824829a20d6fb5d88d`（`fix: route public market api through edge`），已 push 到 `main`。
- Workers Production：run `32613136416`，PASS。`pnpm typecheck`、`pnpm test:workers`、D1 migrations、Queue 检查、API Worker、Edge Worker、same-origin health 全部成功。
- Pages Production：run `32613227042`，PASS，且 head SHA 同为 `d9a2516`。`verify:pages-source`、`verify:pages`、artifact、Cloudflare Pages deploy、`Verify controlled production entries` 全部成功。
- 发布前最终本地总门禁（Edge 路由修复后重跑）：`git diff --check && pnpm verify` exit 0；Root **33 files / 271 tests**，Edge **1 file / 36 tests**，API **28 files / 255 tests**；generate/smoke/links/secrets 全通过。
- 最新 generate：Nuxt Link Checker 0 error / 0 warning；28 个 generated HTML 无 broken internal href；Secret scan 扫描 789 个 tracked/generated 文件，无 Secret pattern。
- Edge Worker dry-run：PASS，Total Upload **15.55 KiB / gzip 4.57 KiB**；API Worker 的 P2A dry-run 在前置 i9 已 PASS（1938.38 KiB / gzip 374.52 KiB）。
- 第一轮真实生产 smoke 暴露 Edge 路由缺陷：`/api/health` 已命中新 API，但 `/api/market/overview` 返回 Pages HTML 404；根因是 `workers/edge/src/index.ts` 的 API prefix 漏掉 `/api/market/`。
- 该线上缺陷按 TDD 修复：先给 `/api/market/overview`、`/api/market/sector-flows` 增加路由红测，得到 **2 fail / 34 pass**；再只增加 `/api/market/` prefix，复测 **36/36 PASS**，Edge typecheck、全仓 `pnpm verify` 与 dry-run 再次通过后才推送生产。
- 最终线上 API smoke：`GET /api/health` 200；`GET /api/market/overview` 200 JSON；`GET /api/market/sector-flows?kind=industry&limit=3` 200 JSON；未登录 `GET /api/admin/market/watchlist` 401 / `UNAUTHENTICATED`，证明 public market 已经正确经过 Edge，同时 private watchlist 仍保持登录边界。
- 最终线上 Desktop 1440×900：`/market` P2A 正常加载，自选工作区未登录时只显示 `自选雷达 · 私有 / 登录后查看和维护你的 0–30 只自选股`，没有私人列表泄露；console/page/network errors 均为 0。
- 最终线上 Mobile 390×844：单列布局正常，切换自选后保持同一私有登录边界；browser page width=390，console/page/network errors 均为 0。
- 最终线上离开 `/market` 返回首页后无 browser console/page/network error；P0/P1 的主题/SPA 细节仍由 i9 完整宽度与三主题验收覆盖。

### 未完成生产边界

- 正式生产 SLA：**未宣称通过**；P2A Instant Cloudflare Gate 已通过并已上线，但连续多交易日稳定性仍需后续生产观察。
- commit：已完成；P2A 功能提交链及部署期修复均已提交。
- push：已完成；生产代码 SHA `d9a251663ed6c3ba37246c824829a20d6fb5d88d` 已在 `main`。
- production deploy：已完成；Workers run `32613136416`、Pages run `32613227042` 均成功。
