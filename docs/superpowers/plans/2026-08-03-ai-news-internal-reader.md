# AI 阅闻站内阅读与定时聚合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. It will decide whether each batch should run in parallel or serial subagent mode and will pass only task-local context to each subagent. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/ai.news` 重构为紧凑资讯工作台，为 AI HOT 与在花条目提供可分享的博客内阅读页，并通过 Cloudflare Worker 条件轮询自动更新内容。

**Architecture:** D1 中以 `news_items` 保存轻量列表，以新增 `news_documents` 保存站内阅读文本；Worker 分别适配 AI HOT items、AI HOT full feed、AI HOT daily 与在花 RSS/文章页，并通过 ETag、Last-Modified 和 `next_sync_at` 控制同步。Nuxt 列表只消费轻量 DTO，详情页按不可逆 `readerKey` 调用独立公开接口。

**Tech Stack:** Nuxt 4、Vue 3、Hono、Cloudflare Workers、D1、Wrangler Cron、Vitest、Playwright、SCSS。

## Global Constraints

- 本次执行由当前 agent 串行完成，不派发子 agent。
- 不生成或引入装饰照片。
- 站内阅读白名单只包含 `aihot.virxact.com` 与 `www.zaihua.news`。
- AI HOT 无 `content:encoded` 时只展示摘要。
- 在花正文提取失败时回退 RSS 摘要，不猜测页面结构。
- 上游内容统一转换为纯文本段落，不使用未清洗 `v-html`。
- AI HOT 最短 30 分钟，在花最短 60 分钟。
- 半小时 Cron 不执行瞬间备份。
- 不修改 `/Users/liruiyu/Desktop/project/blog` 的历史未提交内容。

---

## 文件结构

- Create `workers/api/migrations/0007_news_reader.sql`：正文表和同步状态扩展。
- Modify `shared/admin/news.ts`：列表与详情公开 DTO。
- Modify `shared/admin/site-config.ts`：来源 adapter、同步间隔和是否发布条目。
- Modify `config/news/sources.json`：四类上游端点与周期。
- Create `workers/api/src/features/news/parsers.ts`：XML、HTML 转文本、AI HOT 与在花解析。
- Modify `workers/api/src/features/news/service.ts`：条件请求、到期判断、合并、正文写入与详情查询。
- Modify `workers/api/src/features/news/routes.ts`：列表和详情缓存路由。
- Modify `workers/api/src/index.ts`：Cron 分流。
- Modify `workers/api/wrangler.jsonc`：增加半小时触发器。
- Modify `workers/api/test/news.spec.ts`：解析、同步、304、降级、详情测试。
- Create `workers/api/test/scheduled.spec.ts`：Cron 分流测试。
- Modify `app/pages/ai.news.vue`：紧凑资讯工作台。
- Create `app/pages/ai.news/read/[id].vue`：站内阅读详情。
- Create `test/nuxt/ai-news-reader.spec.ts`：静态契约与链接分流测试。
- Modify `e2e/cycle2.spec.ts`：列表与阅读页浏览器路径。

### Task 1: 数据合同与迁移

**Files:**
- Create: `workers/api/migrations/0007_news_reader.sql`
- Modify: `shared/admin/news.ts`
- Modify: `shared/admin/site-config.ts`
- Modify: `config/news/sources.json`
- Test: `test/shared/cycle3-contracts.spec.ts`

**Interfaces:**
- Produces: `NewsItemDto.readerPath`, `NewsItemDto.contentMode`, `NewsDocumentDto`, `NewsSourceConfig.adapter`, `NewsSourceConfig.intervalMinutes`, `NewsSourceConfig.publishItems`。

- [ ] **Step 1: 写失败的合同测试**

```ts
expect(newsSourcesConfigSchema.parse(config).sources).toEqual(expect.arrayContaining([
  expect.objectContaining({ adapter: 'aihot-items', intervalMinutes: 30, publishItems: true }),
  expect.objectContaining({ adapter: 'zaihua-rss', intervalMinutes: 60, publishItems: true }),
]))
expect(newsItemSchema.parse(item)).toMatchObject({ readerPath: null, contentMode: null })
```

- [ ] **Step 2: 运行合同测试并确认失败**

Run: `pnpm vitest run test/shared/cycle3-contracts.spec.ts`
Expected: FAIL，提示新字段或 adapter 未定义。

