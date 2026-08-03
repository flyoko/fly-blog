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
