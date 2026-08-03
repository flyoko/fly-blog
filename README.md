# fly living

记录技术、学习与生活的个人博客，基于 Nuxt 4 与 Nuxt Content 构建。

- 正式域名：<https://flyovo.cc.cd/>
- 备用域名：<https://fly-living.pages.dev/>
- 源码仓库：<https://github.com/flyoko/fly-blog>

## 本地开发

项目要求 Node.js 24 与 pnpm 11.8.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

提交变更前运行完整质量门禁：

```sh
pnpm verify
pnpm test:e2e
```

其中 `verify` 会执行 Lint、类型检查、Nuxt/Worker 测试、静态生成、生成链接检查和 Secret 扫描。

## 内容管理

正式文章存放在 `content/posts/`，友链状态说明存放在 `content/link.md`。

创建新文章可以运行：

```sh
pnpm new
```

## 管理后台

周期 1 提供同源 `/admin` 管理后台，由 GitHub App 登录保护，仅允许配置的 `flyoko` 账号和不可变 GitHub user ID。当前后台支持：

- 文章列表、Markdown 编辑、浏览器 IndexedDB 草稿、直接发布和 Pull Request 发布；
- R2 媒体上传、筛选、回收站、恢复和引用保护；
- 分类、导航、页脚和模块配置的受控 Pull Request；
- 发布记录、Checks、Pages 预览和受保护合并；
- D1 会话、审计、幂等和发布状态。

本地浏览器测试使用同源 API Mock，不会向真实 GitHub、D1 或 R2 写入数据。生产资源创建、Secret 配置、部署顺序和回滚步骤见 `docs/operations/admin-platform.md`，验收记录见 `docs/operations/cycle-1-acceptance-report.md`。

## Cloudflare Pages

推荐使用静态生成方式部署：

- 构建命令：`pnpm generate`
- 输出目录：`.output/public`
- Pages 项目：`fly-living`
- Pages 备用域名：`fly-living.pages.dev`
- 正式域名：`flyovo.cc.cd`

正式域名由 Cloudflare Worker `fly-living-edge` 转发到 Pages 生产站点。这样可以在不依赖 Git 提交和推送的情况下使用 Direct Upload 发布静态产物。

Cloudflare Web Analytics 通过构建环境变量启用：

```text
NUXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN=<Cloudflare Web Analytics Token>
```

未配置该变量时，构建仍可完成，但不会注入 Analytics beacon。

## Twikoo

前端评论服务地址已配置为：

```text
https://comment.flyovo.cc.cd/
```

评论后端运行在 Cloudflare Worker `fly-living-twikoo`，数据存储在同名 D1 数据库中，函数端版本与当前前端保持为 `1.7.13`。

当前未启用 R2，因此普通评论、点赞和计数可用，评论图片上传不使用 R2 存储。

## 主题归属

本站基于 [Clarity](https://github.com/L33Z22L11/blog-v3) 主题进行个性化修改，项目许可见 `LICENSE`。
