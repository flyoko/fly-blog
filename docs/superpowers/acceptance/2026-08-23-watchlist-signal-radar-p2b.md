# 自选股盘中信号雷达 P2B 验收标准

- 设计来源：`docs/superpowers/specs/2026-08-23-watchlist-signal-radar-p2b-design.md`
- 引擎：`balanced-v1`
- 用户选择：B · 均衡型
- 原则：PASS 必须有测试、replay、构建、浏览器或生产证据；不得用模拟行情替代真实数据。

## A. 范围、隐私与资源

- [ ] A1. 仅处理 enabled 的私有自选，沿用 P2A 全局最多 30 只硬门禁。
- [ ] A2. 不实现全 A 扫描、板块全量分钟扫描或 30 只上限绕过。
- [ ] A3. 不新增行情 Provider；只读 `market_watchlist_quote_5m` 派生信号。
- [ ] A4. 不新增 Cloudflare Cron；复用现有 `*/5` → Queue → `market-watchlist-sync`。
- [ ] A5. signal evaluation 产生 0 次额外第三方行情 fetch。
- [ ] A6. 不存持仓、仓位、成本价、盈亏等账户级投资数据。
- [ ] A7. 不产生自动下单或买入/卖出/加减仓结论。
- [ ] A8. 首版不新增 Browser Push、微信、Telegram、邮件通知。
- [ ] A9. public `/api/market/*` 不新增 signal/watchlist/attentionPrice/note 等私人字段。
- [ ] A10. 日志不输出完整私人 symbol/note/attentionPrice 列表、Cookie、Session、raw payload。

## B. 严格 5 分钟时间序列

- [ ] B1. `turnover/volume` 被视为日内累计量，5m 因子使用 `current - previous`。
- [ ] B2. 5m delta 只在同一 Asia/Shanghai 交易日有效。
- [ ] B3. 5m delta 不跨 11:30–13:00 午休。
- [ ] B4. `bucketAt` 必须严格相邻且差值正好 5 分钟。
- [ ] B5. 缺一个桶时，10 分钟累计差不得冒充 5m turnover/volume。
- [ ] B6. `marketAt` 重复或倒退时该区间 unavailable。
- [ ] B7. cumulative 字段为 null 时对应 delta unavailable，不补 0。
- [ ] B8. cumulative delta < 0 时 fail-closed，不取绝对值/不归零。
- [ ] B9. 10m price window 必须由三个连续 5m bucket 构成。
- [ ] B10. 跨日、午休、缺桶、异常 delta 不借更老快照补当前窗口。
- [ ] B11. 09:20–09:29 不产生普通量价信号。
- [ ] B12. 15:00 后不产生新的普通盘中量价信号。
- [ ] B13. 首个正常桶 attention gap-cross 可用可信 `previousClose`，但不伪装成 5m 变化。

## C. 基线

- [ ] C1. 优先使用过去最多 5 个交易日相同 5m 时间槽的有效 delta。
- [ ] C2. historical-slot baseline 使用 median，不使用 mean/sum。
- [ ] C3. historical-slot 至少 3 个有效交易日样本才 ready。
- [ ] C4. 历史槽不足时回退同一 session 之前最多 6 个有效 5m delta median。
- [ ] C5. intraday rolling baseline 至少 4 个有效样本。
- [ ] C6. intraday baseline 不跨午休、不包含 current bucket。
- [ ] C7. 两类 baseline 均不足时状态为 warming/unavailable，不伪造基线。
- [ ] C8. 缺失样本不以 0 进入 median。
- [ ] C9. 优先级固定 historical-slot → intraday rolling → unavailable。
- [ ] C10. 同一 fixture 重放结果确定性一致，不依赖 Math.random/隐式系统时间。

## D. balanced-v1 原子因子

