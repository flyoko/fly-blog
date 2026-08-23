# 自选股盘中信号雷达 P2B 验收标准

- 设计来源：`docs/superpowers/specs/2026-08-23-watchlist-signal-radar-p2b-design.md`
- 引擎：`balanced-v1`
- 用户选择：B · 均衡型
- 原则：PASS 必须有测试、replay、构建、浏览器或生产证据；不得用模拟行情替代真实数据。

## A. 范围、隐私与资源

- [x] A1. 仅处理 enabled 的私有自选，沿用 P2A 全局最多 30 只硬门禁。
- [x] A2. 不实现全 A 扫描、板块全量分钟扫描或 30 只上限绕过。
- [x] A3. 不新增行情 Provider；只读 `market_watchlist_quote_5m` 派生信号。
- [x] A4. 不新增 Cloudflare Cron；复用现有 `*/5` → Queue → `market-watchlist-sync`。
- [x] A5. signal evaluation 产生 0 次额外第三方行情 fetch。
- [x] A6. 不存持仓、仓位、成本价、盈亏等账户级投资数据。
- [x] A7. 不产生自动下单或买入/卖出/加减仓结论。
- [x] A8. 首版不新增 Browser Push、微信、Telegram、邮件通知。
- [x] A9. public `/api/market/*` 不新增 signal/watchlist/attentionPrice/note 等私人字段。
- [x] A10. 日志不输出完整私人 symbol/note/attentionPrice 列表、Cookie、Session、raw payload。

## B. 严格 5 分钟时间序列

- [x] B1. `turnover` 被视为日内累计量，5m 成交额因子使用 `current - previous`；volume 不进入 balanced-v1 score。
- [x] B2. 5m delta 只在同一 Asia/Shanghai 交易日有效。
- [x] B3. 5m delta 不跨 11:30–13:00 午休。
- [x] B4. `bucketAt` 必须严格相邻且差值正好 5 分钟。
- [x] B5. 缺一个桶时，10 分钟累计差不得冒充 5m turnover。
- [x] B6. `marketAt` 重复或倒退时该区间 unavailable。
- [x] B7. turnover 为 null 时 flow delta unavailable，不补 0。
- [x] B8. turnover cumulative delta < 0 时 fail-closed，不取绝对值/不归零。
- [x] B9. 10m price window 必须由三个连续 5m bucket 构成。
- [x] B10. 跨日、午休、缺桶、异常 delta 不借更老快照补当前窗口。
- [x] B11. 09:20–09:29 不产生普通量价信号。
- [x] B12. 15:00 后不产生新的普通盘中量价信号。
- [x] B13. 首个正常桶 attention gap-cross 可用可信 `previousClose`，但不伪装成 5m 变化。

## C. 基线

- [x] C1. 优先使用过去最多 5 个交易日相同 5m 时间槽的有效 delta。
- [x] C2. historical-slot baseline 使用 median，不使用 mean/sum。
- [x] C3. historical-slot 至少 3 个有效交易日样本才 ready。
- [x] C4. 历史槽不足时回退同一 session 之前最多 6 个有效 5m delta median。
- [x] C5. intraday rolling baseline 至少 4 个有效样本。
- [x] C6. intraday baseline 不跨午休、不包含 current bucket。
- [x] C7. 两类 baseline 均不足时状态为 warming/unavailable，不伪造基线。
- [x] C8. 缺失样本不以 0 进入 median。
- [x] C9. 优先级固定 historical-slot → intraday rolling → unavailable。
- [x] C10. 同一 fixture 重放结果确定性一致，不依赖 Math.random/隐式系统时间。

## D. balanced-v1 原子因子

