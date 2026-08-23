# 自选股盘中信号雷达 P2B 设计

- 日期：2026-08-23
- 状态：自主模式设计定稿
- 基线：P0 财经多源 + P1 Market Provider + P2A 私有自选雷达已生产上线
- 信号风格：**B · 均衡型**
- 范围：最多 30 只私有自选股、5 分钟真实快照、确定性盘中观察信号、冷却去重、`/market` 信号工作区
- 非目标：全市场扫描、Level2/逐笔、分钟 K 新数据源、自动交易、买卖建议、仓位/成本管理、浏览器 Push、微信/Telegram 通知、AI 猜测信号

## 1. 背景与目标

P2A 已经生产保存 `market_watchlist_quote_5m`，每个有效 5 分钟桶包含真实 `price / changePct / high / low / previousClose / volume / turnover / turnoverRate / marketAt / fetchedAt`，并严格限制为最多 30 只私有自选股。

P2B 的目标不是做一个新的行情系统，而是把这些已经存在的真实 5 分钟快照转成**少量、可解释、可复现的观察信号**：

> 当自选股出现“价量同时异常、局部突破/回撤、关注价穿越”等值得人工看一眼的情况时，在 `/market` 的私有“信号”工作区给出证据和时间，而不是连续刷屏，更不替用户做交易决定。

成功标准：

1. 只扫描已启用的 0–30 只私有自选，不扩张到全 A 股。
2. 不新增上游行情请求；信号完全由 P2A 已保存的真实快照派生。
3. 普通单指标波动尽量不告警，组合异常才触发，符合用户选择的“均衡型”。
4. 每条信号都能解释“为什么触发”，并能从历史快照复算。
5. 数据缺失、时间断档、累计量重置或历史不足时宁可不发信号，也不补造数据。
6. 不产生“买入 / 卖出 / 加仓 / 减仓”等自动投资建议。

## 2. 方案比较与选择

### 2.1 方案 A：固定单阈值

例如“5 分钟涨 1% 就提醒”“成交额放大 2 倍就提醒”。

优点：实现最简单、测试直接。

缺点：A 股盘中噪声大，单阈值容易在高波动股票上连续刷屏；开盘、尾盘天然成交活跃也会造成误报。

### 2.2 方案 B：纯统计异常

用 z-score、标准差、分位数等对每只股票建立异常模型。

优点：能自适应股票波动特征。

缺点：P2A 刚上线时历史样本有限；异常统计容易被极端值和日内 U 型成交结构影响；可解释性弱于确定性规则。

### 2.3 方案 C：确定性事件 + 滚动基线 + 组合评分（采用）

先从真实快照计算若干**原子事实**，再组合评分：

- 5 分钟成交额/成交量增量异常；
- 5/10 分钟价格加速；
- 最近 30 分钟区间突破/跌破；
- 用户关注价上穿/下穿；
- 价量方向是否一致；
- 极端单指标是否达到独立触发级别。

普通单一放量或普通单一涨跌不直接形成提示，只有组合分达到门槛才持久化为信号；关注价穿越由于是用户显式配置，可独立形成观察信号。

这是 P2B 的采用方案。

## 3. 总体架构

```text
现有 */5 Cron
   ↓
CONTENT_SYNC_QUEUE
   ↓
market-watchlist-sync
   ↓
WatchlistService.syncScheduled()
   ├── 0–30 股一次批量真实报价
   ├── 写 market_watchlist_quote_5m
   └── MarketSignalService.evaluateAffected()
             ↓
        一次批量读取近期 5m 历史
             ↓
        MarketSignalEngine（纯计算）
             ↓
        去重 / cooldown / idempotency
             ↓
        market_watchlist_signal

/market → 信号工作区
   ↓ 登录态
GET /api/admin/market/signals
   ↓
D1 信号 + 基线状态
```

关键边界：