- [ ] D1. TURNOVER_SURGE 普通：ratio >= 2.0 且 `deltaTurnover >= 3,000,000` CNY。
- [ ] D2. TURNOVER_SURGE 强：ratio >= 3.0，仍要求绝对成交额底线。
- [ ] D3. turnover 不可用但 volume 基线合法时才允许 fallback，并标 `basis=volume`。
- [ ] D4. PRICE_ACCELERATION 普通：abs(5m)>=1.0% 或合法 abs(10m)>=1.5%。
- [ ] D5. PRICE_ACCELERATION 极端：abs(5m)>=1.8%。
- [ ] D6. RANGE_BREAK 使用 current 之前 6 个连续 5m snapshot `price` 的 max/min，不含 current，且绝不使用 P2A 当日累计 `high/low`。
- [ ] D7. 上破阈值 `current >= previousRangeHigh * 1.002`。
- [ ] D8. 下破阈值 `current <= previousRangeLow * 0.998`。
- [ ] D9. 普通 RANGE_BREAK 单独不能形成用户 signal。
- [ ] D10. ATTENTION_CROSS up：previous < attention <= current。
- [ ] D11. ATTENTION_CROSS down：previous > attention >= current。
- [ ] D12. `attentionPrice=null` 时无 attention-cross 因子。
- [ ] D13. 5m >= +0.30% 定义 up；<= -0.30% 定义 down；中间 neutral。
- [ ] D14. DIRECTION_ALIGNMENT 只在实际同向时加分，neutral 不加。

## E. 组合评分与用户信号

- [ ] E1. `balanced-v1` 阈值/分数集中定义并版本化，不散落在 Vue/route/SQL。
- [ ] E2. TURNOVER_SURGE 分数：普通 30 / 强 40。
- [ ] E3. PRICE_ACCELERATION：普通 25 / 极端 50。
- [ ] E4. RANGE_BREAK：普通 25 / 强组合证据 35。
- [ ] E5. ATTENTION_CROSS 固定 55，可独立达到 watch。
- [ ] E6. DIRECTION_ALIGNMENT +10；最终 score cap 100。
- [ ] E7. score <50 不持久化用户 signal。
- [ ] E8. 50–69 → `watch`；>=70 → `strong`。
- [ ] E9. 普通单一 TURNOVER_SURGE 不会独立刷出 signal。
- [ ] E10. 极端 5m price 可独立 watch，但 evidence 不写成“价量共振”。
- [ ] E11. 价量组合 fixture 得到预期 watch；强放量+突破 fixture 得到 strong。
- [ ] E12. 用户 signalType 仅 momentum/breakout/breakdown/attention-cross/price-spike 观察语义。
- [ ] E13. 用户可见文案不出现 buy/sell/买点/卖点/建议交易。
- [ ] E14. 每条 signal 有 marketAt、direction、severity、score、engineVersion、结构化 evidence。

## F. 冷却、去重、幂等

- [ ] F1. 唯一性至少包含 owner+symbol+bucketAt+signalType+engineVersion。
- [ ] F2. Queue retry 不产生重复 signal row。
- [ ] F3. 同 bucket quote upsert 后再次评估不重复 signal。
- [ ] F4. 普通同 symbol+direction 量价信号 cooldown 20 分钟。
- [ ] F5. 同 symbol+direction attention-cross cooldown 30 分钟。
- [ ] F6. up/down cooldown 独立，真正反转不被旧方向抑制。
- [ ] F7. cooldown 内 strong 仅在比最近同向 watch 至少高 15 分时穿透。
- [ ] F8. strong 穿透新增历史记录，不修改旧 watch。
- [ ] F9. cooldown 只抑制 signal 持久化，不修改底层 quote_5m。
- [ ] F10. deterministic replay 得到相同 candidate/idempotency key。

## G. D1 与生命周期

- [ ] G1. `0016_market_watchlist_signals.sql` 创建 signal 表及 owner/time、owner/symbol/time 索引。
- [ ] G2. signal evidence 仅保存有限白名单数值/因子，不复制第三方 raw payload。
- [ ] G3. 每条 row 固化 `engine_version=balanced-v1`。
- [ ] G4. SignalService 对最多 30 股历史采用批量读取，禁止一股一 SQL 查询放大。
- [ ] G5. 历史查询仅取约 8 日范围及必要列；P2B 局部 range 不读取/使用 P2A 当日累计 `high/low`。
- [ ] G6. disabled 股票不参与 signal evaluation。
- [ ] G7. 删除 watchlist 股票时删除同 owner+symbol 的 P2B signal。
- [ ] G8. 删除自选不改变 P2A quote_5m 既有 retention 策略。
- [ ] G9. signal retention 为 30 自然日。
- [ ] G10. cleanup 复用现有 `31 19 * * *` content-maintenance，不新增 Cron。
- [ ] G11. cleanup 不影响 watchlist、quote_5m、news/finance 等其他数据。

