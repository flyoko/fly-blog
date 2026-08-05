# 文章发布诊断与性能优化设计

## 背景

文章发布当前存在三类问题：

1. 单文件文章提交仍通过 Git Data API 逐步创建 blob、tree、commit 并更新 ref，一次发布需要多次串行 GitHub 请求。
2. `admin/article/*` Pull Request 同时触发 Quality 与 Pages Preview，两个工作流重复安装依赖并执行完整校验；内容变更还会被无关代码测试和全仓历史内容错误拖慢。
3. 后台只得到 `Repository checks failed`，无法显示 GitHub annotation 中的文件、行列和规则，也无法从审核页回到编辑器定位。

## 目标

- 单文件文章直接发布和 PR 发布使用 GitHub Contents API 快速提交，同时保留分支头与文件 SHA 冲突保护。
- 发布前在共享纯函数中完成轻量 Markdown 校验，常见强调标记错误在发起 GitHub 请求前返回。
- `admin/article/*` PR 只校验唯一变更的文章文件，并只构建公开站点预览；代码与配置 PR 继续执行完整校验，main 正式发布继续执行 `pnpm verify`。
- 从 GitHub check-run annotations 回传检查名称、路径、行列、正文行、规则、消息和详情链接。
- 审核页显示结构化错误并提供“编辑并定位”；编辑器能聚焦对应正文位置。
- 待处理发布记录前 60 秒每 5 秒刷新，之后回退到 15 秒，减少状态显示延迟和无意义请求。

## 架构

### 单文件快速提交

在 `ArticleRepositoryPort` 增加 `createFileCommit`。实现先读取并校验当前分支头，再调用 `PUT /contents/{path}`，对已有文件携带 blob SHA，对新文件省略 SHA。文章直接发布和文章 PR 使用该方法；需要多文件原子性的其他业务继续使用 `createAtomicCommit`。

### 轻量正文校验

新增 `shared/admin/article-validation.ts`，输出带正文行列、规则和修改建议的诊断。首期覆盖本次真实失败的 `markdown/no-space-in-emphasis`，并同时在 Worker 与浏览器复用。Worker 校验是权威边界，浏览器用于即时反馈。

### GitHub 检查诊断

扩展 `CheckSummaryDto`。`GitHubRepository.getChecks(ref, resourcePath?)` 只在存在失败 check 时读取文章源文件并获取 annotations，最多回传 50 条；仅当 annotation 位于正文而非 frontmatter 时映射正文行号。没有文件 annotation 时仍保留通用失败状态。

### CI 快慢路径

`pages-preview.yml` 根据 `github.head_ref` 区分文章 PR：

- `admin/article/*`：断言 PR 恰好只改一个 `content/posts/**/*.md`，只对该文件运行 ESLint；设置 `NUXT_ARTICLE_PREVIEW=1`，从 Nuxt 页面树移除 `/admin/**`，然后执行公开站点 generate、smoke、links、secrets 与预览部署。
- 其他 PR：继续运行 `pnpm verify`。

`quality.yml` 对 `admin/article/*` PR 跳过重复完整校验；push 与其他 PR 不变。

## 验收标准

1. 文章单文件提交只需要分支头校验和一次 Contents API 写入，不走 blob/tree/commit/ref 四段写入。
2. `***标题 ***` 在点击发布后立即显示正文行列与修复建议，不创建 GitHub 分支或提交。
3. GitHub annotation 能在发布审核页显示文件、行列、规则与详情链接；属于当前文章时可进入编辑器定位。
4. 文章 PR 仅允许一个文章 Markdown 文件变化，否则快速失败。
5. 文章 PR 不再重复运行 Quality 全套检查；正式 main 发布仍执行完整 `pnpm verify`。
6. 发布状态在前一分钟最多延迟 5 秒显示。
7. Worker 定向测试、Nuxt 单测、类型检查、Lint、生产与文章预览两种静态构建检查通过。
8. 同机干净构建基准中，文章预览模式不生成后台 HTML，整体构建耗时相对生产模式明显下降。

## 发布边界

只修改和验证本地工作区，不执行 commit、push、PR 合并或部署。