- [x] D1. TURNOVER_SURGE 普通：ratio >= 2.0 且 `deltaTurnover >= 3,000,000` CNY。
- [x] D2. TURNOVER_SURGE 强：ratio >= 3.0，仍要求绝对成交额底线。
- [x] D3. `balanced-v1` 不用 volume 替代 turnover；turnover 缺失时量能因子 fail-closed，volume 不进入 score。
- [x] D4. PRICE_ACCELERATION 普通：abs(5m)>=1.0% 或合法 abs(10m)>=1.5%。
- [x] D5. PRICE_ACCELERATION 极端：abs(5m)>=1.8%。
- [x] D6. RANGE_BREAK 使用 current 之前 6 个连续 5m snapshot `price` 的 max/min，不含 current，且绝不使用 P2A 当日累计 `high/low`。
- [x] D7. 普通/强上破阈值分别为 `previousRangeHigh * 1.002` / `* 1.005`。
- [x] D8. 普通/强下破阈值分别为 `previousRangeLow * 0.998` / `* 0.995`。
- [x] D9. 普通 RANGE_BREAK 单独不能形成用户 signal。
- [x] D10. ATTENTION_CROSS up：previous < attention <= current。
- [x] D11. ATTENTION_CROSS down：previous > attention >= current。
- [x] D12. `attentionPrice=null` 时无 attention-cross 因子。
- [x] D13. 5m >= +0.30% 定义 up；<= -0.30% 定义 down；中间 neutral。
- [x] D14. DIRECTION_ALIGNMENT 只在实际同向时加分，neutral 不加。

## E. 组合评分与用户信号

- [x] E1. `balanced-v1` 阈值/分数集中定义并版本化，不散落在 Vue/route/SQL。
- [x] E2. TURNOVER_SURGE 分数：普通 30 / 强 40。
- [x] E3. PRICE_ACCELERATION：普通 25 / 极端 50。
- [x] E4. RANGE_BREAK：普通 25 / 强突破 35，强突破由 ±0.5% 边界判定。
- [x] E5. ATTENTION_CROSS 固定 55，可独立达到 watch。
- [x] E6. DIRECTION_ALIGNMENT +10；最终 score cap 100。
- [x] E7. score <50 不持久化用户 signal。
- [x] E8. 50–69 → `watch`；>=70 → `strong`。
- [x] E9. 普通单一 TURNOVER_SURGE 不会独立刷出 signal。
- [x] E10. 极端 5m price 可独立 watch，但 evidence 不写成“价量共振”。
- [x] E11. 价量组合 fixture 得到预期 watch；强放量+突破 fixture 得到 strong。
- [x] E12. 同一 symbol/bucket 最多 1 条组合 signal；signalType 优先级固定 attention-cross > range break > turnover momentum > extreme price-spike。
- [x] E12b. 用户 signalType 仅 momentum/breakout/breakdown/attention-cross/price-spike 观察语义，未获主类型的成立因子仍保留在 evidence/score。
- [x] E13. 用户可见文案不出现 buy/sell/买点/卖点/建议交易。
- [x] E14. 每条 signal 有 marketAt、direction、severity、score、engineVersion、结构化 evidence。

## F. 冷却、去重、幂等

- [x] F1. 唯一性至少包含 owner+symbol+bucketAt+signalType+engineVersion。
- [x] F2. Queue retry 不产生重复 signal row。
- [x] F3. 同 bucket quote upsert 后再次评估不重复 signal。
- [x] F4. 普通同 symbol+direction 量价信号 cooldown 20 分钟。
- [x] F5. 同 symbol+direction attention-cross cooldown 30 分钟。
- [x] F6. up/down cooldown 独立，真正反转不被旧方向抑制。
- [x] F7. cooldown 内 strong 仅在比最近同向 watch 至少高 15 分时穿透。
- [x] F8. strong 穿透新增历史记录，不修改旧 watch。
- [x] F9. cooldown 只抑制 signal 持久化，不修改底层 quote_5m。
- [x] F10. deterministic replay 得到相同 candidate/idempotency key。

## G. D1 与生命周期

