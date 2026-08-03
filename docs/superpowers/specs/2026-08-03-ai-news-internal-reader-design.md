# fly living AI 阅闻站内阅读与定时聚合设计

- 日期：2026-08-03
- 状态：已完成设计自审，按用户授权进入实施
- 项目：`flyoko/fly-blog`
- 分支：`feature/ai-news-internal-reader`

## 1. 背景与目标

现有 `/ai.news` 已能聚合 AI HOT、在花 RSS 和手动精选，但页面采用大标题、巨型首稿和重复卡片网格，长列表阅读效率较低。卡片标题通常直接跳转至上游站点，用户无法在博客内连续阅读。

本次改造同时解决两个问题：

1. 重做 `/ai.news` 为紧凑、可扫描的资讯工作台。
2. 对目标地址属于 `aihot.virxact.com` 或 `www.zaihua.news` 的条目提供博客内阅读页，并通过 Worker 定时同步可合法展示的正文或摘要。

不生成装饰照片，不以 iframe 嵌入上游页面，不镜像没有明确再分发许可的第三方全文。

## 2. 已确认决策

1. 列表页改为紧凑单列资讯流，桌面端右侧显示今日日报；移动端按主内容、日报顺序排列。
2. 支持标题搜索和来源筛选，顶部显示最近同步时间、下一次同步周期和来源健康状态。
3. 站内阅读使用稳定路由 `/ai.news/read/:id`，不使用临时弹窗作为唯一阅读入口。
4. 只有 AI HOT 与在花条目启用站内阅读；手动精选和其他第三方链接继续外跳。
5. AI HOT 使用公开 `feed/full.xml`：存在 `content:encoded` 时显示允许再分发的全文，否则显示 Feed 摘要。
6. 在花先读取 RSS，再只对新增或内容变化的条目请求文章页，提取 `msg-prose` 正文；提取失败时回退 RSS 摘要。
7. 站内正文以清洗后的纯文本段落保存，不执行上游 HTML、脚本、样式、iframe、表单或事件属性。
8. Worker 每 30 分钟触发新闻任务；AI HOT 最短 30 分钟，在花最短 60 分钟。请求携带 ETag 或 Last-Modified，304 时不解析、不写库。
9. 原有瞬间备份仍只在每日 `17 19 * * *` 触发，不因新闻半小时任务增加备份频率。
10. 管理后台保留手动同步能力，并显示每个来源的状态、条目数、最近成功时间和错误。

## 3. 用户体验

### 3.1 `/ai.news` 列表页

页面由四个区块组成：

1. **紧凑页头**：标题、说明、最近更新时间、同步状态。
2. **筛选工具条**：全部、AI 精选、站长资讯、手动精选；提供关键词搜索。
3. **资讯流**：每条显示来源、时间、标题、两至三行摘要、内容标记（全文或摘要）和阅读动作。条目不再使用大面积同形卡片。
4. **今日日报**：桌面端位于右侧，展示日报导语和重点条目；移动端放在资讯流之前或之后的独立折叠区。

点击行为：

- `readerPath` 存在：使用 `NuxtLink` 进入博客内阅读页。
- `readerPath` 不存在：使用外部链接，并明确显示外部打开图标。
- “查看原始来源”始终保留，不替代站内阅读入口。

### 3.2 `/ai.news/read/:id` 站内阅读页

阅读页包含：

- 返回 AI 阅闻
- 来源、发布时间、同步时间
- 标题和摘要
- “全文”或“摘要”标记
- 清洗后的正文段落
- AI HOT 或在花署名
- 原始来源与上游聚合页链接
- 内容降级说明：若正文无法同步，明确提示当前为来源摘要

阅读页使用博客现有默认布局和评论/导航体系，不伪装为本站原创文章。SEO canonical 指向本站阅读 URL，同时在正文中明确来源。

## 4. 数据模型

新增迁移 `0007_news_reader.sql`。

### 4.1 `news_documents`