- [ ] **Step 3: 增加迁移与 Zod 合同**

迁移必须创建 `news_documents(item_id, reader_key, source_id, source_url, original_url, title, body_text, content_mode, attribution_name, attribution_url, published_at, content_hash, fetched_at, updated_at)`，并向 `news_sync_state` 增加 `etag`、`last_modified`、`next_sync_at`。

`NewsItemDto` 新增：

```ts
readerPath: z.string().startsWith('/ai.news/read/').nullable(),
contentMode: z.enum(['full', 'summary']).nullable(),
```

新增：

```ts
export const newsDocumentSchema = z.object({
  item: newsItemSchema,
  readerKey: z.string().regex(/^[a-f0-9]{32}$/u),
  bodyText: z.string().min(1).max(100_000),
  contentMode: z.enum(['full', 'summary']),
  attribution: z.object({ name: z.string().min(1), url: publicHttpUrlSchema }),
  sourceUrl: publicHttpUrlSchema,
  originalUrl: publicHttpUrlSchema.nullable(),
  fetchedAt: z.string().datetime(),
})
```

- [ ] **Step 4: 更新来源配置**

配置四个 adapter：`station-news`、`ai-hot-items`、`ai-hot-full`、`ai-hot-daily`。全文 Feed 与日报设置 `publishItems: false`；items 与站长资讯设置 `publishItems: true`。

- [ ] **Step 5: 运行合同测试**

Run: `pnpm vitest run test/shared/cycle3-contracts.spec.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add workers/api/migrations/0007_news_reader.sql shared/admin/news.ts shared/admin/site-config.ts config/news/sources.json test/shared/cycle3-contracts.spec.ts
git commit -m "feat: 扩展阅闻站内阅读数据合同"
```

### Task 2: 安全解析器

**Files:**
- Create: `workers/api/src/features/news/parsers.ts`
- Test: `workers/api/test/news.spec.ts`

**Interfaces:**
- Produces: `parseRssItems(xml)`, `parseAiHotItems(payload, fetchedAt)`, `parseAiHotFullFeed(xml)`, `extractZaihuaArticle(html)`, `htmlToReadableText(html)`。

- [ ] **Step 1: 写失败的解析测试**

覆盖：CDATA、HTML entity、段落换行、`content:encoded`、在花 `msg-prose`、缺失结构返回 `null`、脚本内容不进入文本。

```ts
expect(extractZaihuaArticle(html)).toEqual({ title: '标题', bodyText: '第一段\n\n第二段' })
expect(parseAiHotFullFeed(feed)[0]).toMatchObject({ upstreamId: 'cms1', contentMode: 'full' })
```

- [ ] **Step 2: 运行目标测试并确认失败**

Run: `pnpm --filter @fly-living/api-worker test -- news.spec.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯函数解析器**

`htmlToReadableText` 先删除 `script/style/noscript/iframe/form` 块，将 `p/li/h1-h6/br/blockquote/pre` 转换为换行，再移除标签、解码常见实体、合并空白并截断 100,000 字符。

`extractZaihuaArticle` 只接受同时存在 `msg-prose` 与标题元数据的页面；否则返回 `null`。

- [ ] **Step 4: 运行解析测试**

Run: `pnpm --filter @fly-living/api-worker test -- news.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add workers/api/src/features/news/parsers.ts workers/api/test/news.spec.ts
git commit -m "feat: 增加阅闻来源安全解析器"
```

### Task 3: 条件同步与正文存储

**Files:**
- Modify: `workers/api/src/features/news/service.ts`
- Test: `workers/api/test/news.spec.ts`

**Interfaces:**
- Consumes: Task 1 DTO/配置、Task 2 解析器。
- Produces: `NewsService.sync({ force?: boolean })`, `NewsService.list(page, pageSize)`, `NewsService.read(readerKey)`。

- [ ] **Step 1: 写失败的同步测试**

覆盖 AI HOT items 与 full feed 合并、在花正文成功与降级、ETag 请求头、304、未到期 skipped、失败保留旧正文、reader key 长度与稳定性。

- [ ] **Step 2: 运行测试并确认失败**

Run: `pnpm --filter @fly-living/api-worker test -- news.spec.ts`
Expected: FAIL，现有 service 不支持 adapter、正文或条件请求。

- [ ] **Step 3: 拆分同步阶段**

实现：

```ts
async sync(options: { force?: boolean } = {}): Promise<{ sources: SyncResult[], syncedAt: string }>
async read(readerKey: string): Promise<NewsDocumentDto | null>
```

每个来源先读取 `news_sync_state`。未到期且非 force 时返回 `skipped`；请求携带保存的 ETag/Last-Modified；200 后保存新条件头和 `next_sync_at`；304 只更新状态。

- [ ] **Step 4: 实现正文 upsert**

使用 `crypto.subtle.digest('SHA-256', itemId)` 的前 32 个十六进制字符生成 `reader_key`。`news_documents` upsert 仅在 `content_hash` 变化时更新正文和 `updated_at`。

- [ ] **Step 5: 更新列表查询**

`news_items LEFT JOIN news_documents`，DTO 中只返回 `readerPath` 与 `contentMode`，不返回 `body_text`。

- [ ] **Step 6: 运行 Worker 测试**

Run: `pnpm --filter @fly-living/api-worker test -- news.spec.ts`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add workers/api/src/features/news/service.ts workers/api/test/news.spec.ts
git commit -m "feat: 实现阅闻条件同步与正文快照"
```

