# fly living 后台平台运维手册

本文档覆盖周期 1 的 GitHub 私有仓库、Nuxt 管理后台、Cloudflare Pages、API Worker、Edge Worker、D1 与 R2。文档只记录变量名、资源名和操作顺序，不保存任何账号令牌、私钥、数据库 ID 或密钥值。

## 一、目标拓扑

```text
flyovo.cc.cd
  └─ fly-living-edge
       ├─ /api/auth/*、/api/admin/*、/api/health → fly-living-api（Service Binding）
       ├─ /media/public/* → fly-living-api → 私有 R2
       └─ 其他请求 → fly-living.pages.dev

fly-living-api
  ├─ GitHub App / GitHub OAuth
  ├─ D1: fly-living-content
  └─ R2: fly-living-media（关闭 r2.dev，仅经同源媒体路由读取）
```

静态前端继续通过 Cloudflare Pages Direct Upload 发布。文章和配置存入 GitHub 私有仓库；后台会话、审计、发布记录和媒体索引存入独立 D1；媒体对象存入 R2。

## 二、首次上线前检查

1. 在 GitHub 的 Fork 页面和代码搜索中确认已经存在的公开 Fork/Clone。仓库改为私有不会撤回此前已经复制出去的内容。
2. 确认当前生产站点和 Pages 备用域名可访问，并保存最近一个可用 Pages deployment ID 与 Worker version ID。
3. 运行本地质量门禁：

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm test:e2e
```

4. 确认 `git diff --check` 无错误，`.output/public` 已通过链接检查与 Secret 扫描。

## 三、将仓库改为私有

在 GitHub 仓库设置中打开 **Settings → General → Danger Zone → Change repository visibility**，将 `flyoko/fly-blog` 改为 Private。

完成后检查：

- GitHub Actions 仍可读取仓库；
- Cloudflare Pages 仍由 Direct Upload 提供，不依赖公开仓库；
- `https://flyovo.cc.cd/` 与 `https://fly-living.pages.dev/` 仍返回正常页面；
- 仓库的 Actions secrets、Environments 和 branch protection 没有被移除。

## 四、注册 GitHub App

1. 在 GitHub Developer settings 创建 GitHub App。
2. Homepage URL 使用正式站点地址。
3. Callback URL 设置为：

```text
https://flyovo.cc.cd/api/auth/callback
```

4. Webhook 可在周期 1 关闭；当前发布流程使用 GitHub REST API 和 Actions 状态查询。
5. Repository permissions 仅授予所需权限：
   - Contents: Read and write
   - Pull requests: Read and write
   - Checks: Read
   - Actions: Read
   - Deployments: Read
   - Metadata: Read
6. 安装范围选择 **Only select repositories**，仅选择 `flyoko/fly-blog`。
7. 记录但不要写入仓库：App ID、Client ID、Client Secret、Installation ID 和生成的 PKCS#8 私钥。
8. 查询并记录允许登录账号 `flyoko` 的不可变 GitHub user ID，用于用户名与 ID 双重校验。

## 五、创建 Cloudflare 资源

在已经登录 Wrangler 的安全终端中执行。

### 1. D1

```bash
pnpm --filter @fly-living/api-worker exec wrangler d1 create fly-living-content --binding DB --update-config
```

确认命令已将真实 `database_id` 写入 `workers/api/wrangler.jsonc`，不要手工复制到聊天或工单。

### 2. R2

```bash
pnpm --filter @fly-living/api-worker exec wrangler r2 bucket create fly-living-media
pnpm --filter @fly-living/api-worker exec wrangler r2 bucket create fly-living-media-preview
```

当前 `cc.cd` 根域不在本 Cloudflare 账号的 Zone 中，因此生产环境采用等价的私有同源方案：关闭生产桶的 `r2.dev`，由 Edge Worker 把 `/media/public/*` 转发给 API Worker，再从 R2 读取对象。生产环境的 `MEDIA_ORIGIN` 使用 `https://flyovo.cc.cd/media`。以后取得对应 Zone/DNS 管理权后，可把该变量切换到独立媒体子域，无需迁移对象键。

### 3. Service Binding

`workers/edge/wrangler.jsonc` 中的 `API` Service Binding 指向 `fly-living-api`。首次部署必须先部署 API Worker，再部署 Edge Worker。

