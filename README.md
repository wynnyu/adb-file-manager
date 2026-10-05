# ADB File Manager

[English](README.en.md) | 中文

基于浏览器的 Android 设备文件管理工具。

所有操作均通过 adb（`adb push` / `adb pull` / `adb shell`）完成，不依赖 MTP。因此即使设备的 USB 模式设为“仅充电”也可正常使用，并可避免 MTP 连接中断、大文件传输停滞、隐藏目录不可见等问题。对于已 root 的设备，可开启 root 模式访问 `/data` 等系统目录。

## 快速开始

环境要求：

- Node.js 20 及以上
- adb（Android SDK Platform-Tools），需位于 `PATH` 中，或通过 `ADB_PATH` 指定路径

  安装方法见下文[安装 Node.js 和 adb](#安装-nodejs-和-adb)
- 设备已开启 USB 调试：在“设置”的“关于手机”中连续点击“版本号”7 次以启用开发者选项，然后在“开发者选项”中开启“USB 调试”

运行以下命令：

```bash
npx adb-file-manager
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
- 面包屑导航，双击可直接输入路径；常用目录（内部存储、下载、相机、图片、视频、音乐、文档）可一键访问
- 支持筛选、按名称 / 大小 / 修改时间排序，以及显示或隐藏以点开头的文件
- 工具栏显示内部存储的已用容量和总容量

**传输**

- 通过按钮或将文件、文件夹拖入窗口上传，并保留目录结构
- 单个文件按原样下载；文件夹及多选内容打包为 zip 下载
- 传输队列显示每个任务的进度和结果

**整理**

- 右键菜单提供打开、下载、剪切 / 拷贝 / 粘贴、拷贝路径、重命名、删除；在空白处右键可新建文件夹、上传到当前目录或切换显示方式
- 拷贝时如遇重名将自动编号（`照片 2.jpg`、`照片 3.jpg` 等），不会覆盖已有文件；重命名和移动时如遇重名则报错
- 禁止将文件夹移动或拷贝到其自身内部

**设备与界面**

- 支持在多台已连接设备之间切换，自动检测设备接入与断开，并显示设备的商品名称
- 界面支持中文和英文，默认跟随浏览器语言
- 主题采用 [Catppuccin](https://catppuccin.com) 配色，提供四种口味（Latte / Frappé / Macchiato / Mocha）和五种主色，默认跟随系统深浅色设置

### 快捷键

| 按键 | 操作 |
| --- | --- |
| `Enter` | 打开 |
| `F2` | 重命名 |
| `Delete` / `Cmd Backspace` | 删除 |
| `Backspace` / `Alt` + 上方向键 | 返回上一级 |
| `Cmd/Ctrl A` | 全选 |
| `Cmd/Ctrl C` / `X` / `V` | 拷贝 / 剪切 / 粘贴 |
| 上 / 下方向键 | 移动选择 |
| 左 / 右方向键 | 列表视图中收起或展开文件夹；分栏视图中进入或退出目录；画廊视图中切换上一项 / 下一项 |
| `Cmd/Ctrl Shift .` | 显示或隐藏点开头的文件 |
| `Esc` | 取消选择 |

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
PORT=8080 ADB_PATH=~/Android/platform-tools/adb npx adb-file-manager
```

## 安全

本工具可读写设备上的任意文件，开启 root 模式后还可访问系统分区和应用数据，因此后端仅服务于本机：

- 仅监听 `127.0.0.1`，局域网中的其他设备无法访问
- 拒绝 `Host` 不是 localhost 的请求，防止 DNS rebinding
- 校验 `Origin` 和 `Sec-Fetch-Site`，拒绝其他网页发起的跨站请求，防止 CSRF
- 执行删除、重命名、移动前解析符号链接，拒绝操作根目录、一级目录（`/system`、`/data`、`/sdcard` 等）和各存储卷的根目录
- 预览仅支持常见图片格式，SVG 在沙箱中渲染，其中的脚本不会执行

请勿通过反向代理等方式将其暴露至局域网或公网。

## 开发

```bash
pnpm install
pnpm dev      # 前端 http://127.0.0.1:5173，后端 3001 端口，均支持热更新
pnpm build    # 构建到 dist/
pnpm start    # 运行构建产物：http://127.0.0.1:3001
pnpm test     # 运行单元测试
```

整体架构、主要流程和模块依赖图见[架构说明](docs/architecture.md)，前后端接口见 [API 文档](docs/api.md)。

技术栈：

- 后端：Node.js + Express 5，通过 `execFile` 调用 adb，拼接设备端命令时对路径做单引号转义
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion + TanStack Query，字体（MiSans、Maple Mono）打包在本地，无需联网

目录结构：

```
server/
  adb.ts        adb 命令封装：列目录、push / pull、root 检测、复制移动删除等
  app.ts        组装 HTTP 服务；构建后同时托管前端页面
  files.ts      文件操作接口：列目录、新建、重命名、删除、复制、移动、预览
  transfer.ts   上传和下载接口，经电脑临时目录中转
  guard.ts      安全校验：仅限本机访问，受保护路径
  request.ts    请求参数解析和 root 状态缓存
  index.ts      启动入口
  *.test.ts     单元测试（vitest）
  i18n.ts       后端错误信息的中英文文案
shared/
  types.d.ts    前后端共用的接口数据类型
src/
  App.tsx       主界面，组装各 hook 和组件
  hooks/        状态和交互逻辑：设备、目录、选择、文件操作、快捷键等
  lib/          前端工具模块：接口请求、目录查询缓存、书签、排序、格式化、偏好设置、主题切换等
  components/   界面组件，ui.tsx 为共用的基础组件
    views/      图标、列表、分栏、画廊四种视图
    header/     顶栏及设备、语言、主题选择
    toolbar/    工具栏、路径、选择栏、状态栏
    bookmarks/  快捷入口和书签编辑
    overlays/   对话框、右键菜单、通知、拖放提示、传输队列等浮层
  i18n/         前端中英文文案（zh.ts 是类型来源，en.ts 须与之保持一致）
  test/         前端测试的环境配置和共用工具
  *.test.ts(x)  hooks 和组件的单元测试，与被测模块放在同一目录（vitest + jsdom）
  index.css     Catppuccin 配色和主题变量
docs/
  architecture.md  架构说明和模块依赖图
  api.md           前后端接口说明
```

构建产物：`dist/web/` 为前端，`dist/server/` 为编译后的后端，同时也是 npm 包的 `bin` 入口。

## 许可证

代码以 [MIT](LICENSE) 协议发布。

打包进前端的字体有各自的许可：

- [MiSans](https://hyperos.mi.com/font/)：小米《MiSans 字体知识产权许可协议》
- [Maple Mono](https://github.com/subframe7536/maple-font)：SIL Open Font License 1.1