```sql
CREATE TABLE news_documents (
  item_id TEXT PRIMARY KEY,
  reader_key TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  original_url TEXT,
  title TEXT NOT NULL,
  body_text TEXT NOT NULL,
  content_mode TEXT NOT NULL CHECK (content_mode IN ('full', 'summary')),
  attribution_name TEXT NOT NULL,
  attribution_url TEXT NOT NULL,
  published_at TEXT,
  content_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

正文与卡片分表，列表查询不加载大文本。`item_id` 与 `news_items.id` 一一对应；`reader_key` 是由 `item_id` 计算出的固定 SHA-256 前缀，只用于安全、短且不含斜杠的公开路由。

### 4.2 `news_sync_state` 扩展

增加：

- `etag TEXT`
- `last_modified TEXT`
- `next_sync_at TEXT`

ETag 与 Last-Modified 仅作为条件请求状态；失败时保留上次成功值。

## 5. 数据源与映射

### 5.1 AI HOT

同步三个公开端点：

1. `/api/v1/items?mode=selected&window=24h&limit=30`：列表标题、摘要、分类、原文和站内链接。
2. `/feed/full.xml`：按 GUID 匹配条目，提供允许再分发的全文或摘要。
3. `/api/v1/dailies/latest`：今日日报。

`/api/v1/hot-topics` 可继续提供热点排名，但不再作为唯一列表源。列表条目 ID 统一为 `ai-hot:<upstream-id>`，避免同一内容重复。

正文规则：

- `content:encoded` 非空：清洗后保存，`content_mode = full`。
- 否则使用 description 中的摘要，`content_mode = summary`。
- 始终保留 AI HOT attribution 与第三方原文 URL。

### 5.2 在花

1. 请求 `/rss.xml`，规范化最近 30 条。
2. 根据 GUID/文章 URL 生成 `station-news:<url>`。
3. 仅当条目为新增、RSS description 变化或正文不存在时请求文章页。
4. 从 `<div class="msg-prose">` 提取段落文本；无法确认结构时不猜测，回退 RSS description。
5. 站内阅读页保留在花署名、文章 URL 和 RSS 获取时间。

## 6. 同步与调度

Wrangler triggers 调整为：

```json
{
  "crons": ["*/30 * * * *", "17 19 * * *"]
}
```

`scheduled(controller, env, ctx)` 按 `controller.cron` 分流：

- `*/30 * * * *`：只执行 `NewsService.syncDueSources()`。
- `17 19 * * *`：执行 `MomentBackupService.backup()`，并允许顺带执行一次新闻同步。

来源最短周期：

- AI HOT items/full/daily：30 分钟。
- 在花 RSS/正文：60 分钟。

服务先读取 `next_sync_at`。未到期直接返回 `skipped`。到期后发送条件请求：

- 200：解析并事务性更新条目、正文和状态。
- 304：只更新状态与下一次检查时间。
- 429：遵循 `Retry-After`，不并发重试。
- 5xx/网络错误：记录错误，保留最后成功快照，下次任务再尝试。

## 7. API 合同

### 7.1 列表

`GET /api/news`

列表条目新增：

- `readerPath: string | null`
- `contentMode: 'full' | 'summary' | null`
- `sourceLabel: string`

只在存在 `news_documents` 且来源域名在允许列表时返回 `readerPath`。

### 7.2 详情

`GET /api/news/read/:readerKey`

返回：

- 规范化条目字段
- `bodyText`
- `contentMode`
- `attribution`
- `sourceUrl`
- `originalUrl`
- `fetchedAt`

`readerKey` 不存在、条目未公开、来源不允许站内阅读或正文记录缺失时返回 404，不提供任意 URL 代理能力。

## 8. 安全与内容边界

1. 详情 API 只能按数据库 ID 读取，不能接收 URL 并代抓，避免 SSRF。
2. 上游 URL 必须通过现有 `isPublicHttpUrl` 校验，并额外限制到配置中的固定来源域名。
3. 正文转换为纯文本段落后保存和渲染，不使用未清洗 `v-html`。
4. 最大正文长度限制为 100,000 字符，单条响应和抓取设置超时。
5. AI HOT 全文严格服从其 Feed 白名单；无全文字段时只展示摘要。
6. 页面明确标识外部来源，不把聚合内容描述为本站原创。

## 9. 测试与验收

### Worker

- 条件请求头、304、Retry-After 和来源最短周期。
- AI HOT items/full feed 按 ID 合并，全文与摘要模式正确。
- 在花正文提取成功与结构变化降级。
- 详情 API 只返回允许来源，未知 ID 为 404。
- 半小时 cron 不触发瞬间备份，每日 cron 保留备份。

### Nuxt

- 列表筛选、搜索、内部/外部链接分流。
- 详情页全文、摘要、加载、404 和来源标识。
- 320、390、768、1440px 无横向溢出。
- 浅色、深色和 reduced-motion 可用。

### 全量验证

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:unit`
- `pnpm test:workers`
- `pnpm generate`
- `pnpm check:links`
- `pnpm check:secrets`
- 目标 E2E 与生产浏览器回归

## 10. 回滚

1. 前端可回滚至旧 `/ai.news`，新详情路由移除后旧列表仍可使用已有 `news_items`。
2. `news_documents` 为新增表，不影响原表；回滚代码时可保留数据。
3. Cron 可先移除半小时表达式恢复每日任务。
4. 来源同步失败时页面继续读取最后一次成功快照，不清空现有条目。

## 11. 设计自审

- 无 TBD、TODO 或未决占位。
- 站内阅读范围只包含用户指定的两个域名。
- 全文与摘要边界明确，不承诺对所有条目复制全文。
- 半小时新闻任务和每日备份任务已分流，避免频率副作用。
- 数据、API、UI、错误处理、测试与回滚范围一致。