## 六、配置 Worker 变量与 Secret

非敏感公开配置可保存在 Wrangler vars；生产配置应为：

- `PUBLIC_ORIGIN=https://flyovo.cc.cd`
- `PAGES_ORIGIN=https://fly-living.pages.dev`
- `MEDIA_ORIGIN=https://flyovo.cc.cd/media`
- `GITHUB_OWNER=flyoko`
- `GITHUB_REPO=fly-blog`
- `GITHUB_DEFAULT_BRANCH=main`
- `GITHUB_ALLOWED_LOGIN=flyoko`

以下值必须通过交互式 Secret 命令写入，不得放入 Git、shell history、日志或构建产物：

```bash
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_APP_ID
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_CLIENT_ID
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_PRIVATE_KEY
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_INSTALLATION_ID
pnpm --filter @fly-living/api-worker exec wrangler secret put GITHUB_ALLOWED_USER_ID
pnpm --filter @fly-living/api-worker exec wrangler secret put SESSION_ENCRYPTION_KEY
```

`SESSION_ENCRYPTION_KEY` 解码后必须正好为 32 字节。生成过程应在本地密码管理器或安全终端完成。

## 七、应用迁移并部署

### 首次部署

```bash
pnpm --filter @fly-living/api-worker exec wrangler d1 migrations apply DB --remote
pnpm --filter @fly-living/api-worker exec wrangler deploy
pnpm --filter @fly-living/edge-worker exec wrangler deploy
pnpm generate
pnpm exec wrangler pages deploy .output/public --project-name=fly-living --branch=main
```

### 部署后的检查

```bash
curl --fail https://flyovo.cc.cd/api/health
curl --fail https://flyovo.cc.cd/admin/login
curl --fail https://flyovo.cc.cd/
curl --fail https://fly-living.pages.dev/
```

随后在浏览器中验证 GitHub 登录、概览、文章读取、媒体列表和退出登录。第一次生产写入应使用一篇明确标注的临时草稿，并在完成后删除。

## 八、GitHub Actions 配置

仓库 Secret：

- `CLOUDFLARE_API_TOKEN`
- 可选：`CLOUDFLARE_WEB_ANALYTICS_TOKEN`

仓库 Variable：

- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare API Token 仅授予目标账号中的 Workers Scripts、Workers KV/Bindings、D1、R2 与 Pages 部署所需权限。

创建 GitHub Environment：

- `production`：启用 required reviewers，限制到 `main`；
- `pages-preview`：用于 Pull Request 预览，可不要求人工批准。

工作流职责：

- `quality.yml`：所有分支的静态检查与测试；
- `pages-preview.yml`：同仓库 PR 的 Pages 预览及 GitHub Deployment URL；
- `pages-production.yml`：`main` 的 Pages Direct Upload；
- `workers-production.yml`：D1 migration → API Worker → Edge Worker → 同源健康检查。API Worker 不开放 `workers.dev`，只通过 Edge Service Binding 对外，因此健康检查固定走正式同源入口。

## 九、日常发布顺序

1. 在功能分支完成修改并运行 `pnpm verify` 与 `pnpm test:e2e`。
2. 推送分支并创建 Pull Request。
3. 等待 Quality 和 Pages Preview 成功。
4. 检查预览 URL、变更文件和后台 PR 审核页。
5. 合并到 `main`。
6. 在 `production` Environment 中批准 Worker/Pages 工作流。
7. 确认 API Worker 先于 Edge Worker 完成。
8. 执行生产健康检查与后台只读检查。

## 十、回滚

### Worker 版本回滚

在 Cloudflare Dashboard 的 Worker **Deployments/Versions** 中选择上一个已验证版本并回滚。顺序与部署相反：如 Edge 新版本导致路由故障，先回滚 Edge；如 API 逻辑故障，再回滚 API。回滚后检查 `/api/health`。

### Pages 回滚

在 Pages 项目 `fly-living` 的 Deployments 中找到上一个成功的 Production deployment，选择回滚/提升为生产。也可从对应 Git commit 重新生成并 Direct Upload。

### D1 恢复

优先使用 D1 Time Travel 或已记录的 bookmark 恢复到故障前时间点。恢复前暂停写入，记录当前 bookmark，确认恢复范围后再执行。Schema migration 不应直接向下修改生产库；应编写新的前向修复 migration。

