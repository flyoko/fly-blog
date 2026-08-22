# 市场数据 Provider P1 验收标准

- 日期：2026-08-23
- 依据：`docs/superpowers/specs/2026-08-23-market-data-provider-p1-design.md`
- 范围：指数、市场宽度、行业/概念资金、质量语义、Cloudflare 远端探针与 `/market` 接线

## A. Provider 与解析

- [x] A1. 共享合同定义 `live | degraded | stale | unavailable`，并包含 `source/fetchedAt/marketAt/stale/staleAgeMs/quality`。
- [x] A2. 指数 Provider 一次请求可解析上证 `000001`、深证 `399001`、创业板 `399006` 的点位、涨跌额和涨跌幅；任一必需数字缺失时该条不得伪造为 0。
- [x] A3. 市场宽度 Provider 能从真实涨跌分布 payload 计算上涨、下跌、平盘、总家数，并在存在对应桶时给出涨停/跌停家数。
- [x] A4. 行业资金使用 `m:90+t:2`、概念资金使用 `m:90+t:3`，解析板块代码、名称、涨跌幅、主力净流入、净占比、领涨股和时间。
- [x] A5. `'-'`、空字符串、`null`、缺字段统一解析为 `null`/不可用，不把空资金值转成 0。
- [x] A6. EastMoney Host A 网络错误/5xx 时可回退 Host B；Host A 成功时不得无意义重复请求 Host B。
- [x] A7. Provider 单次 host 请求超时为 2500ms 量级，总 fallback 时间预算不超过 5000ms 量级。
- [x] A8. 两个 host 都失败时返回结构化失败，不在 Adapter 内生成任何 fallback 数字。

## B. D1 与质量状态

- [x] B1. `0014_market_data.sql` 创建 `market_source_health`、`market_daily_snapshot`、`market_sector_flow_daily`，主键/索引满足按 capability、交易日、板块类型查询。
- [x] B2. overview 的指数与宽度都实时成功时返回 `quality=live`、`stale=false`。
- [x] B3. overview 单能力实时失败但 D1 有该能力最后成功快照时返回 `quality=degraded`，成功能力保持最新值。
- [x] B4. overview 全部实时失败但 D1 有最后成功快照时返回 `quality=stale`、`stale=true` 与正数/零以上的 `staleAgeMs`。
- [x] B5. overview 全部失败且无可信 D1 快照时返回 `quality=unavailable`、`data=null` 或明确空结构，不产生 prototype。
- [x] B6. 行业同步失败不会删除概念快照；概念失败不会删除行业快照；指数/宽度失败也不会清空其他已成功 capability。
- [x] B7. 同一交易日重复 sector sync 使用 upsert，不增加重复 `(trade_date, sector_kind, sector_code)` 行。
- [x] B8. `1/3/5/10/20` 日累计按 D1 实际已有交易日求和；不足窗口时 `availableDays` 为真实天数、`complete=false`。
- [x] B9. `market_source_health` 记录最近尝试、最近成功、状态、条数、延迟和最多 500 字错误摘要，不记录响应头/Cookie/Secret。
- [x] B10. last-good 快照只来自成功解析的真实 Provider 响应，测试 fixture/prototype 不进入真实 public service。

## C. 调度与资源预算

- [x] C1. 现有 `*/5 * * * *` Queue 调度新增 `market-sync`，不新增 Cloudflare Cron trigger。
- [x] C2. `market-sync` 在北京时间工作日 09:20–11:35、12:55–15:15 才请求上游；其他时间返回 skipped 且 Provider fetch 调用次数为 0。
- [x] C3. 一次 scheduled sync 中指数/宽度、行业/概念可独立成功或失败，单一来源错误不会让其他成功数据回滚。
- [x] C4. P1 不写全市场 Tick 或分钟 K；`market_daily_snapshot` 每交易日最多一行，sector 表每板块每天最多一行。
- [x] C5. Worker dry-run 打包成功，脚本体积未突破 Cloudflare 当前部署限制。

## D. Public Market API

- [x] D1. `GET /api/market/overview` 返回三大指数 + 市场宽度的统一 MarketEnvelope。
- [x] D2. `GET /api/market/sector-flows?kind=industry|concept&limit=N` 返回真实当前/last-good 板块资金和窗口累计。
- [x] D3. `kind` 非法或 `limit` 超范围返回 400；合法请求在 Provider unavailable 时仍用 200 表达“数据不可用”，避免与本站 5xx 混淆。
- [x] D4. public API 不暴露第三方原始响应、内部 D1 字段、凭据或错误堆栈。
- [x] D5. `/api/market/*` 不要求前端直接访问 EastMoney，也不把上游 Host/协议硬编码到 Vue 页面。

## E. `/market` UI

