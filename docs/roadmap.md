# 路线图

目标：从 adb 文件管理器扩展为集 adb、root、fastboot 于一体的 Android 工具，新增应用管理、prop 管理、settings 管理和 fastboot 可视化刷入。

工作按会话（session）拆分，每个会话只做一节，做完即提交。新会话开始时先读本文件的“通用约定”和要做的那一节，按“关键文件”直接定位，不重新全量探索代码库。

## 通用约定

- 开始前：`git status` 确认工作区干净；只读本节列出的关键文件，其余按需 `Grep`
- 结束前：`pnpm check`、`pnpm typecheck`、`pnpm test` 全部通过；按 AGENTS.md 同步 `docs/architecture.md`、`docs/api.md`、`docs/design.md` 和 `CHANGELOG.md`；在本文件中勾选完成的会话，并在“备注”里记下后续会话需要知道的决定
- 重构类会话不改变行为，靠现有测试兜底；新增功能的会话补测试
- 一节内容较多时可以只完成其中一部分，把剩余项留在本节并注明

## 现状评估（2026-10-07）

- 质量：Biome、类型检查无问题，693 个测试通过；`localOnly`、`q()` 转义、`guard.ts` 的路径保护可直接沿用
- 结构问题：`App.tsx` 即文件管理器本身；`Header` 写死文件管理器的图标和名称；`useShortcuts` 在 window 上全局监听，切到其他模块后仍会作用于文件列表；设备和 root 状态通过 props 传递
- 后端问题：`adb.ts`（约 500 行）混合底层调用与文件命令；`checked` 和输出标记协议是私有函数；接口都挂在 `/api/` 根下，`properties` 已被文件属性占用，与 prop 管理易混淆
- 设备模型：`Device.state` 为 string，只来自 `adb devices -l`，看不到 fastboot 设备；当前设备消失时 `useDevices` 自动切到另一台，进 bootloader 时会丢失当前设备
- 长任务：所有操作都是一个请求等到结束，push、pull、复制、压缩没有进度也不能取消；`run()` 默认不限时

## 会话列表

### S0 发布 0.2.0

- [x] 把 CHANGELOG 的“未发布”整理为 0.2.0，改 `package.json` 版本号，打 tag。作为文件管理功能的稳定点，之后再开始重构

### S1 稳定性打磨（与 S2 到 S3 无依赖，可先做）

- [x] `adb.ts` 的 `run()` 增加默认超时，root 检测、`ls`、`stat`、`realpaths` 等短命令使用；push、pull、复制等长命令保持不限时。超时报错走 `msg()`
- [x] 服务启动时清理电脑临时目录 `os.tmpdir()/adb-file-manager` 下的旧 `job-*`；设备首次连接时清理 `/data/local/tmp/adbfm-*`
- [x] 单个文件下载改为 `exec-out cat` 流式返回（复用 `preview.ts` 的做法），不再先 pull 到电脑；文件夹和多选仍走 pull 加 zip
- [x] `vitest.config.ts` 尝试 `pool: "vmThreads"`，对比测试耗时

关键文件：`server/adb.ts`、`server/transfer.ts`、`server/preview.ts`、`server/tmp.ts`、`server/index.ts`、`src/lib/api.ts`

### S2 后端模块化与接口命名空间

- [x] 拆分 `adb.ts`：`adb.ts` 只保留底层（`run`、`shell`、`checked`、`q`、`Ctx`、`AdbError`、push、pull、设备列表、root 检测），导出 `checked` 和输出标记；文件相关命令移到 `fs-cmds.ts` 或并入 `files.ts`
- [x] `app.ts` 中的 `/api/devices*`、`/api/devices/root-check`、`/api/devices/storage` 移到 `devices.ts` 的 `deviceRoutes()`
- [x] 接口加命名空间：文件相关统一为 `/api/files/*`（ls、mkdir、rename、delete、copy、move、preview、text、stat、usage、chmod、chown、archive、extract、compress、upload、pull、fetch），设备相关为 `/api/devices/*`。个人使用，不保留旧路径
- [x] 同步 `src/lib/api.ts`、`docs/api.md`、相关测试；AGENTS.md 中“adb 命令封装在 adb.ts”改为“adb.ts 提供底层调用，各功能模块在自己的文件中拼命令”