### Task 4: 公开详情 API 与缓存

**Files:**
- Modify: `workers/api/src/features/news/routes.ts`
- Test: `workers/api/test/news.spec.ts`

**Interfaces:**
- Consumes: `NewsService.read(readerKey)`。
- Produces: `GET /api/news/read/:readerKey`。

- [ ] **Step 1: 写失败的路由测试**

验证 200、404、无 URL 代理参数、缓存头和返回 schema。

- [ ] **Step 2: 实现详情路由**

```ts
publicNewsRoutes.get('/read/:readerKey', async (c) => {
  const document = await new NewsService(c.env).read(c.req.param('readerKey'))
  if (!document)
    throw new ApiError('NOT_FOUND', 404, 'News document not found')
  c.header('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800')
  return success(c, document)
})
```

缓存版本使用 `updated_at`，列表版本加入 `MAX(news_documents.updated_at)`。

- [ ] **Step 3: 运行 Worker 测试**

Run: `pnpm --filter @fly-living/api-worker test -- news.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add workers/api/src/features/news/routes.ts workers/api/test/news.spec.ts
git commit -m "feat: 提供阅闻站内阅读公开接口"
```

### Task 5: Cron 分流

**Files:**
- Modify: `workers/api/src/index.ts`
- Modify: `workers/api/wrangler.jsonc`
- Create: `workers/api/test/scheduled.spec.ts`

**Interfaces:**
- Produces: `runScheduledTask(cron, env)` 可单测分流函数。

- [ ] **Step 1: 写失败的调度测试**

```ts
await runScheduledTask('*/30 * * * *', env)
expect(newsSync).toHaveBeenCalledOnce()
expect(momentBackup).not.toHaveBeenCalled()
```

每日 cron 同时断言备份执行。

- [ ] **Step 2: 实现分流并增加触发器**

`*/30 * * * *` 只同步新闻；`17 19 * * *` 执行备份和新闻同步。未知 cron 只记录并安全返回。

- [ ] **Step 3: 运行调度测试**

Run: `pnpm --filter @fly-living/api-worker test -- scheduled.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add workers/api/src/index.ts workers/api/wrangler.jsonc workers/api/test/scheduled.spec.ts
git commit -m "feat: 分流阅闻同步与瞬间备份定时任务"
```

### Task 6: 紧凑资讯工作台

**Files:**
- Modify: `app/pages/ai.news.vue`
- Create: `test/nuxt/ai-news-reader.spec.ts`

**Interfaces:**
- Consumes: `NewsItemDto.readerPath/contentMode`、现有 `/api/news`。

- [ ] **Step 1: 写失败的 Nuxt 契约测试**

断言页面存在搜索输入、四个筛选按钮、同步状态、内部 `NuxtLink` 分支、外部链接分支，不存在旧 `news-feature` 巨型主稿结构。

- [ ] **Step 2: 实现新布局**

桌面使用 `minmax(0, 1fr) minmax(17rem, 22rem)`，主区为行式资讯流，侧栏为日报。移动端单列。标题链接根据 `readerPath` 分流，摘要限制三行但阅读页不截断。

- [ ] **Step 3: 增加搜索与状态**

本地 computed 同时按 kind 与 title/summary 搜索；显示结果数、最后成功时间、30/60 分钟说明和降级来源。