- 不增加新的 Cloudflare Cron trigger。
- 不增加 `market-signal-sync` 独立上游任务，避免和快照写入发生竞态。
- 信号评估发生在本轮成功快照写入之后。
- `MarketSignalEngine` 是纯函数，不直接访问 D1/Provider。
- `MarketSignalService` 负责 D1 查询、引擎调用、冷却、持久化和 API 查询。
- `WatchlistService` 只在保存新快照后调用 SignalService，不内嵌具体阈值算法。

## 4. 为什么必须使用 5 分钟增量

P2A 的 `volume` 和 `turnover` 来自行情 Provider 的**当日累计值**。

因此禁止：

```text
current.turnover / previous.turnover
```

来代表 5 分钟放量。

正确做法：

```text
deltaTurnover = current.turnover - previous.turnover
deltaVolume   = current.volume   - previous.volume
```

只有满足以下条件才认为区间增量有效：

1. current/previous 属于同一个上海交易日；
2. 属于同一个连续交易 session，不跨 11:30–13:00 午休；
3. `bucketAt` 必须是严格相邻的 5 分钟桶（差值正好 5 分钟）；
4. `marketAt` 严格递增；
5. 累计字段非 null；
6. delta >= 0；
7. 当前 bucket 未被重复 marketAt 覆盖为旧行情。

如果中间缺了一个 5 分钟桶，即使两个端点相差 10 分钟，也**不能**把累计差值冒充成 5 分钟成交额。该 5 分钟量能因子直接记为 unavailable，不用 0 替代，不跨缺口借数据。10 分钟价格窗口同样要求三个连续 5 分钟桶，保证窗口语义稳定。

## 5. 交易时间语义

P2A 抓取窗口为了容错覆盖约 09:20–11:35 / 12:55–15:15，但 P2B 只在正常连续竞价时段计算普通盘中信号：

- 09:30–11:30 Asia/Shanghai
- 13:00–15:00 Asia/Shanghai

规则：

- 09:20–09:29 数据可作为开盘上下文，但不产生普通量价信号。
- 午休前最后一个桶不能与午后第一个桶计算 5 分钟增量。
- 15:00 后不再生成新的普通盘中信号。
- 首个盘中桶若要判断关注价跳空穿越，可用可信 `previousClose` 与当前价比较；不能用前一交易日 14:55 快照伪装成“5 分钟变化”。

## 6. 基线设计

### 6.1 优先基线：同时间槽历史基线

成交量具有明显日内 U 型结构。暖机后，优先使用**过去最多 5 个交易日的相同 5 分钟时间槽**：

```text
例如今天 10:15–10:20
→ 查过去 5 个交易日的 10:15–10:20 deltaTurnover
→ 使用中位数 median 作为 baseline
```

最少需要 3 个有效历史样本才启用此基线。

优点：开盘和尾盘不会因为天然活跃而被简单滚动均值误判。

### 6.2 冷启动回退：当日滚动基线

历史不足时，可以使用同一 session 内此前最多 6 个有效 5 分钟增量的中位数。

- 至少 4 个有效样本；
- 不跨午休；
- 缺桶不补 0；
- 当前桶不进入自己的 baseline。

这意味着普通信号在开盘后需要一段真实数据积累；系统显示“基线积累中”，而不是用模拟历史立即产生信号。

### 6.3 基线优先级

```text
同时间槽 >=3 个历史交易日
    → historical-slot baseline
否则同 session >=4 个此前有效桶
    → intraday rolling baseline
否则
    → baseline unavailable
```

## 7. 原子因子

所有阈值都属于 `balanced-v1` 引擎常量，集中定义并版本化，不散落在 route/UI。

### 7.1 成交额异常 `TURNOVER_SURGE`

主量能指标优先使用 `deltaTurnover`，因为它更直接反映实际成交金额。

普通异常：

- baseline 可用；
- `deltaTurnover / baseline >= 2.0`；
- 且 `deltaTurnover >= 3,000,000 CNY`。

强异常：

- ratio `>= 3.0`；
- 同样要求绝对成交额底线。