关键文件：`server/adb.ts`、`server/app.ts`、`server/request.ts`、`server/*.ts` 的路由、`src/lib/api.ts`、`docs/api.md`、`AGENTS.md`

### S3 前端外壳与模块化

- [x] 新建外壳组件：顶栏（设备、root、语言、主题）加模块导航；当前模块用 `usePref("afm.module")` 记录，不引入路由库
- [x] 设备、root 状态（`useDevices`、`useStorage`、`useRootMode`、`target`）提升为 Context
- [x] 文件管理整体移为 `FilesPage`，`App.tsx` 只组装外壳
- [x] `useShortcuts` 只在文件模块激活时注册
- [x] 确定目录规则（`src/modules/files/`，各模块内再分 `hooks/`、`components/`、`lib/`），写入 AGENTS.md 的“前端结构”，同步 `docs/architecture.md`
- [x] `Header` 的应用图标和名称改为与模块无关；产品名定为 Modbench / 玩机工具箱，改了 `app.name`、`package.json`、README

关键文件：`src/App.tsx`、`src/modules/index.ts`、`src/hooks/useShell.ts`、`src/components/shell/`、`AGENTS.md`、`docs/architecture.md`

### S4 设备模型与 fastboot 检测

- [x] `Device` 增加 `transport: "adb" | "fastboot"` 和规范化的 `mode`（system、recovery、sideload、bootloader、fastbootd、unauthorized、offline）
- [x] 新增 `server/fastboot.ts`：`FASTBOOT_PATH` 环境变量，`execFile` 传参数数组；`fastboot devices -l` 合并进 `/api/devices`；fastboot 不存在时返回空列表并标记工具缺失，不影响 adb
- [x] `useDevices`：当前设备暂时消失（重启、切模式）时保留选择一段时间，不立即切到其他设备
- [x] 各模块声明所需模式，`online` 判断从 `state === "device"` 改为按模式判断；`NoDevice` 显示设备当前模式

关键文件：`shared/types.d.ts`、`server/adb.ts`、`server/devices.ts`（S2 后）、`src/hooks/useDevices.ts`、`src/hooks/useShell.ts`、`src/components/NoDevice.tsx`、`src/components/shell/DeviceSelect.tsx`

### S5 任务（job）与进度推送

- [x] 后端通用任务管理：id、状态、进度、输出日志、取消（`AbortSignal` 传到 `execFile` / `spawn`）、完成结果；`/api/jobs/:id/events` 以 SSE 推送，不新增依赖
- [x] 前端 `TaskQueue` 与 `useTasks` 改为通用任务队列（`Transfer` 统一改名为 `Task`，`TaskStatus` 增加 `preparing`、`canceled`，`Task.cancel` 控制取消按钮）
- [x] 用现有的 pull 和压缩验证：显示进度（先 `du` 取总量，再按临时目录增长估算）并支持取消

关键文件：`server/transfer.ts`、`server/zip.ts`、`src/hooks/useTasks.ts`、`src/components/overlays/TaskQueue.tsx`、`shared/types.d.ts`

### S6 应用管理：列表与详情

- [x] `pm list packages -f -U` 加 `-3` / `-s` / `-d` 区分用户、系统、已停用；`dumpsys package <包名>` 解析版本、安装时间、安装来源、权限
- [x] 列表、搜索、筛选；详情面板；应用图标暂不做或经 APK 解析后续补充
- [x] 包名格式校验函数，所有拼进 shell 的参数经 `q()`

### S7 应用管理：操作

- [ ] 安装 APK（含拖放、多个、`.apks` / `.xapk` 分包用 `install-multiple`），走 S5 的任务
- [ ] 卸载（系统应用用 `pm uninstall --user 0`，提供 `cmd package install-existing` 恢复）、停用和启用、强行停止、清除数据、提取 APK（复用下载）
- [ ] 防呆：SystemUI、设置、启动器、输入法等关键包停用或卸载前强确认

### S8 prop 管理

- [ ] `getprop` 列表、搜索、分组（ro、persist、sys 等）
- [ ] 修改：普通 `setprop`；root 下 `resetprop`（检测是否存在）修改 `ro.*`，并警告可能导致无法开机
- [ ] 键值表格组件写成通用组件，供 S9 复用