- [x] G1. `0016_market_watchlist_signals.sql` 创建 signal 表及 owner/time、owner/symbol/time 索引。
- [x] G2. signal evidence 仅保存有限白名单数值/因子，不复制第三方 raw payload。
- [x] G3. 每条 row 固化 `engine_version=balanced-v1`。
- [x] G4. SignalService 对最多 30 股历史采用批量读取，禁止一股一 SQL 查询放大。
- [x] G5. 历史查询仅取约 8 日范围及必要列；balanced-v1 不读取 volume/high/low 参与评分。
- [x] G6. disabled 股票不参与 signal evaluation。
- [x] G7. signal 表对 `(owner_id,symbol)` 使用 `ON DELETE CASCADE` 外键；删除 watchlist 后同 owner+symbol signals 原子消失，不留孤儿。
- [x] G8. `market_watchlist_quote_5m` 不因 P2B 新增级联外键；删除自选不改变 P2A quote_5m 既有 retention 策略。
- [x] G9. signal retention 为 30 自然日。
- [x] G10. cleanup 复用现有 `31 19 * * *` content-maintenance，不新增 Cron。
- [x] G11. cleanup 不影响 watchlist、quote_5m、news/finance 等其他数据。

## H. Scheduler / Queue 集成

- [x] H1. 不新增并行 `market-signal-sync` Queue message。
- [x] H2. 正常顺序严格为 fetch quotes → write quote_5m → evaluate affected → persist signals。
- [x] H3. Provider 全失败时 signal evaluation 调用次数为 0。
- [x] H4. partial quote 只评估成功写入 snapshot 的 symbols。
- [x] H5. snapshot D1 写失败时不继续基于未持久化行情生成 signal。
- [x] H6. SignalService 基础设施错误可触发 Queue retry，不吞错写空/假 signal。
- [x] H7. retry + UNIQUE/idempotency 保证不重复。
- [x] H8. 盘外 P2A zero-fetch 语义保持不回归。
- [x] H9. `scheduledJobsFor('*/5 * * * *')` 不新增 signal job，Cron/Queue 数量不膨胀。
- [x] H10. content-maintenance 加入 signal cleanup 后 news/finance cleanup 保持回归通过。

## I. Private Signal API

- [x] I1. `GET /api/admin/market/signals` 未登录返回 401 / `UNAUTHENTICATED`。
- [x] I2. 响应 `Cache-Control: private, no-store`。
- [x] I3. 使用 `MARKET_READ_RATE_LIMITER` 或等价私有 read limiter。
- [x] I4. `scope=today` 按 Asia/Shanghai 日期边界，不按 UTC 00:00 切日。
- [x] I5. `scope=recent` 有明确有限窗口，不无限返回历史。
- [x] I6. `limit` 仅允许 1–100，非法值 400。
- [x] I7. 可选 symbol filter 经严格 StockSymbol parser，不直接拼 SQL。
- [x] I8. API 只返回当前 owner signals，跨 owner 访问失败。
- [x] I9. response baseline summary 区分 enabled/ready/warming。
- [x] I10. API 不返回 note、Session、内部 SQL row、raw payload。

## J. `/market` Signal Desk

