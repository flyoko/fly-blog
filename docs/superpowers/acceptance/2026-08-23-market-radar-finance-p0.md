# 市场雷达与财经多源 P0 验收标准

- 日期：2026-08-23
- 依据：`docs/superpowers/specs/2026-08-23-market-radar-finance-aggregation-design.md`
- 范围：P0 数据源基础、财经去重基础、`/market` 黑金页面骨架与主题隔离

## A. 数据源与凭据

- [x] A1. 现有华尔街见闻财经同步继续工作，既有 `/api/finance/flash` 合同不因改造失效。
- [x] A2. 金十来源通过独立 Provider/Adapter 接入，不把 MCP Token 写入仓库、D1、前端 bundle、错误响应或日志。
- [x] A3. 金十凭据只从 `JIN10_MCP_TOKEN`/等价 Cloudflare Secret 读取；缺失时来源状态为 disabled/skipped，不导致整次财经同步失败。
- [x] A4. 金十 Provider 能解析官方 `list_flash` 返回的 `content/time/url`，空标题时可以从正文生成规范展示标题，但不虚构事实。
- [x] A5. 金十公开展示默认关闭；在未取得书面再展示许可前，公开 `/api/finance/flash` 不返回仅来源于金十的正文副本。
- [x] A6. 管理端来源健康可以看到金十 enabled/disabled、最近尝试、最近成功、条目数和错误摘要，但不显示 Token。
- [x] A7. 新浪 iNews 不使用网页抓取替代正式接口；代码/文档明确正式接入需要 `appKey/appSecret` 与授权。
- [x] A8. 新浪签名算法有独立纯函数测试：参数排序、过滤空值、query string 拼接、追加 `&appSecret` 后 MD5；无凭据时不得发请求。

## B. 多源去重

- [x] B1. 同一来源相同 upstream id 重复同步不会新增事件。
- [x] B2. 跨来源标题规范化后完全一致且发布时间在 120 分钟窗口内时合并为一个公开事件。
- [x] B3. 近似标题只在同分类/相近时间窗口内比较，避免全表扫描。
- [x] B4. 涨/跌、上调/下调、增持/减持等反向语义冲突时不得自动合并。
- [x] B5. 明显不同数字（价格、百分比、金额、数量）冲突时不得仅凭文本相似自动合并。
- [x] B6. 规范事件保留全部来源引用、原始 URL、发布时间和来源 ID，可解释为什么发生合并。
- [x] B7. 一个来源失败不会删除其他来源已有事件；页面继续读取最后成功快照并能标识 stale/degraded。
- [x] B8. 无任何可信数据时明确展示 unavailable/empty，不生成 prototype/随机/模拟实时新闻。

## C. `/market` 黑金视觉隔离

- [x] C1. 导航出现“市场”入口并路由到 `/market`，导航配置仍来自 `config/site/navigation.json` / `modules.json`，不硬编码到 `BlogTopNav.vue`。
- [x] C2. `/market` 根节点使用局部 `.market-terminal` token，炭黑/石墨/香槟金仅作用于市场正文区域。
- [x] C3. `/market` 中上涨使用红色、下跌使用绿色；金色只表示主线、焦点、选中态和重要信号。
- [x] C4. 切换全局 light/dark/dynamic 时 `/market` 保持稳定可读的黑金终端视觉，不出现亮白闪屏。
- [x] C5. 从 `/market` 返回文章、AI 阅闻、瞬间、自述等页面后，不残留任何黑金背景、CSS 变量或样式。
- [x] C6. 320、360、390、430、768、1024、1280、1440、1728px 无页面级横向溢出。
- [x] C7. 390px 下信息顺序为市场状态/指数 → 今日主线 → 自选雷达 → 资金持续性 → 财经事件，主触控目标至少 44px。
- [x] C8. `prefers-reduced-motion: reduce` 下关闭扫描/高光位移/shimmer；`prefers-reduced-transparency: reduce` 下使用实体面板背景。
- [x] C9. 不新增全局高频动画，不破坏现有 MacBook 顶部导航/动态背景稳定性修复。

## D. P0 页面数据语义

- [x] D1. `/market` 首版允许行情/资金模块在 Provider 未接通前显示“数据源验证中/暂不可用”，但不得填模拟实盘数字。
- [x] D2. 财经事件区复用真实财经 API；对多来源事件只显示一个主事件，并可展开来源数量。
- [x] D3. 数据响应统一包含 `source`、`marketAt/publishedAt`、`fetchedAt`、`stale`/`quality` 等可判断新鲜度的字段或等价信息。
- [x] D4. `/ai.news` 不引入市场图表依赖，市场图表/可视化只在 `/market` 路由加载。

## E. 自动化验证

