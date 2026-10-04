# ADB File Manager

[English](README.en.md) | 中文

在浏览器里管理安卓手机上的文件。

所有操作都通过 adb（`adb push` / `adb pull` / `adb shell`）完成，不依赖 MTP，所以手机的 USB 模式设为“仅充电”也能用，也不会遇到 MTP 断连、大文件卡住、隐藏目录看不到之类的问题。手机已 root 的话，还可以开启 root 模式访问 `/data` 等系统目录。

## 快速开始

需要：

- Node.js 20 及以上
- adb（Android SDK Platform-Tools），放在 `PATH` 里，或者用 `ADB_PATH` 指定路径

  还没装的话，见下方[安装 Node.js 和 adb](#安装-nodejs-和-adb)
- 手机开启 USB 调试：设置 → 关于手机，连点“版本号”7 次进入开发者模式，再到“开发者选项”里打开“USB 调试”

然后运行：

```bash
npx adb-file-manager
```

浏览器打开 <http://127.0.0.1:3001>，用数据线连接手机，在手机弹出的调试授权提示里点 **允许** 即可。

### 安装 Node.js 和 adb

**Node.js**

从 [nodejs.org](https://nodejs.org/) 下载 LTS 版本的安装包，或者用包管理器安装：

```bash
# macOS（Homebrew）
brew install node
# Windows（winget）
winget install OpenJS.NodeJS.LTS
```

Linux 发行版自带的 Node.js 可能低于 20，建议按 [nodejs.org 下载页](https://nodejs.org/en/download) 的说明用 nvm 等版本管理器安装。装好后运行 `node -v`，确认版本在 20 以上。

**adb（Android SDK Platform-Tools）**

只需要 Platform-Tools，不用安装 Android Studio 或完整的 Android SDK。可以用包管理器安装：

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

也可以从 [Android 开发者网站](https://developer.android.com/tools/releases/platform-tools)下载官方压缩包（[Windows](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) / [macOS](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip) / [Linux](https://dl.google.com/android/repository/platform-tools-latest-linux.zip)），解压后把 `platform-tools` 目录加入 `PATH`，或者用 `ADB_PATH` 指向其中的 `adb`（Windows 上是 `adb.exe`）。

装好后运行 `adb version` 确认能找到 adb。连上手机后运行 `adb devices`，列表里出现设备且状态为 `device` 就说明连接正常。Windows 上如果看不到设备，可能需要安装 USB 驱动：Pixel 用 [Google USB 驱动](https://developer.android.com/studio/run/win-usb)，其他品牌到厂商官网下载。

## 功能

**浏览**

- 图标、列表、分栏、画廊四种显示方式，都照着访达来做。列表视图的列和访达一致（名称、修改日期、大小、种类），文件夹前的三角可以就地展开。分栏视图从根目录逐级展开：选中文件夹时右边列出它的内容，选中文件时显示详情，图片直接显示缩略图。画廊视图上方是大预览，下方是缩略图条，右侧是信息面板
- 面包屑导航，双击可以直接输入路径；常用目录（内部存储、下载、相机、图片、视频、音乐、文档）一键直达
- 筛选、按名称 / 大小 / 修改时间排序、显示或隐藏点开头的文件
- 工具栏显示内部存储的已用和总容量

**传输**

- 点按钮或直接把文件、文件夹拖进窗口上传，保留目录结构
- 下载单个文件时原样下载；文件夹和多选内容会打包成 zip
- 传输队列显示每个任务的进度和结果

**整理**

- 右键菜单：打开、下载、剪切 / 拷贝 / 粘贴、拷贝路径、重命名、删除；在空白处右键可以新建文件夹、上传到当前目录、切换显示方式
- 拷贝遇到重名时自动编号（`照片 2.jpg`、`照片 3.jpg`…），不会覆盖已有文件；重命名和移动遇到重名会直接报错
- 不能把文件夹移动或拷贝到它自己里面

**设备与界面**

- 同时连接多台设备时可以切换，插拔自动检测，显示设备的商品名
- 界面支持中文和英文，默认跟随浏览器语言
- 主题采用 [Catppuccin](https://catppuccin.com) 配色，四种口味（Latte / Frappé / Macchiato / Mocha）和五种主色可选，默认跟随系统深浅色

### 快捷键

| 按键 | 操作 |
| --- | --- |
| `Enter` | 打开 |
| `F2` | 重命名 |
| `Delete` / `⌘ Backspace` | 删除 |
| `Backspace` / `Alt ↑` | 返回上一级 |
| `⌘/Ctrl A` | 全选 |
| `⌘/Ctrl C` / `X` / `V` | 拷贝 / 剪切 / 粘贴 |
| `↑` `↓` | 移动选择 |
| `←` `→` | 列表视图中收起或展开文件夹；分栏视图中进入或退出目录；画廊视图中切换上一项 / 下一项 |
| `Esc` | 取消选择 |

## root 模式

点击工具栏上的盾牌按钮开启。默认关闭，开启前会弹窗确认，可以勾选“记住选择”让下次自动开启。

开启时会先检测设备的 root 方式：

- adbd 本身以 root 运行（例如执行过 `adb root` 的工程机或模拟器）时直接使用
- 否则通过 `su -c` 提权，适用于 Magisk、KernelSU、APatch。第一次开启时手机上会弹出授权提示，请允许 **Shell** 获取 root 权限

通过 su 运行时，`adb push` / `adb pull` 本身没有 root 权限，上传和下载会先经 `/data/local/tmp` 下的临时目录中转，完成后自动清理。

为了防止误操作：

- 页面顶部显示警示横幅，主面板加红色描边，标签页标题带 `⚠ ROOT`
- 删除需要两次确认，第二次会列出完整路径，并有 3 秒倒计时
- 操作过程中 root 权限被撤销时，会自动退出 root 模式并提示原因

## 配置

通过环境变量配置：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `ADB_PATH` | `adb` | adb 可执行文件的路径 |
| `ADBFM_SU` | `su -c` | root 模式下的提权命令前缀。su 用法不同时可以修改，例如 `ADBFM_SU="su 0 sh -c"` |

```bash
PORT=8080 ADB_PATH=~/Android/platform-tools/adb npx adb-file-manager
```

## 安全

这个工具可以读写手机上的任意文件，开启 root 模式后还包括系统分区和应用数据，因此后端只为本机服务：

- 只监听 `127.0.0.1`，局域网中的其他设备无法访问
- 拒绝 `Host` 不是 localhost 的请求，防止 DNS rebinding
- 校验 `Origin` 和 `Sec-Fetch-Site`，拒绝其他网页发起的跨站请求，防止 CSRF
- 删除、重命名、移动之前会解析符号链接，拒绝操作根目录、一级目录（`/system`、`/data`、`/sdcard` 等）和各个存储的根目录
- 预览只放行常见图片格式，SVG 在沙箱中显示，不执行其中的脚本

请不要通过反向代理等方式把它暴露到局域网或公网。

## 开发

```bash
pnpm install
pnpm dev      # 前端 http://127.0.0.1:5173，后端 3001 端口，均支持热更新
pnpm build    # 构建到 dist/
pnpm start    # 运行构建产物：http://127.0.0.1:3001
```

技术栈：

- 后端：Node.js + Express 5，通过 `execFile` 调用 adb，拼接设备端命令时对路径做单引号转义
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion，字体（MiSans、Maple Mono）打包在本地，无需联网

目录结构：

```
server/
  adb.ts        adb 命令封装：列目录、push / pull、root 检测、复制移动删除等
  index.ts      HTTP API 和安全校验；构建后同时托管前端页面
  i18n.ts       后端错误信息的中英文文案
src/
  App.tsx       主界面和大部分交互逻辑
  components/   各个界面组件
  i18n/         前端中英文文案（zh.ts 是类型来源，en.ts 须与之对齐）
  index.css     Catppuccin 配色和主题变量
  theme.ts      主题切换
```

构建产物：`dist/web/` 是前端，`dist/server/` 是编译后的后端，也是 npm 包的 `bin` 入口。

## 许可证

代码以 [MIT](LICENSE) 协议发布。

打包进前端的字体有各自的许可：

- [MiSans](https://hyperos.mi.com/font/)：小米《MiSans 字体知识产权许可协议》
- [Maple Mono](https://github.com/subframe7536/maple-font)：SIL Open Font License 1.1