- [x] J1. 当前 `DESIGN READY` 占位被真实私有 Signal Desk 替代。
- [x] J2. 未登录 signals 只显示 locked state，0 次 `/api/admin/market/signals` 请求。
- [x] J3. locked 文案明确“信号雷达 · 私有 / 登录后查看自选盘中观察信号”。
- [x] J4. baseline 不足显示“基线积累中”及 ready/warming 数，不显示模拟 signal。
- [x] J5. 数据完整但 0 signal 时显示正常 empty state，不误报 unavailable。
- [x] J6. empty state 明确“规则暂未触发”不等于涨跌预测。
- [x] J7. Desktop 显示今日 signal 数、strong 数、baseline ready/warming。
- [x] J8. Desktop 列表显示时间、股票、方向、title、severity/score、核心 evidence。
- [x] J9. 支持 `全部 / 上行 / 下行 / 关注价` 过滤，过滤不修改 D1 历史。
- [x] J10. A 股继续红涨绿跌；neutral 不伪装成方向。
- [x] J11. watch 文案“观察”，strong 文案“重点观察”。
- [x] J12. Mobile 使用单列 signal card，不强压 Desktop 宽表。
- [x] J13. Mobile card 至少有时间、股票、severity、title、2–3 条 evidence。
- [x] J14. 320/360/390/430/768/1024/1280/1440/1728 无 document-level 横向溢出。
- [x] J15. Mobile 关键触控目标 >=44px。
- [x] J16. light/dark/dynamic 下 `/market` 与 Signal Desk 继承博客现有主题 token；无独立黑金固定色、无强制 dark color-scheme，动态模式可透出博客原有动态背景。
- [x] J17. reduced-motion / reduced-transparency 保持 P0/P1/P2A 基线。
- [x] J18. SPA `/market -> /` 后无 market/signal CSS token 残留。
- [x] J19. 最终 browser console/page/network errors 为 0。

## K. Signal Desk 轮询生命周期

- [x] K1. 已登录切入 signals 时立即 load 一次。
- [x] K2. 交易时段 + visible + signals active 时周期严格 60,000ms。
- [x] K3. 自动刷新只读本站 private signal API，0 次第三方行情 fetch。
- [x] K4. 切离 signals 停止 polling。
- [x] K5. `visibilityState !== visible` 停止 polling。
- [x] K6. 恢复 visible 且仍 active 时立即 refresh，再恢复周期。
- [x] K7. 正常盘外停止 60s 自动 polling，手动刷新仍可用。
- [x] K8. 上一轮 signal request 未结束时不叠加下一轮。
- [x] K9. 手动/自动刷新共享并发保护。
- [x] K10. 切离/unmount AbortController 中止请求，无卸载后状态写入。

## L. 财经关联与可解释性

- [x] L1. 如展示财经事件，仅复用现有可信财经数据做确定性轻量关联。
- [x] L2. 财经事件存在与否不进入 balanced-v1 score。
- [x] L3. 无可信事件就空/省略，不生成新闻。
- [x] L4. UI 不声称“某新闻导致本次涨跌”。
- [x] L5. evidence 精确区分 turnover baseline/ratio、price window、range、attention cross；不声称 volume 参与评分。
- [x] L6. `balanced-v1` 在 API/UI/持久化可追踪，支持未来 replay。

## M. Replay、性能与噪声门禁

- [x] M1. deterministic fixture 覆盖全部阈值的 below/equal/above 边界。
- [x] M2. 使用生产 D1 已有 P2A 5m 历史做只读 replay；0 次生产 INSERT/UPDATE/DELETE。
- [x] M3. replay 输出每 symbol/day signalCount 与 strongCount。
- [x] M4. replay 证明无跨日、午休、缺 5m bucket、负 delta 伪 TURNOVER_SURGE。
- [x] M5. 历史样本足够时普通交易日单股平均 signal 目标 <=6 条/日；不足则明确“样本不足”，不伪报长期指标。
- [x] M6. 同方向 20 分钟内无重复普通量价 signal。
- [x] M7. 同 attention direction 30 分钟内无重复 attention-cross。
- [x] M8. 普通单一放量不持久化用户 signal。
- [x] M9. 无真实 snapshot / 数据不足时 replay 0 条伪 signal。
- [x] M10. 最多30股约8日历史批量计算在 Worker dry-run/测试下 CPU/内存可接受。
- [x] M11. P2B 噪声观察与 P2A Provider 多日 SLA 分开记录，不互相冒充。

## N. 自动化、审查与发布