- [x] E1. `pnpm typecheck` 通过。
- [x] E2. `pnpm test:workers` 通过，新增 Provider、去重、缺 Secret、单源失败场景均有覆盖。
- [x] E3. 目标 Nuxt/unit 测试覆盖市场导航、主题隔离和公开财经不泄漏私有来源内容。
- [x] E4. `pnpm lint` 或项目等价 lint 命令通过。
- [x] E5. `pnpm generate` 通过。
- [x] E6. 浏览器回归至少覆盖 1440×900 与 390×844；控制台无新增错误。
- [x] E7. 仓库扫描不存在用户提供的金十 Token、`Bearer sk-` 或新增硬编码生产 Secret。

## F. 新浪 iNews 可行性结论

- [x] F1. 文档记录官方接口为 `https://inews.finance.sina.com.cn/api/live7x24_list` 与 `live7x24`，GET/JSON。
- [x] F2. 文档记录鉴权前提为项目启用后由新浪官方下发 `appKey/appSecret`，不能把公开网页 7×24 当成同等稳定 API。
- [ ] F3. 未取得凭据前，不把新浪计入生产可用性 SLA；取得凭据后再进行连续 5 个交易日 Cloudflare Worker P0 观测。 **BLOCKED_EXTERNAL：当前没有新浪正式 `appKey/appSecret` 与再展示授权，因此未执行生产 Worker 连续 5 个交易日观测。**

## 验收证据

### 自动化门禁

- 最终 `pnpm verify`：exit 0。
- 根测试：33 个文件 / 271 个测试通过。
- Edge Worker：1 个文件 / 34 个测试通过。
- API Worker：22 个文件 / 187 个测试通过。
- `pnpm generate` 成功；Nuxt Link Checker：0 error / 0 warning。
- Generated smoke 通过；29 个生成 HTML 无断链。
- Secret 扫描：767 个 tracked/generated 文件，无 Secret pattern 命中。
- `git diff --check` 通过。
- API Worker 最终 `wrangler deploy --dry-run`：1880.68 KiB，gzip 362.77 KiB；无需常驻云服务器。

### 数据与安全

- 金十 Adapter：`finance-jin10.spec.ts` 覆盖结构化/text JSON、缺 Secret 禁用和错误 Token 脱敏；真实 Token 不进入仓库、D1 或前端。
- 新浪 Adapter：`finance-sina-inews.spec.ts` 覆盖签名纯函数、无凭据零请求和正式 GET 边界；未加入 `syncAll()`。
- 去重：`finance-dedupe.spec.ts` 覆盖同分类/120 分钟窗口、数字与方向冲突、`3.5%` vs `35%`、阻断 >120 分钟链式合并。
- `finance.spec.ts` 覆盖私有来源不公开、私有行不阻止公开 seed、单源失败保留最后成功快照、`stale/quality`、缓存版本随来源状态变化。
- B8 回归：live 冷启动失败返回 `quality=unavailable` + 空列表；历史 prototype 行只保留在 D1/admin，真实 public service 不再公开，也不再生成新的 prototype 新闻。

### 浏览器验收

- 320 / 360 / 390 / 430 / 768 / 1024 / 1280 / 1440 / 1728px：`documentElement.scrollWidth === clientWidth`，无页面级横向溢出。
- 390px 能力顺序：指数与市场宽度 → 今日主线 → 自选雷达 → 板块/概念资金 → 财经事件聚合；5 个工作区均可切换且保持无溢出。
- 今日主线只按公开财经事件 `topic` 频次确定性聚合；浏览器夹具验证 `AI / 大模型 ×2`，无 LLM 判定。
- 多源事件：一个 canonical 事件展示 `多源 ×2` 与来源链接。
- `quality=stale`：显示“最后成功快照”；`degraded`：显示“部分来源降级”；`unavailable`：显示“暂无可信财经数据”，事件数 0。
- light / dark / dynamic 三种全局主题下，Market 黑金正文 token 保持一致。
- `prefers-reduced-motion: reduce` 下市场交互动效计算时长约 1 微秒、animation 为 none；`prefers-reduced-transparency` 有静态合同与实体背景 CSS。
- SPA `/market` → `/`：`.market-terminal` 卸载，`body/#blog-root` 均无 `--market-*` 残留。
- 修复 SSR 时钟 hydration mismatch 后，最终 1440×900 浏览器 `errors` 与 console 均为空。

### 当前外部上线门禁

- **新浪 iNews**：F3 `BLOCKED_EXTERNAL`。需要正式 `appKey/appSecret`、再展示授权，并在 Cloudflare Worker 连续观测 5 个交易日后才能加入生产 SLA / `syncAll()`。
- **金十生产启用**：代码、官方 MCP schema/返回和 Worker 打包已验证，但真实生产 Cloudflare Secret 与生产出口连续观测尚未执行；公开展示继续默认关闭。
- 本次没有部署生产、没有提交、没有 push。
