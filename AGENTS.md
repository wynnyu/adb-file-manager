# AGENTS.md

## 标点

README、CHANGELOG、界面文案（`src/i18n/`、组件里拼出来的文字）和代码注释里都不要用下面这些符号：

- 破折号 `——`、`—` 和连接号 `–`：改用逗号、冒号、句号，或者拆成两句。英文里也一样，日期等场合用普通连字符 `-`
- 表示范围时不用 `–` 和 `～`：中文写“到”，例如“4.5 到 6.6”；英文和代码中用普通连字符 `-`
- 间隔号 `·`：做分隔符时改用 `|`；界面上把要并列的信息分行显示，或者去掉重复的那一项
- 直角引号 `「」`、`『』`：中文改用 `“”`；按钮、菜单项这类界面名称在 README 里可以用加粗

## 符号

所有文件（界面文案、README、CHANGELOG、docs、代码、注释、测试）都不使用 emoji、符号字符和 Nerd Font 图标字符，例如 `⚠`、`✓`、`→`、`⌘`、`⇧`、`≥`，以及 Unicode 私有区（U+E000 到 U+F8FF）中的图标字形。本文件中作为示例列出的字符除外。

- 界面上需要图形时使用 `lucide-react` 图标；快捷键参照 `ContextMenu.tsx` 的 `KEY_ICONS`，用图标显示按键
- 只能放纯文本的地方（`title`、`aria-label`、标签页标题、README、docs、注释、测试名称）用文字表达：按键写作 `Cmd`、`Ctrl`、`Shift`、`Alt`、`Backspace`，组合键写作 `Cmd+Shift+.`；方向键中文写“左方向键”，英文写 `Left Arrow`；箭头表示的流向改用“到”“转为”等文字；`≥` 写作“不低于”
- 需要醒目提示的状态改用颜色或图标表达，例如 root 模式下的红色标签页图标
- 常规中英文标点（包括省略号，中文写作 `……`，英文写作 `…`）和带变音符号的字母（如 `Frappé`）不受限制

## 文风

README 和 CHANGELOG 使用书面语，避免口语化表达：

- 中文使用“若”“仅”“无需”“安装完成后”等书面说法，不使用“的话”“只是”“不用”“装好后”等口语
- 英文以描述工具行为为主，少用 you / your，不使用 can't、don't、it's 等缩写
- 提示和禁止类语句直接陈述，例如“请勿……”、“Do not ...”
- 引用界面上的按钮、选项名称时，与 `src/i18n/` 中的文案保持一致

界面文案（`src/i18n/`、组件里拼出来的文字）应体现工具属性，简洁、中性、准确：

- 按钮和菜单项使用动词或动宾短语，例如“新建文件夹”、“拷贝路径”，不加语气词和多余修饰
- 提示和错误信息说明发生了什么以及如何处理，不寒暄、不拟人，不使用感叹号和 emoji
- 中文不使用“你”“您”称呼用户；英文尽量避免 you / your，不使用缩写
- 中英文含义一致，同一概念在全部文案中使用同一术语

## 技术栈与命令

pnpm + Node.js 20 以上。前端 React 19、Vite 8、TailwindCSS 4、TanStack Query 5、Motion、lucide-react、CodeMirror 6；后端 Express 5、multer、archiver；TypeScript 7 严格模式；Biome 2 负责格式化和 lint；Vitest 5 + Testing Library + jsdom 负责测试。整体结构见 `docs/architecture.md`，接口见 `docs/api.md`，界面设计见 `docs/design.md`。

- `pnpm dev`：Vite（5173）和 `tsx watch server/index.ts`（3001）同时启动，`/api` 由 Vite 代理
- `pnpm check` / `pnpm fix`：Biome 检查 / 自动修复（格式、lint、import 排序）
- `pnpm typecheck`：`tsc -b`
- `pnpm test`：Vitest，分 `server` 和 `web` 两个项目
- `pnpm build`：前端输出到 `dist/web/`，后端输出到 `dist/server/`

CI 依次运行 `pnpm check`、`pnpm test`、`pnpm build`。改完代码至少保证 `pnpm check`、`pnpm typecheck` 和测试通过。不要引入 ESLint、Prettier 或其他与现有工具重复的依赖。

## 编码规范

### 通用