- [ ] **Step 4: 运行 Nuxt 测试与样式检查**

Run: `pnpm vitest run test/nuxt/ai-news-reader.spec.ts`
Expected: PASS。

Run: `pnpm stylelint 'app/pages/ai.news.vue'`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add app/pages/ai.news.vue test/nuxt/ai-news-reader.spec.ts
git commit -m "feat: 重做 AI 阅闻紧凑资讯工作台"
```

### Task 7: 站内阅读页

**Files:**
- Create: `app/pages/ai.news/read/[id].vue`
- Modify: `test/nuxt/ai-news-reader.spec.ts`

**Interfaces:**
- Consumes: `GET /api/news/read/:readerKey`、`NewsDocumentDto`。

- [ ] **Step 1: 写失败的详情页测试**

断言返回链接、全文/摘要标记、来源署名、原始来源、纯文本渲染和错误状态。

- [ ] **Step 2: 实现详情页**

使用 `useRoute()` 和 `$fetch` 加载；`bodyText.split(/\n{2,}/u)` 生成段落，模板使用插值而非 `v-html`。设置本站 canonical、来源描述与 `noarchive` 可选 robots 元数据。

- [ ] **Step 3: 运行 Nuxt 测试**

Run: `pnpm vitest run test/nuxt/ai-news-reader.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
git add app/pages/ai.news/read/[id].vue test/nuxt/ai-news-reader.spec.ts
git commit -m "feat: 增加 AI 阅闻站内阅读页"
```

### Task 8: 浏览器回归与全量验证

**Files:**
- Modify: `e2e/cycle2.spec.ts`

**Interfaces:**
- Produces: 桌面/移动列表与详情回归证据。

- [ ] **Step 1: 扩展 E2E**

拦截 `/api/news` 和 `/api/news/read/*`，验证内部标题进入本站路由、外部条目保留 `_blank`、搜索筛选、详情段落与返回路径。

- [ ] **Step 2: 运行目标 E2E**

Run: `pnpm playwright test e2e/cycle2.spec.ts --project=chromium`
Expected: PASS。

- [ ] **Step 3: 运行全量验证**

Run: `pnpm verify`
Expected: 所有阶段退出码 0。

Run: `pnpm test:e2e`
Expected: 全部项目通过。

- [ ] **Step 4: 本地浏览器视觉检查**

启动预览，检查 1440×1000、390×844，浅色/深色、列表/详情，无横向溢出、控制台错误或外部重定向误用。

- [ ] **Step 5: 提交**

```bash
git add e2e/cycle2.spec.ts
git commit -m "test: 覆盖阅闻站内阅读浏览器路径"
```

### Task 9: 推送、部署与生产验收

**Files:**
- No source changes unless production verification finds a defect.

- [ ] **Step 1: 同步主线并复验**

Run: `git fetch origin && git rebase origin/main`
Expected: 无冲突；若有冲突只处理本功能文件。

Run: `pnpm verify && pnpm playwright test e2e/cycle2.spec.ts --project=chromium`
Expected: PASS。

- [ ] **Step 2: 推送功能分支并进入 main**

Run: `git push -u origin feature/ai-news-internal-reader`
Expected: 成功。

按仓库允许方式将已验证提交进入 `main`，不得强推。

- [ ] **Step 3: 部署 API Worker 与 Pages**

确认 GitHub Actions/Cloudflare 部署成功；若 Worker workflow 不由 main 自动触发，运行仓库既有 `pnpm --filter @fly-living/api-worker deploy`。

- [ ] **Step 4: 等待首次半小时同步**

确认 `/api/news` 出现 `readerPath`，打开至少一条 AI HOT 和一条在花站内阅读；确认其他原文仍外跳。

- [ ] **Step 5: 生产浏览器回归**

检查 `https://flyovo.cc.cd/ai.news` 与一条 `/ai.news/read/:readerKey`，验证桌面/移动、来源标记、无页面错误、无意外 4xx/5xx。

## Self-Review

- Spec coverage：数据、解析、同步、API、Cron、列表、详情、测试、部署均有任务。
- Placeholder scan：无 TBD、TODO、implement later 或未定义步骤。
- Type consistency：公开字段统一使用 `readerPath`、`contentMode`、`readerKey`、`NewsDocumentDto`。
- Scope：单一“AI 阅闻站内阅读与自动更新”功能，可在一个分支完成。
