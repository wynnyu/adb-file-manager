# ADB File Manager

[English](README.en.md) · 中文

网页版安卓文件管理器。手机 USB 选「仅充电」也能用 —— 底层走 `adb push` / `adb pull` / `adb shell`，不依赖 MTP。

## 准备
1. 电脑装好 adb（Android SDK platform-tools），`adb` 在 PATH 里，或设置 `ADB_PATH=/path/to/adb`
2. 手机：开发者选项 → 打开「USB 调试」，连上电脑后在手机上点「允许」
3. Node.js 20 及以上

## 运行
```bash
npx adb-file-manager     # 然后打开 http://127.0.0.1:3001
```

从源码运行：
```bash
pnpm install
pnpm dev                 # 开发：http://127.0.0.1:5173
pnpm build && pnpm start # 生产：http://127.0.0.1:3001
```

### 环境变量
| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `ADB_PATH` | `adb` | adb 可执行文件路径 |
| `ADBFM_SU` | `su -c` | root 模式下的提权命令前缀 |

## 功能
- 浏览目录、面包屑（双击可直接输入路径）、快捷入口、筛选、排序、显示隐藏文件
- 上传文件 / 文件夹（按钮或直接拖进窗口），下载文件；文件夹和多选会打包成 zip
- 新建文件夹、重命名、删除（不允许操作 `/`、`/sdcard` 这类一级目录）
- 多设备切换，设备插拔自动检测

## root 模式
工具栏的盾牌按钮可开启（默认关闭，开启前需确认，可选「记住选择」）。开启后所有操作经 `su -c` 以 root 执行，可访问 `/data` 等目录：
- 上传 / 下载经 `/data/local/tmp` 中转（adb push/pull 本身没有 root 权限），完成后自动清理
- 删除需要两层确认，第二层列出完整路径并有 3 秒倒计时
- 顶部有警示横幅，主面板红色描边，标签页标题带 ⚠ ROOT
- 首次开启时手机上的 Magisk / KernelSU 会弹窗，需允许 **Shell** 获取 root
- su 写法不同可设置 `ADBFM_SU`，例如 `ADBFM_SU="su 0 sh -c"`

快捷键：`Enter` 打开 · `F2` 重命名 · `Delete` 删除 · `Backspace` 上一级 · `⌘/Ctrl+A` 全选 · `Esc` 取消选择

## 安全
这个工具能读写手机上的任意文件（root 模式下包括系统目录），所以后端只为本机服务：
- 只监听 `127.0.0.1`，局域网里的其他设备访问不到
- 拒绝 Host 不是 localhost 的请求（防 DNS rebinding）
- 拒绝来自其他网页的跨站请求（校验 `Origin` / `Sec-Fetch-Site`，防 CSRF）

不要把它用反向代理暴露到公网。

## 结构
- `server/adb.ts`：adb 封装（`execFile` 调用，设备端路径单引号转义）
- `server/index.ts`：Express API：`/api/devices` `ls` `upload` `pull` + `fetch/:token` `mkdir` `rename` `delete`；构建后同时托管前端页面
- `src/`：React + TypeScript + Tailwind CSS v4 + motion 动画；Catppuccin Mocha 色板和字体（MiSans / Maple Mono，本地打包）定义在 `src/index.css` 的 `@theme`
- 构建产物：`dist/web/`（vite 打包的前端），`dist/server/`（tsc 编译的后端，也是 npm 包的 `bin` 入口）

## 许可证
代码以 [MIT](LICENSE) 协议发布。

打包进前端的字体各有自己的许可：
- [MiSans](https://hyperos.mi.com/font/)：小米《MiSans 字体知识产权许可协议》
- [Maple Mono](https://github.com/subframe7536/maple-font)：SIL Open Font License 1.1