### R2 恢复

普通删除先进入 R2 trash key 和 D1 `trashed` 状态，可从后台恢复。永久删除不可恢复，只有在确认无引用并输入 `DELETE` 后执行。必要时从离线备份重新上传并更新引用。

### Git 内容回滚

通过 GitHub UI 对错误 commit 执行 Revert，或在受保护分支的 Pull Request 中把目标 Git ref 恢复到已验证 commit。不要对共享生产分支强制推送。

### 会话吊销

发生账号、私钥或会话风险时：

1. 轮换 GitHub App Client Secret 和 Private Key；
2. 轮换 `SESSION_ENCRYPTION_KEY`，使所有现有会话失效；
3. 删除/重建 GitHub App installation token 权限；
4. 在 D1 将现有会话标记为 revoked；
5. 检查审计日志和 GitHub App access log。

## 十一、故障排查

- `/admin` 跳回登录：检查 Session Cookie、允许账号 ID、Callback URL 与系统时钟。
- CSRF 错误：检查 `fly_admin_csrf` Cookie 与 `x-csrf-token` 请求头是否同源一致。
- GitHub 401/403：检查 App installation、仓库权限、Private Key 和 Installation ID。
- D1 错误：检查 migration 状态、binding 名 `DB` 和远程数据库 ID。
- R2 错误：检查 bucket binding `MEDIA`、对象签名、大小限制、对象键是否位于 `public/`，以及 Edge 是否把 `/media/*` 转发到 API Worker；生产桶的 `r2.dev` 应保持关闭。
- PR 无法合并：检查 Head SHA、GitHub checks、Pages Deployment 和预览状态；不得绕过服务端校验。
- 正式域名 502：先检查 API Worker 是否存在，再检查 Edge Service Binding 和 Pages origin。

## 十二、PR 预览识别约束

GitHub Deployment 的 `sha` 是 PR Head Commit，但 REST API 的 `ref` 过滤参数按分支引用匹配。后台审核页读取检查时使用 Head SHA，读取 Pages Preview Deployment 时必须使用 PR Head Branch；否则检查可成功但预览会被误判为缺失，合并保护会保持阻断。

生产验收应同时确认：

- Head SHA 与 D1 发布记录一致；
- PR 只包含记录中的白名单文件；
- Check Runs 全部成功；
- Deployment 通过 PR Head Branch 查询到，状态为 success 且包含非生产预览 URL；
- 满足全部条件后 `canMerge` 才为 true。

## 十三、周期 2：自述、瞬间与 AI 阅闻

### D1 迁移

周期 2 新增：

- `0003_moments.sql`：`moments`、`moment_media`、`moment_likes`、`moment_backup_state`、`sync_runs`；
- `0004_news.sql`：`news_items`、`news_briefings`、`news_sync_state`；
- `0007_news_reader.sql`：阅闻站内阅读正文、阅读键以及条件同步状态。

生产部署前执行：

```bash
pnpm --filter @fly-living/api-worker exec wrangler d1 migrations apply DB --remote
```

迁移只新增表和索引，不修改 Twikoo 数据库，也不删除周期 1 表。

### 匿名点赞

- Cookie：`fly_moment_visitor`，`HttpOnly`、`Secure`、`SameSite=Lax`、一年有效期；
- Worker 只保存 `HMAC-SHA256(cookie, VISITOR_HMAC_KEY)`；
- D1 唯一键 `(moment_id, visitor_hash)` 防止重复点赞；
- 不保存明文 IP、Cookie 或浏览器指纹；
- `VISITOR_HMAC_KEY` 必须通过 Cloudflare Worker Secret 配置，不能写入仓库。

### 公开缓存

`/api/moments*`、`/api/news` 与 `/api/news/read/:readerKey` 使用 Workers Cache API。缓存键包含：

- 原始筛选参数；
- 瞬间/点赞或阅闻/来源状态的数据版本；
- 带访客 Cookie 或 Authorization 的请求自动绕过共享缓存。

因此写入后数据版本变化会自然切换缓存键，无需枚举清理所有筛选组合。响应头 `X-Fly-Cache` 可用于确认 `MISS`、`HIT` 或 `BYPASS`。

### 瞬间备份与恢复