## H. Scheduler / Queue 集成

- [ ] H1. 不新增并行 `market-signal-sync` Queue message。
- [ ] H2. 正常顺序严格为 fetch quotes → write quote_5m → evaluate affected → persist signals。
- [ ] H3. Provider 全失败时 signal evaluation 调用次数为 0。
- [ ] H4. partial quote 只评估成功写入 snapshot 的 symbols。
- [ ] H5. snapshot D1 写失败时不继续基于未持久化行情生成 signal。
- [ ] H6. SignalService 基础设施错误可触发 Queue retry，不吞错写空/假 signal。
- [ ] H7. retry + UNIQUE/idempotency 保证不重复。
- [ ] H8. 盘外 P2A zero-fetch 语义保持不回归。
- [ ] H9. `scheduledJobsFor('*/5 * * * *')` 不新增 signal job，Cron/Queue 数量不膨胀。
- [ ] H10. content-maintenance 加入 signal cleanup 后 news/finance cleanup 保持回归通过。

## I. Private Signal API

- [ ] I1. `GET /api/admin/market/signals` 未登录返回 401 / `UNAUTHENTICATED`。
- [ ] I2. 响应 `Cache-Control: private, no-store`。
- [ ] I3. 使用 `MARKET_READ_RATE_LIMITER` 或等价私有 read limiter。
- [ ] I4. `scope=today` 按 Asia/Shanghai 日期边界，不按 UTC 00:00 切日。
- [ ] I5. `scope=recent` 有明确有限窗口，不无限返回历史。
- [ ] I6. `limit` 仅允许 1–100，非法值 400。
- [ ] I7. 可选 symbol filter 经严格 StockSymbol parser，不直接拼 SQL。
- [ ] I8. API 只返回当前 owner signals，跨 owner 访问失败。
- [ ] I9. response baseline summary 区分 enabled/ready/warming。
- [ ] I10. API 不返回 note、Session、内部 SQL row、raw payload。

## J. `/market` Signal Desk

- [ ] J1. 当前 `DESIGN READY` 占位被真实私有 Signal Desk 替代。
- [ ] J2. 未登录 signals 只显示 locked state，0 次 `/api/admin/market/signals` 请求。
- [ ] J3. locked 文案明确“信号雷达 · 私有 / 登录后查看自选盘中观察信号”。
- [ ] J4. baseline 不足显示“基线积累中”及 ready/warming 数，不显示模拟 signal。
- [ ] J5. 数据完整但 0 signal 时显示正常 empty state，不误报 unavailable。
- [ ] J6. empty state 明确“规则暂未触发”不等于涨跌预测。
- [ ] J7. Desktop 显示今日 signal 数、strong 数、baseline ready/warming。
- [ ] J8. Desktop 列表显示时间、股票、方向、title、severity/score、核心 evidence。
- [ ] J9. 支持 `全部 / 上行 / 下行 / 关注价` 过滤，过滤不修改 D1 历史。
- [ ] J10. A 股继续红涨绿跌；neutral 不伪装成方向。
- [ ] J11. watch 文案“观察”，strong 文案“重点观察”。
- [ ] J12. Mobile 使用单列 signal card，不强压 Desktop 宽表。
- [ ] J13. Mobile card 至少有时间、股票、severity、title、2–3 条 evidence。
- [ ] J14. 320/360/390/430/768/1024/1280/1440/1728 无 document-level 横向溢出。
- [ ] J15. Mobile 关键触控目标 >=44px。
- [ ] J16. light/dark/dynamic 下 Signal Desk 黑金主题不回退。
- [ ] J17. reduced-motion / reduced-transparency 保持 P0/P1/P2A 基线。
- [ ] J18. SPA `/market -> /` 后无 market/signal CSS token 残留。
- [ ] J19. 最终 browser console/page/network errors 为 0。

## K. Signal Desk 轮询生命周期

- [ ] K1. 已登录切入 signals 时立即 load 一次。
- [ ] K2. 交易时段 + visible + signals active 时周期严格 60,000ms。
- [ ] K3. 自动刷新只读本站 private signal API，0 次第三方行情 fetch。
- [ ] K4. 切离 signals 停止 polling。
- [ ] K5. `visibilityState !== visible` 停止 polling。
- [ ] K6. 恢复 visible 且仍 active 时立即 refresh，再恢复周期。
- [ ] K7. 正常盘外停止 60s 自动 polling，手动刷新仍可用。
- [ ] K8. 上一轮 signal request 未结束时不叠加下一轮。
- [ ] K9. 手动/自动刷新共享并发保护。
- [ ] K10. 切离/unmount AbortController 中止请求，无卸载后状态写入。