- [x] N1. Signal Engine 单测覆盖 B–F 核心边界，并保留红→绿证据。
- [x] N2. SignalService/D1 测试覆盖批量历史、owner isolation、cooldown、idempotency、retention、delete cleanup。
- [x] N3. Scheduler 测试覆盖快照后评估、provider fail zero-eval、partial success、retry idempotency。
- [x] N4. Route/Auth 测试覆盖 401、no-store、limiter、scope/limit/symbol、owner isolation。
- [x] N5. Nuxt 测试覆盖 locked/warming/empty/watch/strong、过滤、60s lifecycle、并发/abort。
- [x] N6. 当前 Agent 自审无剩余 Critical/Important；不因禁止子 agent 而跳过审查内容。
- [x] N7. `git diff --check` PASS。
- [x] N8. `pnpm verify` exit 0，P0/P1/P2A 无回归。
- [x] N9. API/Edge 必要 `wrangler deploy --dry-run` PASS，bundle/bindings 合规。
- [x] N10. Secret scan PASS；日志/测试产物无私人 watchlist/signal 明细泄露。
- [x] N11. Browser acceptance 覆盖 1440×900、390×844 与 320–1728 width sweep。
- [x] N12. Browser 覆盖 locked/warming/empty/watch/strong/up/down、三主题、reduced-motion、SPA cleanup、console/errors。
- [x] N13. 已有明确 commit/push/production deploy 授权；仅在即时技术门禁通过后发布。
- [x] N14. production D1 migration、Workers Production、Pages Production 全部成功并记录最终 SHA/run。
- [x] N15. 线上 `/api/health` 200、public Market 200 JSON、未登录 signal/watchlist 都 401。
- [x] N16. 线上 `/market` Desktop/Mobile Signal Desk 正常且未登录零私人 signal 泄漏。
- [x] N17. 若生产历史不足，warming/0 signal 是合法上线状态；禁止写 fake signal 到 production D1。
- [x] N18. 多交易日误报率/信号密度未观察完时明确“未宣称长期 SLA 通过”。

## 验收记录

### 2026-08-23 · P2B 本地即时门禁

- `balanced-v1` Engine / Service / Route / Scheduler / UI 已完成；当前 Agent 静态复审无剩余 Critical/Important。独立 Codex 最终复审未发现由本次变更引入且有明确证据支持的离散缺陷；前一轮曾发现 dark/dynamic 行情红绿语义色沿用浅色 token 的 P2 视觉回归，已按 RED→GREEN 以 `/market` 局部 token 覆盖修复，未改全站色板。
- fixture replay：4 个交易日 / 4 stock-day，1 条 watch、0 strong，平均 0.25 条/stock-day，跨日/午休/缺桶/负 delta 伪 flow 均为 0，`noiseGate=pass`。
- 生产 D1 只读 replay：当前 `market_watchlist_quote_5m` 为 0 rows，输出 0 signal，`noiseGate=insufficient-sample`；原始私人导出已删除，未执行生产 INSERT/UPDATE/DELETE。长期信号密度 SLA **未宣称通过**。
- 最新主题修复后重新执行 `pnpm verify` exit 0：Root 33 files / 273 tests；Edge 1 file / 36 tests；API 30 files / 304 tests；Nuxt generate 51 routes 成功；link checker 0 errors / 0 warnings；secret scan 797 tracked/generated files 无命中。
- 最新 Worker dry-run：API 1942.32 KiB / gzip 376.51 KiB；Edge 15.55 KiB / gzip 4.57 KiB；现有 `*/5` 仍仅 `news-sync / finance-sync / market-sync / market-watchlist-sync`，无 signal 独立 Cron/Provider。
- 浏览器 fixture acceptance：320/360/390/430/768/1024/1280/1440/1728 均 `scrollWidth == clientWidth`；locked 私有 signal 请求 0；warming/empty/watch/strong/up/down/attention filter 均通过；390 mobile 无 overflow，登录按钮 44px；60s 轮询计数 `1→2`，切 workspace 保持 2，重入 3，hidden 保持 3，visible 恢复 4。
- 主题方向按最新用户要求更新：去除独立黑金皮肤，`/market` / Signal Desk 继承博客 light/dark/dynamic token；dark/dynamic 的红涨绿跌采用市场页局部高对比语义 token；动态背景恢复可见；无固定黑金色/强制 dark；SPA `/market → /` 无 `--market-*` 泄漏；reduced-motion 有效。最新生成产物以真实 Chrome 复验 1440×900 light/dark/dynamic 与 390×844 mobile signal locked 状态，均无 console/page/network error，390 页面宽度保持 390px；未登录 fixture 日志中 `/api/admin/market/signals` 请求数为 0。
- M10 上界压力基准：30 股 × 6 交易日 × 48 桶 = 8,640 snapshots；按 replay 重路径执行 8,640 次真实 `evaluateMarketSignal`，约 1.02s，JS heap 增量 762,832 bytes（约 0.73 MiB），RSS 增量 22,102,016 bytes（约 21.1 MiB）。生产每轮仅最多 30 次评估，因此 CPU/内存余量可接受；该基准不冒充生产长期 SLA。
- p10 已完成：N13–N17 的发布授权、production migration、Workers / Pages、线上 API / UI smoke 与“历史不足时 warming/0 signal 且禁止 fake signal”的生产边界均已有证据；当前私人生产 row count 未越权读取。