瞬间备份 Cron：`17 19 * * *`（UTC，即北京时间次日 03:17）。半小时阅闻任务不会执行瞬间备份。每日备份任务会：

1. 导出确定性 JSON；
2. 计算不包含 `exportedAt` 的数据校验和；
3. 无变化时不创建 Commit；
4. 有变化时写入 `backups/moments/YYYY/MM/YYYY-MM-DD.json`；
5. 更新 `moment_backup_state` 与 `sync_runs`。

`backups/**` 被 Pages/Quality 的 push 工作流忽略，备份 Commit 不触发站点重建。

恢复必须先调用预检，验证路径、schemaVersion、SHA-256 校验和以及所有 R2 媒体引用。后台要求输入 `RESTORE`，恢复在 D1 batch 事务中替换瞬间和媒体关系；点赞不从快照恢复。

### AI 阅闻

来源由 `config/news/sources.json` 控制：

- Worker 每 5 分钟检查一次是否有来源到期；
- AI HOT 精选条目 JSON：最短每 30 分钟拉取；
- AI HOT 全文 Feed：最短每 30 分钟拉取，只保存 Feed 明确提供的 `content:encoded`，其余条目保存摘要；
- AI HOT 每日报告 JSON：最短每 30 分钟拉取；
- 在花 RSS：最短每 60 分钟拉取，新增或变化条目尝试提取文章正文，失败时回退 RSS 摘要。

Cloudflare Cron `*/5 * * * *` 每 5 分钟检查到期来源，各来源仍根据 `next_sync_at` 执行自己的最短周期。请求保存并发送 ETag/Last-Modified，304 不重新解析或写入正文。后台手动同步会强制检查所有来源。

只有 `aihot.virxact.com` 和 `www.zaihua.news` 的条目生成 `/ai.news/read/:readerKey` 站内阅读地址。正文以清洗后的纯文本保存，不执行上游 HTML、脚本或 iframe；阅读页始终显示来源署名和原始链接。单个来源失败时更新状态但保留最近成功的 D1 快照。

### 生产回滚

- API/Edge：回滚到上一个 Cloudflare Worker Version；
- Pages：回滚到上一个成功部署；
- 瞬间：从最近 Git 快照执行预检和恢复；
- 阅闻：停止 Cron 或将来源 `enabled` 设为 false，保留 D1 最后快照；
- 数据迁移：新增表不需要破坏性回滚，禁用相关模块即可。

## 十四、周期 3：天气、随心听与模块管理

### 天气数据与隐私

- 公开天气仅使用 `config/site/weather.json` 中由站长选择的固定城市；前台不调用浏览器定位，也不保存访客坐标。
- 城市搜索通过登录后的 `/api/admin/weather/search` 请求 Open-Meteo Geocoding API。
- 公开 `/api/weather` 由 Edge Worker 精确转发到 API Worker，不允许被 Pages 的 `/api/stats` 路由规则覆盖。
- 正常结果在 `weather_snapshots` 保存 30 分钟；上游失败时最多使用 24 小时内最后成功数据，并标记 `stale=true`。
- 超过 24 小时没有可用快照时返回明确的 `temporarily_unavailable`，不得伪造温度。
- 天气响应和卡片保留 Open-Meteo 来源署名。

周期 3 新增 D1 migration：

```text
workers/api/migrations/0006_weather.sql
```

该迁移只新增 `weather_snapshots` 表与索引。Worker Production 必须在部署 API/Edge Worker 前应用远程迁移。

### 天气配置发布

天气城市、经纬度、时区和启用状态属于高影响配置，后台只能生成 `config/site/weather.json` 的受控 PR。预览、检查和合并保护与其他站点配置相同。天气配置变化会触发 Workers Production，因为 Worker 在构建时读取固定城市配置。

初始安全状态为 `enabled=false`；在正式启用前先通过后台城市搜索选择结果，再检查 PR Preview 中的显示名称、时区和移动端布局。

### 随心听歌单

- 歌单源文件：`content/playlists/default.json`；
- 音频和封面：优先通过媒体库写入 R2，并使用正式同源媒体 URL；
- 只允许公开 `http/https` URL，拒绝环回、私网、链路本地和受保护临时流地址；
- 后台保存使用当前文件 SHA 做冲突检测，并创建只包含歌单文件的直接 Commit；
- 全局播放器不强制自动播放，路由切换时保持队列和状态；
- 当前歌曲、进度、音量、播放模式和展开状态只存浏览器本地；
- 单曲失败时最多遍历歌单一次，全部失败后停止，不无限重试。