- [x] E1. 指数能力卡有真实数据时展示上证、深证、创业板点位与涨跌幅，并严格红涨绿跌。
- [x] E2. 市场宽度有真实数据时展示上涨/下跌/平盘家数；数据不可用时明确显示 unavailable，不出现示例数字。
- [x] E3. 资金工作区支持行业/概念切换，展示今日主力净流入与 `1/3/5/10/20` 日累计；不完整窗口明确显示“积累中”/真实 `availableDays`。
- [x] E4. `degraded/stale/unavailable` 在 `/market` 有可见状态标签和更新时间，不把 stale 快照冒充 live。
- [x] E5. 今日主线若并列展示财经 topic 与资金前列板块，必须明确来源，不把二者自动写成 AI 因果判断。
- [x] E6. 320、360、390、430、768、1024、1280、1440、1728px 无页面级横向溢出；资金表允许自身横向滚动。
- [x] E7. 390px 主触控目标 >=44px；没有依赖 hover 才能完成的关键操作。
- [x] E8. light/dark/dynamic 下 `/market` 保持局部黑金；SPA 离开后 `body/#blog-root` 无 `--market-*` 残留。
- [x] E9. `prefers-reduced-motion` / `prefers-reduced-transparency` 现有 P0 保护不因 P1 数据组件回退。

## F. Cloudflare 远端出口门禁

- [x] F1. 使用 Cloudflare remote dev 或独立临时 probe Worker 从 Cloudflare 执行环境请求候选端点；本机访问结果不能代替此证据。
- [x] F2. 指数、市场宽度、行业资金、概念资金每个 capability 至少记录 20 次远端样本，含成功、空响应、4xx、5xx、网络错误和延迟。
- [x] F3. 即时本地 UI 接线门槛：指数成功率 >=95%、板块资金成功率 >=90%、P95 <3000ms；正式生产 SLA 仍要求总体设计中的 5 个交易日 >=99%/98%。
- [x] F4. 未通过即时门禁的 capability 必须保持 candidate/unavailable，不得因为 fixture、本机请求或单次成功而标 production-ready。
- [x] F5. 远端 probe 不修改生产 `fly-living-api`，不写正式 D1，临时 probe 资源如创建必须在验收后删除。

## G. 自动化与收尾

- [x] G1. Provider fixture tests 覆盖正常、空字段、`data=null`、host fallback、双 host 失败、4xx/5xx、超时和涨跌分布解析。
- [x] G2. Service tests 覆盖 live/degraded/stale/unavailable、last-good、独立 capability 失败、同日 upsert、窗口累计和盘外 zero-fetch。
- [x] G3. Nuxt/unit tests 覆盖“无数据不显示模拟数字”、质量状态、行业/概念切换和 P0 主题隔离合同。
- [x] G4. `pnpm lint`、`pnpm typecheck`、`pnpm test:unit`、`pnpm test:workers`、`pnpm generate`、smoke、links、secrets 全部通过；等价总门禁为 `pnpm verify` exit 0。
- [x] G5. 最终浏览器回归至少重新覆盖 1440×900、390×844、三主题、SPA 离开、console/errors。
- [x] G6. `git diff --check` 通过，仓库/生成产物无新增生产 Secret。
- [x] G7. 本阶段不 commit、不 push、不部署生产。

## P9 Cloudflare 远端出口证据

- 执行方式：`wrangler dev --remote`，临时 Worker 名 `fly-market-provider-probe-20260823`，无 D1/R2/Queue/Secret binding；本地 `127.0.0.1:8791` 仅为 Wrangler 转发入口，第三方请求由 Cloudflare edge preview 执行。
- 初次 remote probe 暴露 Workers runtime `Illegal invocation`：Provider 把全局 `fetch` 直接保存为字段后调用，Cloudflare 要求正确的全局调用上下文。已改成 `workerFetch = (input, init) => fetch(input, init)`；同一 remote probe 复测通过。
- 远端数据还验证宽度接口没有独立交易时间。已新增红→绿回归，D1 overview 持久化时 breadth 的 `marketAt` 由成功指数的真实交易时间锚定，`fetchedAt` 保留实际抓取时间，避免周末/休市日形成假交易日。

| capability | attempts | success | empty | 4xx | 5xx | network | P50 | P95 | 实际成功 endpoint |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| indices | 20 | 20 / 100% | 0 | 0 | 0 | 0 | 409ms | 976ms | `push2delay.eastmoney.com/api/qt/ulist.np/get` 20/20 |
| breadth | 20 | 20 / 100% | 0 | 0 | 0 | 0 | 137ms | 288ms | `push2ex.eastmoney.com/getTopicZDFenBu` 20/20 |
| sector-industry | 20 | 20 / 100% | 0 | 0 | 0 | 0 | 404ms | 443ms | `push2delay.eastmoney.com/api/qt/clist/get` 20/20 |
| sector-concept | 20 | 20 / 100% | 0 | 0 | 0 | 0 | 402ms | 455ms | `push2delay.eastmoney.com/api/qt/clist/get` 20/20 |

### 即时门禁结论