- 格式以 Biome 为准：2 空格缩进、双引号、分号、尾随逗号、行宽 120。不要手动调整格式，运行 `pnpm fix`
- 全部使用 ES Module。相对导入写明扩展名（`./adb.ts`、`./App.tsx`），后端编译依赖 `rewriteRelativeImportExtensions`；不使用路径别名
- 前端的 `hooks/`、`lib/` 和 `components/` 各子目录（包括模块内部的同名目录）用 `index.ts` 作为桶文件，目录外一律从桶文件导入（`../lib/index.ts`），目录内部的模块之间仍直接导入。`i18n/` 的出口是已有的 `index.tsx`。桶文件只重导出被目录外使用的模块；`viewer/` 的 `CodeView`、`MarkdownView` 是懒加载分包，不得加入桶文件。`lib/` 与 `i18n/` 互相依赖，二者之间保持直接导入，避免循环依赖。后端模块平铺在 `server/`，不设桶文件
- 开启了 `verbatimModuleSyntax`：只用作类型的导入必须写 `import type` 或 `import { type X }`
- 不使用 `any`、`enum`。取值有限的字段用字面量联合类型，按取值映射用 `Record<联合类型, ...>` 常量；对象结构一般用 `interface`，联合类型用 `type`
- 用 `satisfies` 检查对象字面量的类型，例如 `res.json({ method } satisfies RootCheckResult)`
- 使用具名导出；仅 `App.tsx` 默认导出
- 命名：变量、函数 camelCase；组件、类型 PascalCase；模块级常量 UPPER_SNAKE_CASE（如 `PREVIEW_TYPES`）；hook 以 `use` 开头；回调 prop 以 `on` 开头
- 文件名：组件 PascalCase（`StatusBar.tsx`），hook 与 hook 同名（`useToast.ts`），其余 kebab-case 或单个小写词（`queries.ts`）
- 注释用中文，说明原因和约束，不复述代码；导出的函数、类型和不直观的字段写一行 `/** */`。注释同样遵守上面的“标点”规则

### 共享类型

- 前后端共用的接口数据结构只放在 `shared/types.d.ts`，只写类型。新增或修改接口的请求、响应结构时先改这里
- 后端从 `../shared/types.d.ts` 导入；前端统一从 `src/types.ts` 导入（该文件重新导出共享类型，并定义前端自用类型）

### 前端结构

前端分为外壳和模块两层：外壳（`App.tsx`、共用的 `hooks/`、`components/`、`lib/`）负责设备、root、语言、主题、提示、对话框、传输队列和模块导航；每个功能模块是 `src/modules/` 下的一个目录，文件管理是第一个模块（`modules/files/`），应用管理是第二个（`modules/apps/`，`index.ts` 只导出 `AppsPage`）。

- `App.tsx` 只负责组装：调用 `useShellState()`，把外壳状态和模块导航放进 `ShellContext`，渲染当前模块的 `Page` 和全局浮层。模块在 `modules/index.ts` 的 `MODULES` 中注册
- 模块目录内部仍按职责分为 `hooks/`、`components/`、`lib/`：状态和交互逻辑放 `hooks/`，界面放 `components/`，与 React 状态无关的工具函数放 `lib/`；模块专属的类型放模块自己的 `types.ts`，对外只通过模块的 `index.ts` 导出（`files` 只导出 `FilesPage`、`UsageTip`）
- 共用代码：`src/hooks/`（设备、root、提示、传输队列和 `useShell`）、`src/components/`、`src/lib/`。模块从 `useShell()` 读取设备、`target`、`flash`、`openDialog`、`startTransfer` 等外壳状态，不自己管理这些
- 依赖规则：模块可以导入 `src/hooks`、`src/components`、`src/lib`、`src/i18n` 和 `src/types.ts`；共用代码不导入 `modules/`；模块之间不互相导入。唯一的例外是 `components/overlays/Dialog.tsx` 的 `bookmark` 类型导入文件模块的 `BookmarkForm` 及 `BookmarkFields` 类型，等后续模块需要自定义表单时再泛化
- hook 中不写 JSX；hooks 与 components 之间只允许 `import type`，模块内部同样如此；`lib/` 不依赖 `hooks/` 和 `components/`
- 共用组件放 `components/` 下的 `shell/`（顶栏、模块导航、页面骨架）和 `overlays/`（对话框、右键菜单、提示、传输队列），通用按钮等放 `components/ui.tsx`；模块的组件按区域放入模块自己的 `components/` 子目录（文件模块有 `bookmarks/`、`toolbar/`、`views/`、`viewer/`、`overlays/`）
- 调整模块依赖或新增 hook、持久化项后，同步更新 `docs/architecture.md` 中的图和表

### React