若 turnover 缺失但 volume 有完整基线，可以退化为 `deltaVolume` ratio；证据里必须标记 `basis=volume`，不混淆两个口径。

### 7.2 价格加速 `PRICE_ACCELERATION`

普通：

- 5 分钟绝对涨跌 `>= 1.0%`；或
- 10 分钟绝对涨跌 `>= 1.5%`。

极端：

- 5 分钟绝对涨跌 `>= 1.8%`。

所有计算使用真实 snapshot price；缺少连续桶则该窗口 unavailable。

### 7.3 局部区间突破 `RANGE_BREAK`

观察当前价格是否首次突破/跌破**此前 6 个完整 5 分钟桶（约 30 分钟）**的局部价格区间。

- 上破：`currentPrice >= previousRangeHigh * 1.002`
- 下破：`currentPrice <= previousRangeLow * 0.998`

previousRange 不包含当前桶，避免自己证明自己突破。

普通 range break 不能单独形成用户信号；必须与量能异常或价格加速组合。P2B `balanced-v1` 不定义“单独突破即提醒”的额外隐藏阈值。

### 7.4 关注价穿越 `ATTENTION_CROSS`

用户设置 `attentionPrice` 后：

- 上穿：previousPrice < attentionPrice 且 currentPrice >= attentionPrice
- 下穿：previousPrice > attentionPrice 且 currentPrice <= attentionPrice

首个交易桶允许用 `previousClose` 作为 previousPrice 判断跳空穿越。

关注价是用户主动设置的观察阈值，不代表成本价、止损价或交易指令。

### 7.5 方向一致性 `DIRECTION_ALIGNMENT`

量能异常本身没有交易方向。只有当前价格变化足够明确时才赋方向：

- `priceMove5m >= +0.30%` → up
- `priceMove5m <= -0.30%` → down
- 中间区间 → neutral

当 `TURNOVER_SURGE` 与价格加速/突破方向一致时增加组合可信度。

## 8. 均衡型组合评分 balanced-v1

P2B 不把每个原子因子都变成一条提醒，而是每个 symbol/bucket 生成一个组合候选。

| 因子 | 普通分 | 强/极端分 |
| --- | ---: | ---: |
| TURNOVER_SURGE | 30 | 40 |
| PRICE_ACCELERATION | 25 | 50 |
| RANGE_BREAK | 25 | 35 |
| ATTENTION_CROSS | 55 | 55 |
| 价量方向一致 | +10 | +10 |

最终 score 上限 100。

触发规则：

- `<50`：不持久化为用户信号；只属于内部计算事实。
- `50–69`：`watch`，UI 文案“观察”。
- `>=70`：`strong`，UI 文案“重点观察”。
- `ATTENTION_CROSS` 可独立达到 watch。
- 极端 5 分钟价格变化可单独达到 watch，但证据必须明确“单一极端价格因子”，不得包装成价量共振。

示例：

```text
成交额 2.4x（30）
+ 5m 上涨 1.2%（25）
+ 方向一致（10）
= 65 → 观察
```

```text
成交额 3.1x（40）
+ 30m 区间上破（35）
+ 方向一致（10）
= 85 → 重点观察
```

## 9. 用户可见信号类型

原子因子可组合成以下用户文案，不使用买卖动作词：

- `momentum_up`：放量上冲
- `momentum_down`：放量回撤
- `breakout_up`：区间上破观察
- `breakdown_down`：区间下破观察
- `attention_cross_up`：上穿关注价
- `attention_cross_down`：下穿关注价
- `price_spike_up` / `price_spike_down`：快速价格异动

每条信号包含：

- 股票名称/代码；
- direction；
- severity；
- score；
- marketAt；
- 简短标题；
- 2–4 条结构化证据；
- 引擎版本；
- 数据来源摘要。

禁止生成“建议买入”“适合做 T 买点”“卖出”等结论。

## 10. 冷却、去重与重触发