上线前确认音频由站长拥有、获授权或可合法公开播放。系统不提供第三方流媒体抓取能力。

### 模块管理

`/admin/modules` 管理 `config/site/modules.json` 的启停和顺序。保存前顺序被归一化为连续唯一值，并通过受控 PR 发布。天气和音乐默认关闭，因此部署周期 3 代码不会自动向公开页面展示空天气卡或空播放器。

### 周期 3 回滚

- 天气异常：先在模块配置中关闭天气，或回滚天气配置 PR；D1 快照可保留，不影响其他内容。
- Open-Meteo 故障：保持最近成功快照，超过 24 小时自动显示不可用状态；不需要删除数据。
- 播放器异常：关闭 `music` 模块即可立即从下一次 Pages 构建中隐藏播放器，歌单和 R2 文件保持不变。
- 歌单内容错误：Revert 对应直接 Commit；不要强推 `main`。
- Edge 路由异常：回滚 Edge Worker 到上一个已验证版本，并检查 `/api/weather` 与 `/api/health`。
- D1 migration 为前向新增，不执行破坏性 down migration。

## 十五、周期 4：视觉、动效、响应式、可访问性与性能

### 全局交互规范

- 公开博客与后台共享 `app/assets/css/polish.scss` 中的动效、焦点、触控与高对比令牌。
- 页面切换使用 200ms 淡入与小幅垂直位移；交互卡片只在支持 hover 的精细指针设备上轻微上浮。
- `prefers-reduced-motion: reduce` 会关闭页面位移、顺序显现、唱片旋转、加载脉冲和非必要平滑滚动，功能与状态反馈保持可用。
- `forced-colors` 下保留系统高亮焦点和边框。

### 键盘与覆盖层

- 公开站和后台均提供跳至主内容入口。
- 站内搜索使用语义化 button 和 dialog；打开侧栏/搜索时锁定背景滚动，关闭后恢复触发控件焦点。
- 可见按钮必须拥有文本或 `aria-label`；图片必须有 `alt`；每个核心页面只保留一个 `main` 地标。
- 后台瞬间编辑器已从嵌套 `main` 调整为 `section`。

### 移动端

- 侧栏和右侧栏使用 `100dvh`、安全区 padding 与 `min(320px, 100vw)`，避免窄屏溢出。
- 播放器避让底部控制区和 `safe-area-inset-bottom`，展开态限制最大高度并允许内部滚动。
- 主要按钮与播放器控件按约 44px 触控目标设计。

### 性能边界

周期 4 构建证据：

- 最大 JS chunk：707,370 B；主要包含 Nuxt/Vue、Zod、内容渲染与动态路由映射，不是周期 4 单独新增页面代码。
- SQLite 主线程相关 chunk：199,765 B；Worker：196,867 B。
- 入口 CSS：57,998 B。
- 全局播放器 CSS 独立 chunk：3,751 B。
- 首页 HTML 不包含 `/api/weather`、`.music-player` 或天气/音乐运行时标记。
- 天气和播放器组件通过 `Lazy*` 组件加载，并各执行一次可缓存的同源配置探针；禁用状态由公开 API 直接返回 `disabled`，不会调用 Open-Meteo 上游、不会创建 Audio 实例，也不会渲染天气卡或播放器。

最大框架 chunk 与 Nuxt Content、Shiki/Zod 和应用路由动态映射绑定。周期 4 不采用高风险的手工 vendor 拆分，以避免破坏 Content SQLite、搜索与静态预渲染；后续升级 Nuxt Content 时重新测量。

### 非阻断构建警告

以下为已记录的第三方或历史警告，不影响本轮验收：

- 自定义图标文件名规范化提示；
- `@dxup/nuxt`、`unplugin-yaml` 等插件 sourcemap 提示；
- `nuxt-schema-org` 的第三方导出提示；
- Rollup 对 VueUse PURE 注释位置的提示；
- 大于 500 kB 的框架/内容运行时 chunk 提示；
- `config/site/footer.json` 保持历史无行尾换行的 Lint warning。