- 只写函数组件。Props 直接在参数里解构，类型写在参数处，不直观的 prop 逐个加 `/** */`；需要继承原生属性时用 `interface Props extends ...`。不使用 `React.FC`
- 所有后端请求经 `src/lib/api.ts` 的 `api` 对象发出，组件和 hook 中不直接调用 `fetch`
- 目录列表等服务端数据通过 TanStack Query 缓存，查询定义（`queryOptions`、查询键）集中在各模块的 `lib/queries.ts`（文件模块为 `modules/files/lib/queries.ts`），`queryClient` 在 `src/lib/queries.ts`；全局默认不重试、切回窗口不刷新，增删改后由 `useDirectory` 的 `afterChange` / `reload` 让缓存失效
- 需要持久化的界面状态使用 `src/lib/prefs.ts` 的 `usePref` / `loadPref` / `savePref`，键名以 `afm.` 开头；不直接读写 `localStorage`
- `useEffect` 依赖数组保持完整（Biome 的 `useExhaustiveDependencies` 会提示）；hook 返回给外部的回调用 `useCallback` 保持稳定
- 列表 `key` 使用路径等稳定值，不用数组下标
- 按钮写明 `type="button"`；仅有图标的按钮必须有 `title` 和 `aria-label`（`IconButton` 已处理）；开关类按钮使用 `aria-pressed`
- 图标使用 `lucide-react`，尺寸用 `size-*` 类
- 动画使用 `motion/react`，弹簧参数复用 `ui.tsx` 中的 `spring` / `press`

### 界面文案

- 所有界面文字通过 `useT()` 返回的 `t("分组.键名", params)` 获取，组件中不写死中英文字符串；需要内嵌标记时用 `rich`
- 新文案先加到 `src/i18n/zh.ts`（类型来源），再在 `en.ts` 中补齐，类型检查会要求两边键一致
- 占位符写作 `{name}`；数量为 1 时需要单数形式的英文文案，另加 `键名_one`
- 后端返回给用户的错误信息通过 `server/i18n.ts` 的 `msg()` 获取，同样提供中英文
- 文案措辞遵守上面的“文风”规则

### TailwindCSS

- 使用 Tailwind 4，配置写在 `src/index.css` 的 `@theme static` 中，没有 `tailwind.config.*`
- 颜色只用主题中的 Catppuccin 变量：`text`、`subtext0`、`muted`、`base`、`mantle`、`crust`、`surface0` 到 `surface2`、`accent`、`on-accent`、`red`、`peach` 等，透明度用 `/15` 这样的写法。不使用 Tailwind 默认色板（`gray-500` 等）和十六进制任意值，主题色需随 `data-flavor`、`data-accent` 切换
- 新增设计变量加到 `@theme static`；颜色变量还需为每种 flavor 补齐取值
- 圆角、字号、阴影等设计值优先使用 Tailwind 自带的刻度（`rounded-3xl`、`text-xs`）。自带刻度中没有、且在多处使用的值，在 `@theme static` 中定义为变量后使用对应的类名，例如 `rounded-circle`、`rounded-card`、`rounded-panel`、`text-2xs`，不重复书写 `rounded-[1.75rem]` 这样的任意值。任意值仅用于一次性的、与具体布局相关的尺寸，例如 `h-[min(68vh,44rem)]`
- 不使用 `!important`（`!` 前缀）覆盖样式。按钮的不同外观通过 `ui.tsx` 中的 `tone` 实现，需要新外观时扩展 `tones`
- 条件类名用模板字符串拼接完整类名，不拼接类名片段（如 `` `bg-${color}` ``），否则 Tailwind 扫描不到
- 除主题和少量全局规则外不写自定义 CSS
- 调整颜色角色、圆角、按钮外观、弹簧参数或交互规则后，同步更新 `docs/design.md`

### Express

- `app.ts` 的 `createApp()` 只组装应用不监听端口，`index.ts` 负责启动；测试和其他入口复用 `createApp()`
- 同一类接口用返回 `Router` 的函数组织（`fileRoutes()`、`transferRoutes()`），在 `createApp()` 中挂载
- 每个异步处理函数都用 `request.ts` 的 `wrap` 包装，异常由它交给 `rootGuard` 和统一的错误处理中间件，不在路由里自行 `res.status(500)`
- 请求参数通过 `serialOf`、`ctxOf`、`pathsOf`、`adb.assertAbs` 取出和校验，不直接信任 `req.query` / `req.body`
- 出错时抛出 `AdbError(msg("..."), status, code?)`；错误响应格式固定为 `{ error, code? }`，`code` 仅在前端需要识别时提供（如 `root_lost`）
- 无返回数据的成功响应为 `{ ok: true }`，有数据时直接返回共享类型中定义的结构
- `adb.ts` 提供 adb 的底层调用（`run`、`shell`、`checked`、exec-out），各功能模块在自己的文件中拼命令；`fastboot.ts` 是 fastboot 命令的底层调用。除这两个文件外，其他模块不直接调用 `child_process`
- 新增或修改接口后同步更新 `docs/api.md`