### 10.1 Idempotency

同一：

```text
owner + symbol + bucketAt + signalType + engineVersion
```

只能持久化一次。

Queue retry、Worker 重试和同 bucket upsert 不得产生重复信号。

### 10.2 Cooldown

均衡型默认：

- 同一 symbol + 同一 direction 的普通量价信号：20 分钟 cooldown；
- 同一 symbol + 同一方向 attention cross：30 分钟 cooldown；
- strong 信号可以在 cooldown 内**穿透抑制并新增一条 strong**，但必须比最近同方向 watch 至少提高 15 分；旧 watch 记录不修改，保证历史可复现；
- up/down 方向独立冷却，避免真正反转被旧方向信号压掉。

Cooldown 只抑制用户信号持久化，不修改底层真实快照。

## 11. 数据完整性与 fail-closed

以下情况不产生依赖该窗口的信号：

- 当前 quote/snapshot 缺失；
- 重复或倒退的 `marketAt`；
- 跨交易日差分；
- 跨午休差分；
- 量能计算所需的 5 分钟桶不连续（bucketAt 差值不是 5 分钟）；
- cumulative volume/turnover 负增量；
- baseline 样本不足；
- range window 中有效桶不足；
- attentionPrice 非法或 null；
- 当前股票 disabled。

缺数据不会转成 0，不会借更老的一天填补一个缺失 5 分钟桶。

## 12. D1 设计

新增 migration `0016_market_watchlist_signals.sql`。

```sql
CREATE TABLE market_watchlist_signal (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  bucket_at TEXT NOT NULL,
  market_at TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  severity TEXT NOT NULL,
  score INTEGER NOT NULL,
  title TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, symbol, bucket_at, signal_type, engine_version)
);
```

索引：

```sql
(owner_id, market_at DESC)
(owner_id, symbol, market_at DESC)
(owner_id, direction, market_at DESC)
```

不新增第二份分钟行情表；证据只保存触发时需要的有限数值，例如：

```json
{
  "priceMove5mPct": 1.2,
  "turnoverDelta": 18200000,
  "turnoverRatio": 2.4,
  "rangeHigh": 126.8,
  "attentionPrice": null,
  "factors": ["TURNOVER_SURGE", "PRICE_ACCELERATION", "DIRECTION_ALIGNMENT"]
}
```

不保存第三方原始 payload。

### 12.1 Retention

信号默认保留 30 个自然日；后续若需要长期策略复盘，再单独设计归档结果表。清理复用现有每天 `31 19 * * *` 的 `content-maintenance` 链路，在其中调用 `MarketSignalService.cleanupRetention()`；不新增 Cron trigger，也不为清理新增独立上游任务。

### 12.2 删除自选后的信号

用户从 watchlist 删除股票时，同一 owner + symbol 的 P2B 信号同时删除，避免已经不关注的股票继续出现在私有 Signal Desk。P2A 的原始 5 分钟快照是否保留仍沿用 P2A 策略，不由 P2B 静默改变。

## 13. Signal Engine 接口

建议新建：

```text
workers/api/src/features/market/signal-engine.ts
workers/api/src/features/market/signal-service.ts
```

纯计算接口示意：

```ts
interface SignalEngineInput {
  watchlist: WatchlistItem
  snapshots: SignalSnapshot[]
  now: Date
}

interface SignalCandidate {
  signalType: MarketSignalType
  direction: 'up' | 'down' | 'neutral'
  severity: 'watch' | 'strong'
  score: number
  marketAt: string
  bucketAt: string
  evidence: SignalEvidence
  engineVersion: 'balanced-v1'
}

function evaluateMarketSignal(input: SignalEngineInput): SignalCandidate | null
```

该函数不访问 D1、不 fetch、不读全局时间，所有时间都显式输入，便于 fixture/replay 测试。

## 14. SignalService 数据读取预算

每轮成功写入 P2A 快照后，对本轮 affected symbols 一次性读取所需历史列：