- F1：PASS。样本来自 Cloudflare remote edge preview，不是本机直连。
- F2：PASS。四个 capability 各 20 次，共 80 次远端样本。
- F3：PASS（仅 P1 即时接线门槛）。指数 100% >= 95%；行业/概念资金 100% >= 90%；全部 P95 < 3000ms。
- F4：PASS。当前四项均通过即时门禁；正式生产 SLA 仍未宣称通过，仍需总体设计要求的连续 5 个交易日 >=99% / >=98% 观察。
- 观察：指数、行业、概念 20/20 的成功 endpoint 都是 `push2delay`，说明 Cloudflare 当前出口下主 `push2` 不是可靠首选；Provider fallback 是实际必要路径。正式 5 日观测应继续分别统计主/回退 host。

## P10 最终验收证据

### 自动化总门禁

- 最终 `git diff --check && pnpm verify`：exit 0。
- 根测试：33 个文件 / 271 个测试通过。
- Edge Worker：1 个文件 / 34 个测试通过。
- API Worker：25 个文件 / **222 个测试通过**。
- Provider 专项：`market-eastmoney.spec.ts` 12/12，新增锁定 `data=null` 解析失败后切备用 Host、4xx/5xx fallback、每 Host `AbortSignal.timeout(2500)`。
- `pnpm generate` 成功；Nuxt Link Checker：0 error / 0 warning。
- Generated smoke 通过；29 个生成 HTML 无断链。
- Secret 扫描：767 个 tracked/generated 文件，无新增 Secret pattern 命中。
- 最终 API Worker `wrangler deploy --dry-run`：**1909.69 KiB / gzip 369.42 KiB**，exit 0。

### Cloudflare 远端最新代码复核

- 在 80 次正式 P9 样本之后，Provider fallback 失败路径增加了 `data=null` 解析级 fallback；因此用最新代码重新启动独立 `wrangler dev --remote` preview 做正常路径 smoke。
- 最新代码 remote smoke：indices / breadth / sector-industry / sector-concept 各 5 次，共 **20/20 成功**。
- indices 仍由 `push2delay` 成功，5 次总延迟约 402–1481ms；breadth 由 `push2ex` 成功，约 108–501ms；行业/概念资金均由 `push2delay` 成功，约 346–619ms / 372–450ms。
- preview 关闭后查询 `fly-market-provider-final-probe-20260823` deployments 返回 Cloudflare `10007 Worker does not exist on your account`；临时 `/private/tmp/market-p1-final-probe` 已删除。

### 浏览器最终验收

- 最新静态产物覆盖 320 / 360 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1728px；所有宽度 `documentElement.scrollWidth === clientWidth`。
- 1440 live：上证/深证/创业板 + 市场宽度真实结构渲染，红涨绿跌，“最新行情”不把周末最后收盘误称实时。
- 390 资金：页面 390/390；资金表容器约 343px、内容约 992px，只在自身横向滚动；工作区按钮约 56px、行业/概念按钮 44px。
- industry → concept 切换不串旧数据；不完整 20D 明确显示 `积累中 12/20日`。
- overview 的 degraded/stale/unavailable 均有明确标签；unavailable 时指数条目数 0，不展示示例点位。
- sector degraded/stale/unavailable 均有明确标签；unavailable 时表格不渲染，并说明不使用静态榜单或随机数。
- light/dark/dynamic 下 Market 局部黑金 token 一致；`prefers-reduced-motion` 下 animation=none、scrollBehavior=auto。
- SPA `/market → /` 后 `.market-terminal` 卸载，`body/#blog-root` 无 `--market-*` 残留；最终 browser errors/console 均为空。

### 当前 Agent 最终审查修复项

1. Cloudflare runtime 直接保存全局 `fetch` 会触发 `Illegal invocation` → 改成正确全局 wrapper，并由 remote probe 验证。
2. breadth 无交易所时间，休市/周末可能用抓取时间形成假交易日 → D1 snapshot 和 overview 均由指数真实 `marketAt` 锚定。
3. UI `live` 文案“实时数据”在休市日会误导 → 改成“最新行情”。
4. 资金窗口曾跳过 `mainNetInflow=null` 的真实交易日并向更老日期借数 → 改成按真实交易日期截窗；窗口内缺值则 `netInflow=null, complete=false`。
5. P1 接通后雷达资金卡仍残留 P0 “Provider 验收后开放”文案 → 改成 `ON DEMAND / 行业・概念资金按需加载真实数据`。
6. P1 新增 `tabler:clock-data` 不存在 → 改为仓库已存在的 `tabler:clock`，最终 generate 无该警告。
7. HTTP 200 + `data=null` 原本会在选中主 Host 后才解析，导致无法回退 → 把 capability parser 放进每 Host 尝试循环，现有 12/12 Provider 测试锁定。

当前 Agent 最终审查未发现剩余 Critical / Important。

### 本轮边界

- P1 的**即时 Cloudflare 接线门槛**已通过，可以保留本地 `/market` 真数据接线。
- **正式生产 SLA 尚未宣称通过**：仍需部署前/后连续 5 个交易日观察，指数 >=99%、行业/概念资金 >=98%，并持续记录主 Host 与 fallback Host 命中情况。
- 本轮没有 commit、没有 push、没有部署生产。