### 安全

- 后端只监听 `127.0.0.1`，所有请求经过 `guard.ts` 的 `localOnly`，不要放宽 Host、Origin、Sec-Fetch-Site 校验
- 在电脑上调用 adb 一律用 `execFile` / `spawn` 并传参数数组，不经过本机 shell
- 拼接进设备端 shell 命令的路径和参数必须经过 `adb.ts` 的 `q()` 转义
- 删除、重命名、移动前调用 `assertSafeTargets`；复制、移动前调用 `assertNotInside`。新增破坏性操作时同样接入 `guard.ts` 的检查
- 上传、下载经过的临时文件在请求结束或出错后都要删除
- root 相关请求必须携带 `root` 参数，由后端按设备缓存的 root 方式执行，前端不自行拼接 `su`

### 测试

- 测试文件与被测模块放在同一目录，命名 `*.test.ts` / `*.test.tsx`；`describe` 用模块或函数名，`it` 用中文描述期望行为
- 前端测试使用 `src/test/utils.tsx` 中的工具：`providers` 包裹语言和查询缓存，`tz` 从中文词典取期望文案（不在测试里写死文案），`file` / `folder` 构造条目，`deferred` 控制异步完成时机，`newQueryClient` 为每个测试创建独立的 `QueryClient`
- 与后端的交互用 `vi.spyOn(api, "...")` 替换；需要验证 `root_lost` 等底层行为时替换 `fetch`
- 按角色和可访问名称查找元素（`getByRole("button", { name: tz("...") })`），不依赖类名和 DOM 结构
- 后端测试针对纯函数和输出解析（如 `guard.ts`、`adb.ts`、`fs-cmds.ts`），不依赖真实设备；多组输入用 `it.each`
- 修复缺陷时补充能复现该缺陷的测试

### Git

- 提交信息使用英文祈使句，首字母大写，不加类型前缀，结尾不加句号，例如 `Refresh directory listings after failed deletes and uploads`
- 每个提交只做一件事；面向用户的改动记入 `CHANGELOG.md`

## Context Sniper

本仓库已接入 `context-sniper` MCP 服务器。按“是否已经知道代码在哪”选工具：

- 已知文件、标识符或确切字符串：直接用自带的 `Grep` / `Glob` / `Read`。有针对性的 `Grep` 比 `search_code` 省。
- 不知道代码在哪，或在探索不熟悉的部分：先用 `search_code`，再用 `read_snippet` 扩展。一次回复不超过 6000 字符（约 1.5k token），模糊的查询也不会像宽松的 `Grep` 或整个 `Read` 文件那样淹没上下文。命中告诉你文件之后，换回 `Grep` / `Read`。

工具如下，`root` 一律传本仓库的绝对路径：

- `index_repo(root)`：`.context-index/` 不存在时运行；`git pull`、大改或修改 `.csignore` 之后再运行一次。如果片段的行号和文件对不上，说明索引过期，重建。
- `search_code(root, query, topK?, maxChars?)`：关键词检索（BM25），不是语义检索。用代码里可能出现的词来查，不要写整句；一个词能找到包含它的驼峰标识符，`where is the` 这类疑问词会被忽略。先用默认参数；查询范围宽时调高 `topK`，只有尾注列出的被省略命中你确实需要时才调高 `maxChars`。
- `read_snippet(root, path, startLine, endLine)`：有界读取，最多 300 行。搜索结果里每个省略标记都写明了精确调用参数，照抄即可，不要读整个文件。
- `run_test_filtered(root, command)`：`npm_test` / `pnpm_test` / `pytest`，只返回和失败相关的行。改完用它验证，不要直接跑原始测试命令。

索引不读 `.gitignore`，只跳过内置的噪声目录（`node_modules`、`dist`、锁文件、`.env` 等）和 `.csignore` 里列出的路径。`.csignore` 使用 gitignore 语法；不该进索引的本地文件写在这里。