- 仅最多 30 个 symbol；
- 只读最近约 8 个自然日范围；
- 只选 `symbol/bucket_at/market_at/price/high/low/previous_close/volume/turnover` 等必要列；
- 内存按 symbol 分组；
- 不做 30 次独立历史 SQL 查询；
- 不访问第三方 Provider。

预计上界约 30 × 48 × 若干交易日，属于 D1/Worker 可控规模。实施阶段用真实 fixture 与 dry-run 验证内存和 CPU 时间。

## 15. 与现有 5 分钟任务的集成

采用**同一个 `market-watchlist-sync` job 内串行**：

```text
fetch quotes
→ write quote_5m
→ evaluate signals for successfully written symbols
→ write signals
→ write health
```

不新增一个并行 `market-signal-sync` Queue message，因为独立消息可能先于快照任务执行，造成竞态和重复读。

行为：

- Provider 全失败 → 不评估信号；
- 单股缺失 → 其他成功股继续评估；
- D1 快照写失败 → 本轮 signal eval 不运行；
- signal 计算 bug/数据库基础设施错误 → job 抛错，由现有 Queue retry；idempotency 保证重试不重复信号。

## 16. Private API

新增登录态只读接口：

```text
GET /api/admin/market/signals?scope=today&limit=50
```

可选参数限制：

- `scope=today|recent`，默认 today；`today` 必须按 `Asia/Shanghai` 交易日期边界查询，不能按 Worker UTC 日期切日；
- `limit=1..100`，默认 50；
- 可增加 `symbol` 精确过滤，但必须经过现有 StockSymbol parser。

返回：

```ts
interface MarketSignalDeskResponse {
  engineVersion: 'balanced-v1'
  marketAt: string | null
  baseline: {
    enabledCount: number
    readyCount: number
    warmingCount: number
  }
  items: MarketSignalItem[]
}
```

安全：

- `requireSession`；
- `Cache-Control: private, no-store`；
- 使用 `MARKET_READ_RATE_LIMITER`；
- 不进入 public `/api/market/*`；
- 不返回其他 owner 信号；
- 不返回私人 note，除非 UI 明确需要；P2B 首版不返回 note。

## 17. `/market` 信号工作区

把当前 `DESIGN READY` 占位替换成真实私有 Signal Desk。

### 17.1 未登录

只显示：

```text
信号雷达 · 私有
登录后查看你的自选股盘中观察信号
```

未登录时不调用 `/api/admin/market/signals`。

### 17.2 已登录 / 基线积累中

没有足够历史时显示：

```text
基线积累中
18 / 25 只有足够样本
```

不能把“没有信号”误解为“没有行情”。

### 17.3 有信号

Desktop：

- 顶部：今日信号数、重点观察数、基线 ready/warming；
- 主列表：时间、股票、方向、signal title、score/severity、证据；
- 可切 `全部 / 上行 / 下行 / 关注价`；
- 最新在前。

单条示例：

```text
10:35  中际旭创  ↑  观察  65
放量上冲
5m +1.2% · 5m成交额 2.4x 基线
```

Mobile：

- 单列信号卡；
- 第一行时间 + 股票 + severity；
- 第二行标题；
- 证据最多 2–3 条，不强塞宽表。

### 17.4 无信号

当数据完整但当天没有达到门槛：

```text
当前没有达到均衡型门槛的观察信号
不代表涨跌预测，仅表示规则暂未触发
```

## 18. Signal Desk 刷新生命周期

信号由后台 5 分钟任务生成，因此页面不需要 45 秒实时行情频率。

建议：

- 切入“信号”工作区立即加载一次；
- 交易时段、页面 visible、信号工作区 active 时每 60 秒从本站 D1 API 刷新；
- 页面 hidden / 切离信号工作区 → 停止轮询；
- 盘外停止自动轮询；
- 手动刷新可用；
- 请求并发保护与 AbortController 复用 P2A 模式。