### S9 settings 管理

- [ ] `settings list global|secure|system`、搜索、修改、删除
- [ ] 防呆：`adb_enabled`、`development_settings_enabled` 等会断开连接或影响调试的键需确认

### S10 fastboot：信息与重启

- [ ] `getvar all` 解析：`unlocked`、`current-slot`、`is-userspace`、分区列表及大小
- [ ] 重启到 system、bootloader、fastbootd、recovery；adb 侧 `reboot bootloader` 等入口

### S11 fastboot：刷入

- [ ] 选择本机镜像文件与分区，`flash` 走 S5 的任务并解析输出显示进度；`--slot`、`set_active`
- [ ] 防呆：关键分区（bootloader、modem、persist 等）强确认；`erase` 与 `flashing lock` 需单独确认并说明后果；锁定状态下禁止刷入

## 备注

（各会话完成后在此记录影响后续会话的决定，例如最终的目录结构、产品名称、任务接口格式）

### S1

- `run()` 和 `runBuffer()` 的默认超时是 `QUICK_TIMEOUT`（30 秒），超时返回 `504` 和 `adbTimeout` 文案。新增的长命令（传输、递归操作、解压、打包、大目录统计）必须显式传 `timeout: 0`；`checked()` 默认不限时，短命令需要时传第三个参数。S2 拆分 `adb.ts` 时保留这一约定
- 设备端暂存目录命名为 `/data/local/tmp/adbfm-<BOOT>-<时间>-<随机>`，`BOOT` 是每个进程启动时生成的随机串。`stageCleanupCmd(BOOT)` 只删除其他进程留下的目录，因此任何时候执行都安全。`cleanStagesOnce` 按设备和 root 方式各执行一次：设备首次出现时以普通用户清理，su 检测成功后再以 su 清理（pull 的暂存目录归 root），避免每次启动都弹出 root 授权
- 解压、打包放在目标目录里的 `.adbfm-extract-*`、`.adbfm-pack-*` 暂存目录位置不固定，不在启动清理范围内
- 单个文件下载不再经过电脑临时目录，下载 token 对应的 `PullEntry`（S5 前叫 `PullJob`）分为 `stream` 和 `zip` 两种；下载的接口形态不变
- `vitest.config.ts` 两个 project 都改用 `pool: "vmThreads"`：`pnpm test` 三次 Duration 为 10.85、10.96、10.86 秒，改后为 6.85、7.60、7.12 秒，全部 704 个测试通过，已保留

### S2

- `adb.ts` 只保留底层调用，文件相关的设备端命令都在 `fs-cmds.ts`（基于 `import * as adb`），设备列表、root 检测、存储空间的路由在 `devices.ts`（`storage()` 也在这里）
- 新模块可复用 `adb.ts` 的 `checked`、`OK_MARK`、`EXISTS_MARK`、`execOutStream`、`execOutBuffer`；`checked` 默认不限时，短命令传第三个参数。其他模块不直接调用 `child_process`
- 新模块用 `app.use("/api/<模块>", xxxRoutes())` 挂载，Router 内写相对路径；`app.test.ts` 的 `it.each` 表同步补上新接口
- `properties` 已改为 `attrs`（`attrs.ts`、`attrRoutes()`），S8 可以用 `props.ts` 和 `/api/props`
- 接口路径：设备相关在 `/api/devices/*`（含 `root-check`、`storage`），文件相关在 `/api/files/*`，旧路径不再保留

### S3

