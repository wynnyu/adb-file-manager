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

- [ ] `Device` 增加 `transport: "adb" | "fastboot"` 和规范化的 `mode`（system、recovery、sideload、bootloader、fastbootd、unauthorized、offline）
- [ ] 新增 `server/fastboot.ts`：`FASTBOOT_PATH` 环境变量，`execFile` 传参数数组；`fastboot devices -l` 合并进 `/api/devices`；fastboot 不存在时返回空列表并标记工具缺失，不影响 adb
- [ ] `useDevices`：当前设备暂时消失（重启、切模式）时保留选择一段时间，不立即切到其他设备
- [ ] 各模块声明所需模式，`online` 判断从 `state === "device"` 改为按模式判断；`NoDevice` 显示设备当前模式

关键文件：`shared/types.d.ts`、`server/adb.ts`、`server/devices.ts`（S2 后）、`src/hooks/useDevices.ts`、`src/hooks/useShell.ts`、`src/components/NoDevice.tsx`、`src/components/shell/DeviceSelect.tsx`

### S5 任务（job）与进度推送

- [ ] 后端通用任务管理：id、状态、进度、输出日志、取消（`AbortSignal` 传到 `execFile` / `spawn`）、完成结果；`/api/jobs/:id/events` 以 SSE 推送，不新增依赖
- [ ] 前端 `TransferQueue` 与 `useTransfers` 改为通用任务队列，`Transfer.kind` 扩展
- [ ] 用现有的 pull 和压缩验证：显示进度（先 `du` 取总量，再按临时目录增长估算）并支持取消

关键文件：`server/transfer.ts`、`server/zip.ts`、`src/hooks/useTransfers.ts`、`src/components/overlays/TransferQueue.tsx`、`shared/types.d.ts`

### S6 应用管理：列表与详情

- [ ] `pm list packages -f -U` 加 `-3` / `-s` / `-d` 区分用户、系统、已停用；`dumpsys package <包名>` 解析版本、安装时间、安装来源、权限
- [ ] 列表、搜索、筛选；详情面板；应用图标暂不做或经 APK 解析后续补充
- [ ] 包名格式校验函数，所有拼进 shell 的参数经 `q()`

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
- 单个文件下载不再经过电脑临时目录，`PullJob` 分为 `stream` 和 `zip` 两种；下载的接口形态不变
- `vitest.config.ts` 两个 project 都改用 `pool: "vmThreads"`：`pnpm test` 三次 Duration 为 10.85、10.96、10.86 秒，改后为 6.85、7.60、7.12 秒，全部 704 个测试通过，已保留

### S2

- `adb.ts` 只保留底层调用，文件相关的设备端命令都在 `fs-cmds.ts`（基于 `import * as adb`），设备列表、root 检测、存储空间的路由在 `devices.ts`（`storage()` 也在这里）
- 新模块可复用 `adb.ts` 的 `checked`、`OK_MARK`、`EXISTS_MARK`、`execOutStream`、`execOutBuffer`；`checked` 默认不限时，短命令传第三个参数。其他模块不直接调用 `child_process`
- 新模块用 `app.use("/api/<模块>", xxxRoutes())` 挂载，Router 内写相对路径；`app.test.ts` 的 `it.each` 表同步补上新接口
- `properties` 已改为 `attrs`（`attrs.ts`、`attrRoutes()`），S8 可以用 `props.ts` 和 `/api/props`
- 接口路径：设备相关在 `/api/devices/*`（含 `root-check`、`storage`），文件相关在 `/api/files/*`，旧路径不再保留

### S3

- 目录与依赖规则见 AGENTS.md 的“前端结构”：模块在 `src/modules/<名称>/`，内部分 `hooks/`、`components/`、`lib/`，对外只经模块的 `index.ts`；模块可以导入 `src/hooks`、`src/components`、`src/lib`，共用代码不导入 `modules/`，模块之间不互相导入。文件模块的 `index.ts` 只导出 `FilesPage` 和 `UsageTip`
- `ShellContext` 的值（`hooks/useShell.ts`）：`devices`、`adbError`、`serial`、`setSerial`、`online`、`storage`、`refreshStorage`、`rootMode`、`askEnableRoot`、`disableRoot`、`target`、`toast`、`flash`、`dialog`、`openDialog`、`closeDialog`、`transfers`、`startTransfer`、`patchTransfer`、`dismissTransfer`、`nav`。`useShellState()` 提供除 `nav` 以外的部分，`nav`（模块列表、当前模块、切换回调）由 `App` 根据 `MODULES` 补上，因为注册表导入了各模块页面，反过来由页面传会形成循环。`closeDialog` 可传入打开的那个对话框，只有它仍是当前对话框才关闭
- 注册新模块：在 `modules/index.ts` 的 `MODULES` 加一项（同时扩展 `ModuleId`、加 `nav.<id>` 文案），页面用 `ShellLayout` 作骨架并从 `useShell()` 取设备和传输队列；`Tip` 可选，设备在线时显示在传输队列里。只有一个模块时不显示 `ModuleNav`；`afm.module` 中存储的 id 无效时回退到第一个模块。切换模块时页面卸载，`useShortcuts` 的 window 监听随之移除，新模块如需全局监听照此在页面内注册
- `ShellLayout` 的 `overlays` 属性放页面自己的浮层，与页面共用整窗拖放区域；`TransferQueue`、`Toast`、`Dialog` 在 `App` 中、页面之后渲染，所以传输卡片和提示显示在页面的属性页、右键菜单之上
- `components/overlays/Dialog.tsx` 的 `bookmark` 类型仍导入文件模块的 `BookmarkForm` 和 `BookmarkFields`，是共用代码导入模块的唯一例外。后续模块需要自定义表单时，把对话框的 `kind` 泛化为可由模块提供内容的形式
- 保留的内部标识：`afm.` 偏好前缀、电脑临时目录 `adb-file-manager`、设备端 `adbfm-` 前缀、GitHub 仓库地址。改动它们会丢失已有偏好或留下残留，仓库改名由用户自行决定
- S4 改 `online` 的判断：在 `useShellState`（`hooks/useShell.ts`）中，目前是 `devices.find(...)?.state === "device"`；模块声明所需模式后，`online` 要改为按当前模块判断，`App` 渲染 `TransferQueue` 的 `Tip` 也用到它
- S5 的传输队列已在外壳中：`useTransfers` 的状态在 `useShellState` 里，模块用 `startTransfer`、`patchTransfer` 登记任务，`TransferQueue` 在 `App` 中渲染，不属于任何模块