这个 60 秒请求只读本站 Worker/D1，不触发第三方行情 fetch。

## 19. 财经事件关联

P2B 可以在信号卡侧边展示 P2A 已有的“最近相关财经事件”，但**不进入 score**：

- 股票代码/名称/tag 的确定性轻量关联；
- 没有可信事件就不显示；
- 不使用 LLM 断言“这条新闻导致了本次上涨”；
- 不把事件是否存在作为量价信号成立条件。

这样避免相关性被包装成因果关系。

## 20. Engine Version 与可复现性

第一版固定：

```text
balanced-v1
```

阈值、权重、冷却时间一旦生产使用，不原地静默修改。

以后调参：

```text
balanced-v2
```

旧信号保留其 engineVersion，便于回放和比较误报率。

## 21. 隐私与日志

P2B 延续 P2A 私有边界：

- public API 不返回 watchlist signal；
- 日志不输出完整 symbol 列表、note、attentionPrice 列表；
- 可记录 `signalCount / strongCount / evaluatedCount / warmingCount / engineVersion / durationMs / requestId`；
- 错误摘要有长度上限；
- evidence 不包含 Cookie、session、第三方 raw payload。

## 22. 失败语义

### 22.1 Provider 失败

P2A 本轮没有新快照 → P2B 不生成新信号；历史信号仍可查询。

### 22.2 部分股票缺失

只跳过该股票本轮，其他股票正常评估。

### 22.3 历史不足

标记 warming，不生成依赖缺失 baseline 的信号。

### 22.4 D1 历史查询失败

本轮 signal eval 失败并让 Queue retry；不生成空证据/假信号。

### 22.5 同一 bucket 重试

UNIQUE + deterministic id 确保幂等。

## 23. TDD / 测试策略

### 23.1 Signal Engine 纯单测

必须覆盖：

- 正常 5m turnover/volume delta；
- 跨日不做差；
- 午休不做差；
- 5 分钟量能 delta 只接受严格相邻 bucket，缺一个桶即拒绝该量能因子；
- 10 分钟价格窗口要求三个连续 5 分钟桶，缺中间桶即拒绝该窗口；
- marketAt 重复/倒退拒绝；
- cumulative 负 delta 拒绝；
- historical-slot baseline；
- intraday fallback baseline；
- baseline 样本不足；
- TURNOVER_SURGE 普通/强阈值边界；
- PRICE_ACCELERATION 5m/10m/极端边界；
- RANGE_BREAK 不包含 current；
- attention cross up/down/首桶 previousClose；
- 单普通量能 <50 不触发；
- 价量组合达到 watch；
- 强组合达到 strong；
- score cap 100；
- balanced-v1 固定版本。

### 23.2 SignalService / D1

覆盖：

- 一次批量读取最多 30 股历史，不一股一查；
- owner 隔离；
- disabled 不评估；
- idempotency；
- 20/30 分钟 cooldown；
- strong upgrade；
- direction 独立 cooldown；
- evidence JSON 白名单；
- 30 天 retention；
- 单股历史异常不阻塞其他股；
- 0 自选 zero work。

### 23.3 Scheduler

覆盖：

- 不新增 Cron trigger；
- signal eval 发生在 snapshot write 之后；
- Provider 失败不 eval；
- partial snapshot 只 eval 成功 symbols；
- retry 不重复 signal。

### 23.4 Route/Auth

覆盖：

- 未登录 401；
- private no-store；
- limiter；
- today/recent/limit/symbol 参数验证；
- owner isolation；
- public `/api/market/*` 无 signal 字段。

### 23.5 Nuxt/UI

覆盖：

- 未登录 locked state 且 0 private API request；
- warming / empty / watch / strong；
- up/down 红绿方向语义；
- 60 秒 visible/active poll；
- hidden/workspace pause；
- manual/auto 并发保护；
- Desktop/Mobile；
- 320–1728 无 document overflow；
- light/dark/dynamic；
- reduced motion；
- SPA cleanup；
- console/page/network errors。