- 目录与依赖规则见 AGENTS.md 的“前端结构”：模块在 `src/modules/<名称>/`，内部分 `hooks/`、`components/`、`lib/`，对外只经模块的 `index.ts`；模块可以导入 `src/hooks`、`src/components`、`src/lib`，共用代码不导入 `modules/`，模块之间不互相导入。文件模块的 `index.ts` 只导出 `FilesPage` 和 `UsageTip`
- `ShellContext` 的值（`hooks/useShell.ts`）：`devices`、`adbError`、`serial`、`setSerial`、`online`、`storage`、`refreshStorage`、`rootMode`、`askEnableRoot`、`disableRoot`、`target`、`toast`、`flash`、`dialog`、`openDialog`、`closeDialog`、`tasks`、`startTask`、`patchTask`、`dismissTask`、`nav`。`useShellState()` 提供除 `nav` 以外的部分，`nav`（模块列表、当前模块、切换回调）由 `App` 根据 `MODULES` 补上，因为注册表导入了各模块页面，反过来由页面传会形成循环。`closeDialog` 可传入打开的那个对话框，只有它仍是当前对话框才关闭
- 注册新模块：在 `modules/index.ts` 的 `MODULES` 加一项（同时扩展 `ModuleId`、加 `nav.<id>` 文案），页面用 `ShellLayout` 作骨架并从 `useShell()` 取设备和任务队列；`Tip` 可选，设备在线时显示在任务队列里。只有一个模块时不显示 `ModuleNav`；`afm.module` 中存储的 id 无效时回退到第一个模块。切换模块时页面卸载，`useShortcuts` 的 window 监听随之移除，新模块如需全局监听照此在页面内注册
- `ShellLayout` 的 `overlays` 属性放页面自己的浮层，与页面共用整窗拖放区域；`TaskQueue`、`Toast`、`Dialog` 在 `App` 中、页面之后渲染，所以任务卡片和提示显示在页面的属性页、右键菜单之上
- `components/overlays/Dialog.tsx` 的 `bookmark` 类型仍导入文件模块的 `BookmarkForm` 和 `BookmarkFields`，是共用代码导入模块的唯一例外。后续模块需要自定义表单时，把对话框的 `kind` 泛化为可由模块提供内容的形式
- 保留的内部标识：`afm.` 偏好前缀、电脑临时目录 `adb-file-manager`、设备端 `adbfm-` 前缀、GitHub 仓库地址。改动它们会丢失已有偏好或留下残留，仓库改名由用户自行决定
- S5 的任务队列已在外壳中：`useTasks` 的状态在 `useShellState` 里，模块用 `startTask`、`patchTask` 登记任务，`TaskQueue` 在 `App` 中渲染，不属于任何模块

### S4

- `adb devices` 的状态映射为 `DeviceMode`：`device` 为 system，`recovery`、`sideload`、`bootloader`、`unauthorized` 同名，其余（`offline`、`authorizing`、`connecting`、`no permissions`、`host` 等）一律为 offline。fastboot 设备按 `getvar is-userspace` 区分 fastbootd 和 bootloader
- `GET /api/devices` 总是返回 `200` 和 `DeviceList`（`devices`、可选的 `adbError`、`fastbootMissing`）：adb 失败时 fastboot 设备照常列出，fastboot 不存在时 adb 设备不受影响。前端只有请求本身失败（后端未启动）时才取异常消息作为 `adbError`
- fastboot 的 `getvar` 只在设备首次出现时查询一次（结果按 serial 缓存，设备从列表消失时清除）。S11 刷入期间不要额外轮询 `getvar`，也不要在设备列表轮询里加入新的 fastboot 命令，并发命令可能干扰刷入
- `Shell.adbReady`（adb 连接、system 模式、不在重新连接中）与按模块计算的 `Shell.online`（设备模式在当前模块的 `modes` 内）是两个概念：存储用量、root 模式、顶栏的 ROOT 标记和 root 开关用 `adbReady`；页面是否可用、`Tip` 是否显示用 `online`。`online` 和 `modes` 由 `App` 补充，`useShellState` 不返回
- 新模块在 `MODULES` 中声明 `modes`（可用的设备模式），当前设备处于其他模式时 `NoDevice` 显示“设备当前处于 {模式}”和所需模式。fastboot 模块（S10、S11）声明 `["bootloader", "fastbootd"]`，需要时可加入 system 以显示重启入口
- 当前设备消失后保留选择 `REBOOT_GRACE`（90 秒），期间 `Shell.device` 是它最近一次出现时的条目，`reconnecting` 为 `true`，`online` 和 `adbReady` 为 `false`。序列号在 adb 和 fastboot 下通常相同，进入 bootloader 后设备以 fastboot 条目重新出现并保持选中
- recovery 模式下的文件管理未开启：TWRP 等 recovery 可后续把 `recovery` 加入文件模块的 `modes`（需确认 adb shell 与 `/sdcard` 在 recovery 下可用）

### S5

