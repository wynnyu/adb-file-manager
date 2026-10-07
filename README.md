# 玩机工具箱 Modbench

[English](README.en.md) | 中文

基于浏览器的 Android 设备工具箱。目前提供文件管理，后续将扩展应用、prop、settings 和 fastboot 等模块。

所有操作均通过 adb（`adb push` / `adb pull` / `adb shell`）完成，不依赖 MTP。因此即使设备的 USB 模式设为“仅充电”也可正常使用，并可避免 MTP 连接中断、大文件传输停滞、隐藏目录不可见等问题。对于已 root 的设备，可开启 root 模式访问 `/data` 等系统目录。

## 快速开始

环境要求：

- Node.js 20 及以上，以及 [pnpm](https://pnpm.io/)
- adb（Android SDK Platform-Tools），需位于 `PATH` 中，或通过 `ADB_PATH` 指定路径

  安装方法见下文[安装 Node.js 和 adb](#安装-nodejs-和-adb)
- 设备已开启 USB 调试：在“设置”的“关于手机”中连续点击“版本号”7 次以启用开发者选项，然后在“开发者选项”中开启“USB 调试”

克隆仓库并运行以下命令：

```bash
git clone https://github.com/wynnyu/adb-file-manager.git
cd adb-file-manager
pnpm install
pnpm build
pnpm start
```

在浏览器中打开 <http://127.0.0.1:3001>，通过 USB 数据线连接设备，并在设备弹出的 USB 调试授权提示中点击 **允许**。

### 安装 Node.js 和 adb

**Node.js**

从 [nodejs.org](https://nodejs.org/) 下载 LTS 版本安装包，或通过包管理器安装：

```bash
# macOS（Homebrew）
brew install node
# Windows（winget）
winget install OpenJS.NodeJS.LTS
```

部分 Linux 发行版仓库中的 Node.js 版本低于 20，建议参照 [nodejs.org 下载页](https://nodejs.org/en/download) 使用 nvm 等版本管理器安装。安装完成后运行 `node -v`，确认版本不低于 20。

**adb（Android SDK Platform-Tools）**

仅需安装 Platform-Tools，无需安装 Android Studio 或完整的 Android SDK。可通过包管理器安装：

```bash
# macOS（Homebrew）
brew install --cask android-platform-tools
# Windows（winget）
winget install Google.PlatformTools
# Debian / Ubuntu
sudo apt install adb
# Arch Linux
sudo pacman -S android-tools
# Fedora
sudo dnf install android-tools
```

也可从 [Android 开发者网站](https://developer.android.com/tools/releases/platform-tools)下载官方压缩包（[Windows](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) / [macOS](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip) / [Linux](https://dl.google.com/android/repository/platform-tools-latest-linux.zip)），解压后将 `platform-tools` 目录加入 `PATH`，或通过 `ADB_PATH` 指向其中的 `adb`（Windows 下为 `adb.exe`）。

安装完成后运行 `adb version`，确认 adb 可正常调用。连接设备后运行 `adb devices`，若设备出现在列表中且状态为 `device`，则表示连接正常。在 Windows 上如无法识别设备，可能需要安装 USB 驱动：Pixel 设备使用 [Google USB 驱动](https://developer.android.com/studio/run/win-usb)，其他品牌请从厂商官网获取。

## 功能

**浏览**

- 提供图标、列表、分栏、画廊四种显示方式，交互参照访达设计。列表视图的列与访达一致（名称、修改日期、大小、种类），点击文件夹前的三角形可原地展开。分栏视图从根目录逐级展开：单击仅选中项目；选中文件夹时在右侧一栏列出其内容，按右方向键或双击进入；选中文件时显示详细信息，图片显示缩略图。画廊视图上方为大尺寸预览，下方为缩略图条，右侧为信息面板
- 面包屑导航，双击或点击末尾的**输入路径**按钮可直接输入路径；常用目录（内部存储、下载、相机、图片、视频、音乐、文档）可一键访问
- 支持筛选、按名称 / 大小 / 修改时间排序，以及显示或隐藏以点开头的文件
- 工具栏显示内部存储的已用容量和总容量

**查看**

- 双击文件、按 `Enter` 或在右键菜单中选择**打开**，即可在页面内的查看器中打开文件。左 / 右方向键切换到同一目录中的上一个 / 下一个文件，`Esc` 关闭
- 图片：初始缩放到适合窗口大小；按住 `Ctrl` 滚动滚轮或在触控板上捏合可缩放，放大后可拖动，双击在适合窗口和原始大小之间切换
- 视频和音频：使用自带的播放控制，打开 1 秒后自动播放，进度条可拖动，音量和静音设置在文件之间保持；视频可全屏播放。播放中按空格键播放或暂停，按 `F` 切换全屏。能否播放取决于浏览器支持的格式
- 其他文件以只读方式显示，按文件名语法高亮并显示行号，Cmd+F（其他系统 Ctrl+F）可在文件内查找；仅支持 UTF-8 编码，超过 1 MB 时仅显示前 1 MB
- 压缩包（`.zip`、`.apk`、`.apks`、`.xapk`、`.jar`、`.aar`、`.tar`、`.tar.gz`、`.tgz`、`.tar.bz2`、`.tbz2`、`.tbz`）显示为可展开的目录树，列出名称、大小和日期，不预览内部文件，条目超过 20000 个时仅显示前 20000 个。7z、rar、xz 不受支持，按其他文件处理
- 二进制文件和浏览器无法解码的格式（例如 HEIC 图片、MKV 视频）显示提示，并提供下载按钮

**传输**

- 通过按钮或将文件、文件夹拖入窗口上传，并保留目录结构
- 通过右键菜单、选择栏或查看器中的下载按钮下载：单个文件按原样下载；文件夹及多选内容打包为 zip 下载
- 传输队列显示每个任务的进度和结果

**整理**

- 右键菜单提供打开（文件夹进入，文件在查看器中打开）、解压（仅压缩包）、下载、压缩为 zip 或 tar.gz、剪切 / 拷贝 / 粘贴、拷贝路径、属性、重命名、删除；在空白处右键可新建文件夹、上传到当前目录或切换显示方式
- 右键菜单或选择栏中的**压缩为 zip**、**压缩为 tar.gz** 可把所选内容压缩为压缩包，生成在所选项所在的目录，单项以其名称命名，多项命名为 `Archive`；如遇重名自动编号，不会覆盖已有文件。tar.gz 在设备上直接生成，不经电脑中转；设备上没有 `zip` 命令，因此 zip 在电脑上生成，需先拉取到电脑临时目录再推回设备，临时空间需不少于所选内容大小的两倍。`adb pull` 会跳过符号链接，zip 中不含符号链接，完成后会提示跳过的数量；tar.gz 保留符号链接
- 在压缩包上右键选择**解压**，在设备上解压到压缩包所在目录，不经电脑中转：压缩包内只有一个顶层项目时直接解出该项目，否则新建以压缩包命名的文件夹；如遇重名自动编号，不会覆盖已有文件。解压使用设备自带的 `unzip`（Android 9 起提供）和 `tar`，解压前会拒绝含有绝对路径、`..` 或位于符号链接之下的条目的压缩包
- 拷贝时如遇重名将自动编号（`照片 2.jpg`、`照片 3.jpg` 等），不会覆盖已有文件；重命名和移动时如遇重名则报错
- 禁止将文件夹移动或拷贝到其自身内部

**属性**

- 在右键菜单中选择“属性”，或按 `Cmd I`（Mac）、`Alt Enter`（其他系统）打开。显示路径、大小、修改时间、变更时间、符号链接目标（可跳转到目标）、所在分区、inode、硬链接数和 SELinux 上下文，不显示访问时间
- 文件夹的总大小、文件数和子文件夹数在打开属性页半秒后自动统计，关闭属性页即取消；无权限读取的子项会提示统计不完整。多选时显示汇总
- 可修改权限（勾选或八进制）、所有者和用户组，通常需开启 root 模式。文件夹可选择应用到所有子项，应用前需再次确认。受保护路径和符号链接只读

**设备与界面**

- 支持在多台已连接设备之间切换，自动检测设备接入与断开，并显示设备的商品名称
- 界面支持中文和英文，默认跟随浏览器语言
- 主题采用 [Catppuccin](https://catppuccin.com) 配色，提供四种口味（Latte / Frappé / Macchiato / Mocha）和五种主色，默认跟随系统深浅色设置

### 快捷键

| 按键 | 操作 |
| --- | --- |
| `Enter` | 打开文件夹，或在查看器中打开文件 |
| `F2` | 重命名 |
| `Cmd I` / `Alt Enter` | 属性（Mac 用 `Cmd I`，其他系统用 `Alt Enter`） |
| `Delete` / `Cmd Backspace` | 删除 |
| `Backspace` / `Alt` + 上方向键 | 返回上一级 |
| `Cmd/Ctrl A` | 全选 |
| `Cmd/Ctrl C` / `X` / `V` | 拷贝 / 剪切 / 粘贴 |
| 上 / 下方向键 | 移动选择 |
| 左 / 右方向键 | 列表视图中收起或展开文件夹；分栏视图中进入或退出目录；画廊视图中切换上一项 / 下一项；查看器中切换上一个 / 下一个文件 |
| `Cmd/Ctrl Shift .` | 显示或隐藏点开头的文件 |
| `Space` | 查看器中播放或暂停视频、音频 |
| `F` | 查看器中切换视频全屏 |
| `Esc` | 取消选择；关闭查看器 |

## root 模式

通过顶栏中设备选择器左侧的盾牌按钮开启。该模式默认关闭，开启前会弹出确认对话框；勾选“记住选择，下次自动开启”后，下次将自动开启。

开启时首先检测设备的 root 方式：

- 若 adbd 本身以 root 身份运行（例如已执行 `adb root` 的工程机或模拟器），则直接使用
- 否则通过 `su -c` 提权，适用于 Magisk、KernelSU、APatch。首次开启时，设备上的 root 管理器会弹出授权提示，请授予 **Shell** root 权限

通过 su 提权时，`adb push` / `adb pull` 本身不具备 root 权限，因此上传和下载将经由 `/data/local/tmp` 下的临时目录中转，完成后自动清理。

为防止误操作：

- 标题旁显示 **ROOT** 标记，标签页标题带有 ROOT 标记，标签页图标变为红色
- 删除内部存储或 SD 卡中的内容时，与普通模式相同，仅需确认一次
- 删除其他位置（例如 `/data`、`/system`）的内容时，弹出 root 警告，列出完整路径并设有 3 秒倒计时；勾选“不再提示”后，此类删除也仅需确认一次
- 若操作过程中 root 权限被撤销，将自动退出 root 模式并提示原因

## 配置

通过环境变量配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `ADB_PATH` | `adb` | adb 可执行文件的路径 |
| `ADBFM_SU` | `su -c` | root 模式下的提权命令前缀。如设备上 su 的参数格式不同，可修改此项，例如 `ADBFM_SU="su 0 sh -c"` |

```bash
PORT=8080 ADB_PATH=~/Android/platform-tools/adb pnpm start
```

## 安全

本工具可读写设备上的任意文件，开启 root 模式后还可访问系统分区和应用数据，因此后端仅服务于本机：

- 仅监听 `127.0.0.1`，局域网中的其他设备无法访问
- 拒绝 `Host` 不是 localhost 的请求，防止 DNS rebinding
- 校验 `Origin` 和 `Sec-Fetch-Site`，拒绝其他网页发起的跨站请求，防止 CSRF
- 执行删除、重命名、移动和修改权限前解析符号链接，拒绝操作根目录、一级目录（`/system`、`/data`、`/sdcard` 等）和各存储卷的根目录
- 查看器仅以媒体形式读取常见的图片、视频和音频格式，其余文件仅读取前 1 MB，以只读方式显示并按文件名语法高亮，可通过查看器右下角的**自动换行**按钮切换是否换行；Markdown 文件默认以排版后的预览显示，可通过 **Markdown 预览**按钮切换回源码，其中的 HTML 经净化后显示，相对路径的图片从设备读取；SVG 在沙箱中渲染，其中的脚本不会执行

请勿通过反向代理等方式将其暴露至局域网或公网。

## 开发

```bash
pnpm install
pnpm dev      # 前端 http://127.0.0.1:5173，后端 3001 端口，均支持热更新
pnpm build    # 构建到 dist/
pnpm start    # 运行构建产物：http://127.0.0.1:3001
pnpm test     # 运行单元测试
```

整体架构、主要流程和模块依赖图见[架构说明](docs/architecture.md)，前后端接口见 [API 文档](docs/api.md)，界面的配色、组件、动效和交互规则见[设计说明](docs/design.md)。

技术栈：

- 后端：Node.js + Express 5，通过 `execFile` 调用 adb，拼接设备端命令时对路径做单引号转义
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + TanStack Query，字体（MiSans、Maple Mono）打包在本地，无需联网

目录结构：

```
server/
  adb.ts        adb 底层调用：run、shell、push / pull、设备列表、root 检测
  fs-cmds.ts    设备端文件命令：列目录、复制移动删除、压缩解压、读取文件
  devices.ts    设备接口：设备列表、重新授权、root 检测、存储空间
  app.ts        组装 HTTP 服务；构建后同时托管前端页面
  files.ts      文件操作接口：列目录、新建、重命名、删除、复制、移动、预览
  attrs.ts      属性接口：stat、文件夹递归统计、修改权限和所有者
  transfer.ts   上传和下载接口，经电脑临时目录中转
  guard.ts      安全校验：仅限本机访问，受保护路径
  request.ts    请求参数解析和 root 状态缓存
  index.ts      启动入口
  *.test.ts     单元测试（vitest）
  i18n.ts       后端错误信息的中英文文案
shared/
  types.d.ts    前后端共用的接口数据类型
src/
  App.tsx       外壳：组装设备、root、提示、对话框、传输队列和当前模块
  modules/      功能模块，index.ts 为模块注册表
    files/      文件管理模块，内部按 hooks、components、lib 划分
      hooks/        状态和交互逻辑：目录、选择、文件操作、快捷键等
      lib/          模块工具：目录查询缓存、书签、排序等
      components/   界面组件
        views/      图标、列表、分栏、画廊四种视图
        toolbar/    工具栏、路径、选择栏、状态栏
        bookmarks/  快捷入口和书签编辑
        viewer/     查看器
        overlays/   右键菜单项、属性页、拖放提示
  hooks/        共用的状态和交互逻辑：设备、root、提示、传输队列、外壳状态
  lib/          共用的前端工具模块：接口请求、格式化、偏好设置、主题切换等
  components/   共用的界面组件，ui.tsx 为基础组件
    shell/      顶栏、设备、语言、主题选择、模块导航、页面骨架
    overlays/   对话框、右键菜单、通知、传输队列
  i18n/         前端中英文文案（zh.ts 是类型来源，en.ts 须与之保持一致）
  test/         前端测试的环境配置和共用工具
  *.test.ts(x)  hooks 和组件的单元测试，与被测模块放在同一目录（vitest + jsdom）
  index.css     Catppuccin 配色和主题变量
docs/
  architecture.md  架构说明和模块依赖图
  api.md           前后端接口说明
  design.md        界面设计说明
```

构建产物：`dist/web/` 为前端，`dist/server/` 为编译后的后端。

## 许可证

代码以 [MIT](LICENSE) 协议发布。

打包进前端的字体有各自的许可：

- [MiSans](https://hyperos.mi.com/font/)：小米《MiSans 字体知识产权许可协议》
- [Maple Mono](https://github.com/subframe7536/maple-font)：SIL Open Font License 1.1