## L. 财经关联与可解释性

- [ ] L1. 如展示财经事件，仅复用现有可信财经数据做确定性轻量关联。
- [ ] L2. 财经事件存在与否不进入 balanced-v1 score。
- [ ] L3. 无可信事件就空/省略，不生成新闻。
- [ ] L4. UI 不声称“某新闻导致本次涨跌”。
- [ ] L5. evidence 精确区分 turnover/volume basis、price window、range、attention cross。
- [ ] L6. `balanced-v1` 在 API/UI/持久化可追踪，支持未来 replay。

## M. Replay、性能与噪声门禁

- [ ] M1. deterministic fixture 覆盖全部阈值的 below/equal/above 边界。
- [ ] M2. 使用生产 D1 已有 P2A 5m 历史做只读 replay；0 次生产 INSERT/UPDATE/DELETE。
- [ ] M3. replay 输出每 symbol/day signalCount 与 strongCount。
- [ ] M4. replay 证明无跨日、午休、缺 5m bucket、负 delta 伪 TURNOVER_SURGE。
- [ ] M5. 历史样本足够时普通交易日单股平均 signal 目标 <=6 条/日；不足则明确“样本不足”，不伪报长期指标。
- [ ] M6. 同方向 20 分钟内无重复普通量价 signal。
- [ ] M7. 同 attention direction 30 分钟内无重复 attention-cross。
- [ ] M8. 普通单一放量不持久化用户 signal。
- [ ] M9. 无真实 snapshot / 数据不足时 replay 0 条伪 signal。
- [ ] M10. 最多30股约8日历史批量计算在 Worker dry-run/测试下 CPU/内存可接受。
- [ ] M11. P2B 噪声观察与 P2A Provider 多日 SLA 分开记录，不互相冒充。

## N. 自动化、审查与发布

- [ ] N1. Signal Engine 单测覆盖 B–F 核心边界，并保留红→绿证据。
- [ ] N2. SignalService/D1 测试覆盖批量历史、owner isolation、cooldown、idempotency、retention、delete cleanup。
- [ ] N3. Scheduler 测试覆盖快照后评估、provider fail zero-eval、partial success、retry idempotency。
- [ ] N4. Route/Auth 测试覆盖 401、no-store、limiter、scope/limit/symbol、owner isolation。
- [ ] N5. Nuxt 测试覆盖 locked/warming/empty/watch/strong、过滤、60s lifecycle、并发/abort。
- [ ] N6. 当前 Agent 自审无剩余 Critical/Important；不因禁止子 agent 而跳过审查内容。
- [ ] N7. `git diff --check` PASS。
- [ ] N8. `pnpm verify` exit 0，P0/P1/P2A 无回归。
- [ ] N9. API/Edge 必要 `wrangler deploy --dry-run` PASS，bundle/bindings 合规。
- [ ] N10. Secret scan PASS；日志/测试产物无私人 watchlist/signal 明细泄露。
- [ ] N11. Browser acceptance 覆盖 1440×900、390×844 与 320–1728 width sweep。
- [ ] N12. Browser 覆盖 locked/warming/empty/watch/strong/up/down、三主题、reduced-motion、SPA cleanup、console/errors。
- [ ] N13. 已有明确 commit/push/production deploy 授权；仅在即时技术门禁通过后发布。
- [ ] N14. production D1 migration、Workers Production、Pages Production 全部成功并记录最终 SHA/run。
- [ ] N15. 线上 `/api/health` 200、public Market 200 JSON、未登录 signal/watchlist 都 401。
- [ ] N16. 线上 `/market` Desktop/Mobile Signal Desk 正常且未登录零私人 signal 泄漏。
- [ ] N17. 若生产历史不足，warming/0 signal 是合法上线状态；禁止写 fake signal 到 production D1。
- [ ] N18. 多交易日误报率/信号密度未观察完时明确“未宣称长期 SLA 通过”。

## 验收记录

实施完成后追加真实 fixture/replay/CI/Cloudflare/browser/production 证据；当前不预填 PASS。