- 任务接口在 `server/jobs.ts`：`startJob<R>(req, run)` 要在路由处理函数里调用，立即返回 `JobRef`（`{ id }`），`run(job)` 在后台执行，返回值成为 `result`。`JobHandle` 有 `signal`、`phase(name, { cancelable? })`、`progress(0 到 1)`、`log(line)`。S7 的装 APK、S11 的刷入照此接入，路由响应写 `res.json(ref satisfies JobRef)`
- `cancelable` 的用法：阶段默认可取消；不能安全中断的阶段（推送回设备、刷写分区）传 `cancelable: false`，卡片上的取消按钮随之消失，`POST /api/jobs/:id/cancel` 在这种阶段不生效。`signal` 触发后，无论 `run` 抛出什么都记为 `canceled`；需要清理的资源放在 `run` 的 `finally` 或 `catch` 里
- SSE 事件名：`state`（`JobSnapshot` 快照，阶段切换和结束时立即发，进度约 250 毫秒一次）和 `log`（JSON 字符串，一行一个）；连接时先回放当前快照和已有日志（最多 500 行），任务结束发最后一个 `state` 后关闭。每 15 秒一行 `: ping` 注释保活
- 任务结束后在内存中保留 60 秒，之后返回 `404`；前端 `api.watchJob` 在 `EventSource` 无法重连时按网络错误处理
- 阶段对应的任务卡片文案：`JobPhase` 的 `preparing`、`pulling`、`compressing`、`pushing` 分别对应 `task.preparing`、`task.pulling`、`task.compressing`、`task.pushing`（`TaskStatus` 里同名的状态）。新增阶段时同步扩展 `shared/types.d.ts` 的 `JobPhase`、`useFileOps.ts` 的 `PHASE_STATUS`、`TaskQueue.tsx` 的 `statusText` 和 i18n
- 错误信息的语言取自启动任务的请求（`AsyncLocalStorage` 随异步延续传递）；`rootGuard` 已导出，任务里的 root 请求失败同样会以 `root_lost` 报出，需要请求带 `root` 和 `serial` 参数
- 取消信号已传到 `adb.push` / `adb.pull`（第四个参数）、`adb.checked`（第四个参数）、`cmds.diskUsage`、`cmds.countSkipped` 和 `buildZip`；su 模式的暂存目录清理不带 `signal`，取消后也会执行
- 进度估算：`tmp.ts` 的 `watchGrowth(dir, total, onProgress)` 每 500 毫秒量一次临时目录大小，上限 0.99；总量来自 `cmds.diskUsage`（`du -sk`，按块计，略大于实际字节数）

### S6

- `assertPackage(v)` 在 `server/apps.ts`，校验失败抛 `AdbError(msg("badPackage"), 400)`，S7 的操作接口复用；拼进命令时仍要经 `adb.q()`
- `AppState` 为 `enabled`、`disabled`、`uninstalled`。已卸载指用户 0 已卸载的系统应用：它在 `pm list packages -f -u` 中，但不在不带 `-u` 的 `pm list packages` 中，APK 仍在系统分区，可用 `pm install-existing` 恢复。列表是 `-u` 的全集，所以 S7 卸载、恢复后要刷新列表
- 前端查询键为 `["apps", serial]` 和 `["app", serial, pkg]`（`modules/apps/lib/queries.ts`），S7 的操作完成后让这两个失效
- 详情面板（`modules/apps/components/AppDetail.tsx`）标题区下方有一个空的操作区 `div`（`empty:hidden`），S7 的按钮放在这里；面板已持有选中的 `AppEntry`，可据 `state`、`system` 决定显示哪些操作
- `AppDetail.updatedSystem` 表示 `Hidden system packages:` 中也有该包，即系统应用被更新过；S7 的“卸载更新”据此判断
- 应用接口只读，ctx 固定为 `{ serial, root: false }`，前端只传 `serial`；`pm` 和 `dumpsys` 默认作用于用户 0。S7 的写操作若要支持其他用户或 root，需要另行设计
- `firstInstall`、`lastUpdate` 是设备本地时间原文，不带时区，同 `ArchiveEntry.date`，前端原样显示
- 列表只显示包名；应用名称和图标需要解析 APK，留待后续
- `Placeholder` 已从文件视图移到 `components/ui.tsx`，新模块直接从那里导入