### 2026-08-23 · P2B 生产发布验收

- 生产功能候选 SHA：`8554c16b23a2a351448bbe63177ee2b5c34e1fa7`。该 SHA 已快进推送到 `origin/main`，无远端分叉。
- Workers Production `#71` / run `32628787622` 对同一 SHA 全部成功：typecheck、worker tests、D1 migration、queue 检查、API Worker deploy、Edge Worker deploy 与 same-origin health 均为 success。CI 日志明确显示本轮唯一待迁移项为 `0016_market_watchlist_signals.sql`，执行 5 条 DDL 后状态为成功。
- Pages Production `#202` / run `32628787645` 对同一 SHA 全部成功：source quality、Pages build、artifact 校验、Cloudflare Pages deploy 与 controlled production entries 均为 success。
- 正式域 API smoke：`/api/health` = 200 JSON、`/api/market/overview` = 200 JSON、未登录 `/api/admin/market/signals` = 401 JSON、未登录 `/api/admin/market/watchlist` = 401 JSON；`/market` 页面 = 200。
- 正式域真实 Chrome：1440×900 进入 Signal Desk 后稳定展示 `SIGNAL DESK · PRIVATE`、`balanced-v1` 与未登录锁定态；light / dark / dynamic 三主题切换均无 console/page/network error。390×844 Mobile 页面实际宽度保持 390px，进入 Signal Desk 后同样只展示锁定态，无 console/page/network error、无私人 signal 明细。
- `0016_market_watchlist_signals.sql` 只创建 `market_watchlist_signal` 表、唯一约束、外键与索引，不包含 `INSERT`、seed 或任何模拟 signal。部署后曾尝试用本机 Wrangler 做生产 D1 **只读聚合计数**，Cloudflare API 因当前本机账号授权不足返回 7403，查询未执行且没有任何写操作。因此不猜测当前生产私人 row count，也不宣称当前认证用户一定处于 warming；只确认历史不足时 warming/0 signal 是合法状态，发布链路没有写入 fake signal。
- P2B 多交易日误报率/信号密度长期 SLA 仍**未宣称通过**；待真实交易日样本自然积累后再做独立观察，不以本次上线成功替代长期统计结论。

### 2026-08-23 · P2B 加固修复后二次生产验收