## 24. Replay / 生产门禁

P2B 不新增行情 Provider，因此不重复做 P2A 的“30 股上游可达性”门禁；它需要的是**算法与生产数据门禁**。

实施阶段必须：

1. 用 deterministic fixtures 跑阈值边界；
2. 用生产 D1 的已有 P2A 5 分钟历史做只读 replay，禁止写回生产；
3. 统计每股/每日信号数量，检查是否明显刷屏；
4. 检查没有负 delta、跨午休/跨日伪信号；
5. Worker dry-run / CPU / D1 查询量保持可接受；
6. 部署后线上未登录 private 401、public API 无泄漏；
7. 真实浏览器验证信号工作区。

### 24.1 均衡型噪声门禁

初始门禁：

- 普通交易日、单只股票平均信号目标 `<= 6 条/日`；
- 同方向 20 分钟内不得重复普通信号；
- 同一 attention cross 方向 30 分钟内不得重复；
- 没有组合因子的普通单一放量不得持久化；
- 没有真实数据时信号数必须为 0。

这个数量是噪声预算，不是要求“必须每天产生信号”。0 条是合法结果。

## 25. 上线与暖机策略

P2B 可以在历史不足时安全上线，因为信号引擎 fail-closed：

- historical baseline 不足 → 使用满足最小样本的 intraday fallback；
- intraday 也不足 → warming；
- 不通过伪造历史让页面立刻有信号。

因此不需要为了“看起来有内容”预填模拟信号。

正式连续多交易日的误报率/信号密度属于上线后的观察指标，不伪报为本轮即时门禁已完成。

## 26. 实施文件边界

预计新增/修改：

```text
shared/market.ts
workers/api/migrations/0016_market_watchlist_signals.sql
workers/api/src/features/market/signal-engine.ts
workers/api/src/features/market/signal-service.ts
workers/api/src/features/market/watchlist-service.ts
workers/api/src/features/market/admin-routes.ts
app/pages/market/index.vue
workers/api/test/market-signal-engine.spec.ts
workers/api/test/market-signal-service.spec.ts
workers/api/test/market-watchlist*.spec.ts
workers/api/test/scheduled.spec.ts
test/nuxt/market-terminal.spec.ts
```

必要时拆出 Vue 组件以控制 `app/pages/market/index.vue` 继续膨胀；只做与 Signal Desk 直接相关的提取，不进行无关全页重构。

## 27. 明确不做

P2B 首版不做：

- 自动下单；
- “买点/卖点”结论；
- 持仓成本、仓位与盈亏；
- 全 A 扫描；
- L2、盘口、逐笔；
- RSI/MACD/KDJ 堆指标；
- 机器学习预测；
- 浏览器系统通知；
- 微信/Telegram/邮件告警；
- 用新闻给价格变化强行归因。

这些若未来需要，分别独立设计。

## 28. 完成定义

P2B 完成必须同时满足：

1. 用户选择的 B“均衡型”规则作为 `balanced-v1` 固化并有边界测试。
2. 只用 P2A 5 分钟真实快照；无新增行情 Provider / Cron / 全市场扫描。
3. 累计 volume/turnover 正确转为连续 5m delta；跨日、午休、缺桶、负 delta fail-closed。
4. 量能、价格、range、attention 原子因子和组合评分可解释、可 replay。
5. 冷却/去重/Queue retry 幂等通过测试。
6. 信号 API 私有、owner 隔离、no-store，公开 `/api/market/*` 零泄漏。
7. `/market` Signal Desk 在 desktop/mobile 有 warming/empty/watch/strong/locked 完整状态，不展示模拟信号。
8. `pnpm verify`、Worker dry-run、Secret scan、浏览器验收全绿。
9. 生产 migration、Workers、Pages、线上 API/浏览器 smoke 成功后才宣布上线。
10. 连续多交易日误报/信号密度观察作为后续 SLA，不冒充即时门禁。
