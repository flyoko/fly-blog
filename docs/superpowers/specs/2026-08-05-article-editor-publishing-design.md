# 文章编辑与公开发布链路设计

## 背景

当前文章链路存在五个相互关联的问题：

1. 后台实时预览使用 `micromark + v-html`，正式文章页使用 Nuxt Content/MDC，两套解析链导致格式、组件和样式不一致。
2. 公开详情、列表、相邻文章、Atom 与统计查询没有统一排除 `draft: true`，草稿可以被直接 URL 访问并进入其他公开输出。
3. 公开详情页把整篇正文强制包在一个 `.article-window` 中，无法在一篇文章里混排普通正文和多个 macOS 三点窗口。
4. 后台文章编辑器通过 `.admin-editor-shell { margin: -2rem; }` 模拟全宽，导致左上角边界与后台顶栏/侧栏不一致。
5. 文章标题区与正文之间没有可配置的广告位。

## 目标

- 后台预览与正式文章页使用同一套 MDC 语法、组件解析和 Markdown 插件。
- 一篇文章可包含零个、一个或多个 `::mac-window ... ::` 块，窗口外可继续使用普通 Markdown。
- 所有公开文章读取点统一排除草稿；直接访问草稿路径只得到不存在页面，静态产物也不包含草稿正文。
- 编辑器提供常用 Markdown 工具与“插入 macOS 窗口”，选中文本时包裹选区，未选中时插入模板。
- 后台编辑器不再依赖负 margin，桌面、平板和移动端边界稳定。
- 文章头部广告位可配置；默认关闭，关闭或配置不完整时不产生空白占位。

## 架构决策

### 1. 统一 MDC 渲染

正式文章继续使用 `ContentRenderer`；后台预览改用 `<MDC :value="markdown">`，删除 `renderAdminMarkdown` 和 `v-html`。`nuxt.config.ts` 中将 remark/rehype 插件映射提取为共享常量，同时提供给 `content.build.markdown` 与 `mdc`，保证 GFM、数学、音乐谱、自定义内容组件等语法一致。

### 2. 可插入窗口组件

新增 `app/components/content/MacWindow.global.vue`。Nuxt 自动注册 `app/components`，MDC 中使用：

```md
这里是普通正文。

::mac-window
这里是第一个窗口中的 Markdown。
::

窗口外继续写正文。

::mac-window
这里是第二个窗口。
::
```

`MacWindow` 只负责三色标题栏、窗口容器和默认 slot；正文语义仍由 MDC/Prose 组件负责。公开详情页不再对整篇正文添加窗口外壳。

### 3. 公开草稿保护

所有公开文章查询使用 Nuxt Content 官方布尔条件：

```ts
.where('draft', '=', false)
```

覆盖：

- `getArticleIndexOptions`
- 动态文章详情页
- `PostSurround`
- Atom feed
- 站点统计

`about`、`link` 等非文章页面不套用文章草稿约束。生成后必须检查公开 HTML、Atom 和统计 JSON 不包含草稿样例标题或正文。

### 4. 编辑器选区操作

在 `useAdminDraft.ts` 增加纯函数：

```ts
interface MarkdownEditResult {
  body: string
  selectionStart: number
  selectionEnd: number
}

function applyMarkdownEdit(
  body: string,
  start: number,
  end: number,
  edit: MarkdownEdit,
): MarkdownEditResult

function insertMacWindowBlock(
  body: string,
  start: number,
  end: number,
): MarkdownEditResult
```

工具栏读取 textarea 选区，调用纯函数更新正文，并在 `nextTick` 后恢复焦点和选区。功能包括二级/三级标题、粗体、斜体、链接、引用、行内代码、代码块、无序/有序列表、分隔线、macOS 窗口和媒体。

### 5. 后台布局

`app/layouts/admin.vue` 根据文章编辑路由给 `.admin-content` 添加 `admin-content-editor` 修饰类。该修饰类正式控制全宽与 padding；`.admin-editor-shell` 删除负 margin。断点只调整网格列与堆叠，不再通过不同负 margin 补偿。

### 6. 文章头部广告

在 `blogConfig.article.headerAd` 中定义：

```ts
{
  enabled: boolean
  label: string
  title: string
  description: string
  image: string
  href: string
}
```

新增 `PostHeaderAd.vue`，位置在 `PostExcerpt` 之后、正文之前。只有 `enabled === true` 且 `title`、`href` 有效时渲染；外链添加 `noopener sponsored`，图片与描述可选。

## 验收标准

1. 后台预览与正式页都能正确显示普通正文、表格、任务列表、图片和多个 `mac-window` 块。
2. 详情页不再存在包裹整篇正文的统一窗口。
3. `draft: true` 文章不出现在首页、归档、相邻文章、Atom、统计，且直接 URL 不显示正文。
4. 编辑器工具栏包裹选区时不丢文本，未选中时插入模板并选中占位内容。
5. 1440、1024、390 像素宽度下后台编辑器没有左上角错位或横向溢出。
6. 默认配置下文章广告容器不存在；启用完整配置后桌面与移动端均正常显示。
7. 定向单测、类型检查、Lint、静态生成与浏览器回归通过。

## 发布边界

本轮只修改和验证本地工作区。没有用户明确授权时，不执行 commit、push 或部署。