- 二次加固功能 SHA：`b909144267078218668b9c5aff119ed156496c6d`（`fix: harden market radar lifecycle and freshness`）。从 `4c5ec56` 对 `origin/main` 单提交 fast-forward 推送，推送前重新 fetch，`ahead=1 / behind=0`，未覆盖远端新提交。
- 本轮在发布前以 RED→GREEN 补齐并修复：真实 `marketAt` 语义与日期展示、signal 完整统计不受 `limit` 截断、`balanced-v1` 列表/冷却版本隔离、AbortController ownership、workspace/unmount 后私有请求与 polling 复活、午休/次交易窗口 wake-up、超过 7 天长假 wake-up、2026 上交所/深交所/北交所同源休市门禁、同日陈旧/前日/无效/未来行情降级、后台旧行情禁止落 5m snapshot/触发 signal、春节后按 5 个真实交易日恢复 historical-slot baseline，以及历史查询 `market_at <= now` 防未来快照污染。
- 为避免门禁依赖原工作树未跟踪文件，单独从 `b909144` 创建 clean detached worktree，执行 `pnpm install --frozen-lockfile --offline` 后再跑完整 `pnpm verify`，最终 exit 0：Root 34 files / 287 tests；Edge 1 file / 36 tests；API 27 files / 299 tests；Nuxt generate 51 routes；link checker 0 errors / 0 warnings；secret scan 809 tracked/generated files 0 命中。原工作树 3 个无关 finance 未跟踪测试未进入本次 commit，也未参与 clean-commit API 299 tests 结论。
- clean commit Worker dry-run 再次 exit 0：API `1973.58 KiB / gzip 383.37 KiB`，Edge `15.55 KiB / gzip 4.57 KiB`；bindings 与既有 Cron/Queue 架构不变，没有新增 signal Provider 或独立 Cron。
- 最新生成产物通过匿名真实 Chrome 代理验收：1440×900 与 390×844 都能切换自选/信号，Signal Desk 仅显示 locked state，light/dark/dynamic 切换无 console/page/network error；390 页面实际宽度保持 390px。代理仅记录 `METHOD + path/query`，未记录 Cookie/Header/Body；切过“自选 → 信号”后只出现 `/api/auth/session`，未出现 `/api/admin/market/watchlist*` 或 `/api/admin/market/signals`。
- Workers Production `#72` / run `32633589038` 对 `b909144` 全部成功：install、typecheck、worker tests、D1 migration、queue 检查、API Worker deploy、Edge Worker deploy、same-origin health 均 success。CI API 为 27 files / 299 tests、Edge 36 tests；D1 明确返回 `No migrations to apply`，即 `0016_market_watchlist_signals.sql` 已由上一轮生产发布完成，不重复执行 DDL。API Worker 本轮版本 `1e768707-625f-4a1a-be58-e23bfc167263`，Edge Worker 版本 `7d48f23c-b800-40ef-836c-42e9746c5b1f`。
- Pages Production `#203` / run `32633588997` 对同一 `b909144` 全部成功：`source_quality`、`build_pages`、production artifact、Cloudflare Pages deploy、controlled production entries 均 success。
- 二次独立正式域 API smoke 全部符合合同：`/api/health` = 200 JSON；`/api/market/overview` = 200 JSON 且当前 `quality=live`；未登录 `/api/admin/market/signals` = 401 / `UNAUTHENTICATED` / `private, no-store`；未登录 `/api/admin/market/watchlist` = 401 / `UNAUTHENTICATED` / `private, no-store`。
- 二次独立正式域真实 Chrome：1440×900 下真实“资金”工作区能读取行业资金表，Signal Desk 只显示 `SIGNAL DESK · PRIVATE / balanced-v1` locked state，随后 SPA `/market → /` 正常清理；390×844 下 `page_size.width=390`、Signal locked 正常。两种尺寸全程 `console_errors=[] / page_errors=[] / network_errors=[]`，未观察到私人 signal/watchlist 明细泄漏。
- 长期信号密度 SLA：**样本不足，未宣称通过**。本轮上线和修复只证明即时功能、数据纪律、生命周期、生产发布链路与回归门禁通过，不以部署成功冒充多交易日误报率/密度结论；继续等待真实交易日样本自然积累。
