# API 文档

本文档说明后端提供的 HTTP 接口，以及前端 `src/lib/api.ts` 对这些接口的封装。整体结构见[架构说明](architecture.md)。

接口仅供本工具的前端使用，不保证向后兼容。

## 通用约定

### 地址与访问限制

- 后端监听 `127.0.0.1`，端口默认为 3001，可通过环境变量 `PORT` 修改；开发时前端经 Vite 代理访问
- 所有接口位于 `/api/` 下；构建后，`/api/` 以外的 GET 请求返回前端页面
- 每个请求都经过 `localOnly` 校验，不满足以下条件时返回 `403`：
  - `Host` 去掉端口后为 `localhost`、`127.0.0.1` 或 `[::1]`，否则返回 `{ "error": "forbidden host" }`
  - 若带有 `Origin`，须为上述主机的 `http:` 地址；若带有 `Sec-Fetch-Site`，须为 `same-origin` 或 `none`，否则返回 `{ "error": "forbidden origin" }`

### 公共参数

| 参数 | 位置 | 说明 |
| --- | --- | --- |
| `serial` | GET 和 `POST /api/upload` 为查询参数，其余 POST 为 JSON 请求体 | 设备序列号，取自 `GET /api/devices`。缺少时返回 `400` |
| `root` | 同上 | 值为 `"1"`（查询参数或请求体）或 `true`（请求体）时以 root 身份执行；其余取值视为普通模式 |
| `path`、`from`、`to`、`dest` | 同上 | 设备上的绝对路径。须以 `/` 开头且不含 NUL 字符，否则返回 `400`；服务端会做规范化（处理 `.`、`..` 和重复的 `/`） |
| `paths` | JSON 请求体 | 绝对路径数组，也接受单个字符串；为空时返回 `400` |

root 方式在首次 root 请求时检测并按设备缓存：adbd 本身以 root 运行时为 `adbd`，否则尝试 `su -c`（前缀可由 `ADBFM_SU` 修改）。

### 语言

错误信息按请求头 `X-Lang`（`zh` 或 `en`）选择语言；未提供时，`Accept-Language` 以 `zh` 开头则用中文，否则用英文。前端每个请求都带有当前界面语言的 `X-Lang`。

### 响应与错误

成功时返回 JSON（预览和下载接口除外）。失败时返回：

```json
{ "error": "目标已存在" }
```

需要前端特别处理的错误另带 `code`：

```json
{ "error": "无法获取 root 权限：su 被拒绝。请在设备的 root 管理器中为 Shell 授权", "code": "root_lost" }
```

`error` 是可直接显示给用户的说明；`code` 仅在需要前端识别时出现：

| `code` | 状态码 | 含义 |
| --- | --- | --- |
| `no_root` | 403 | `POST /api/root-check` 检测到设备无法获取 root |
| `root_lost` | 403 | 某个 root 请求失败后复查发现 root 已不可用（例如在 root 管理器中撤销了授权）。前端收到后退出 root 模式 |

常见状态码：

| 状态码 | 场景 |
| --- | --- |
| 400 | 参数缺失或不合法；目标已存在；路径受保护；把目录复制或移动到自身内部；未收到上传的文件 |
| 403 | 非本机访问；设备上没有读取权限；无法获取 root |
| 404 | 目录或文件不存在；下载 token 已过期 |
| 415 | 预览不支持该文件类型 |
| 500 | adb 执行失败，例如未找到 adb、设备断开或未授权 |

### 数据类型

定义在 `shared/types.d.ts`，前后端共用。

```ts
interface Device {
  serial: string;
  /** adb devices 报告的状态 */
  state: "device" | "unauthorized" | "offline" | string;
  /** adb devices -l 中的 model，下划线换成空格 */
  model: string;
  /** 设备的市场名称，读取不到时依次退回到品牌加型号、model、serial */
  name: string;
}

interface FileEntry {
  name: string;
  /** 规范化后的绝对路径 */
  path: string;
  type: "dir" | "file" | "link";
  /** 目录，或指向目录的符号链接 */
  isDir: boolean;
  /** 字节数 */
  size: number;
  /** 修改时间，Unix 秒 */
  mtime: number;
  /** 访问时间，Unix 秒；多数挂载使用 relatime，仅为近似值 */
  atime: number;
}

type RootMethod = "adbd" | "su";

/** /sdcard 所在分区的容量，单位字节 */
interface StorageInfo {
  total: number;
  free: number;
}

/** POST /api/root-check 的响应 */
interface RootCheckResult {
  method: RootMethod;
}

/** POST /api/upload 的响应；count 为收到的文件数 */
interface UploadResult {
  ok: true;
  count: number;
}

/** POST /api/pull 的响应：一次性下载 token 和下载后的文件名 */
interface PullResult {
  token: string;
  name: string;
}
```

## 接口一览

| 方法 | 路径 | 说明 | 前端封装 |
| --- | --- | --- | --- |
| GET | `/api/devices` | 列出设备 | `api.devices()` |
| POST | `/api/root-check` | 检测 root 方式 | `api.rootCheck(serial)` |
| GET | `/api/storage` | 查询存储空间 | `api.storage(serial)` |
| GET | `/api/ls` | 列出目录 | `api.ls(target, path)` |
| POST | `/api/mkdir` | 新建文件夹 | `api.mkdir(target, path)` |
| POST | `/api/rename` | 重命名 | `api.rename(target, from, to)` |
| POST | `/api/delete` | 删除 | `api.remove(target, paths)` |
| POST | `/api/copy` | 复制到目录 | `api.copy(target, paths, dest)` |
| POST | `/api/move` | 移动到目录 | `api.move(target, paths, dest)` |
| GET | `/api/preview` | 图片预览 | `api.previewUrl(target, path)` |
| POST | `/api/upload` | 上传 | `api.upload(target, dest, files, onProgress)` |
| POST | `/api/pull` | 准备下载 | `api.download(target, paths)` 第一步 |
| GET | `/api/fetch/:token` | 取回下载内容 | `api.download(target, paths)` 第二步 |

## 设备

### GET /api/devices

列出 adb 识别到的全部设备，包括未授权和离线的设备。执行 `adb devices -l`，超时 10 秒。设备名称通过 `getprop` 读取并按序列号缓存。

响应：`Device[]`

```json
[{ "serial": "R5CT1234", "state": "device", "model": "Pixel 9", "name": "Pixel 9" }]
```

前端每 2 秒轮询一次（`useDevices`）。

### POST /api/root-check

重新检测设备获取 root 的方式，结果写入缓存，供之后的 root 请求使用。

请求体：

```json
{ "serial": "R5CT1234" }
```

响应：

```json
{ "method": "su" }
```

无法获取 root 时返回 `403`，`code` 为 `no_root`，`error` 说明原因：未找到 su、su 未切换到 root，或授权被拒绝。设备未连接等连接问题按普通错误返回 `500`。

### GET /api/storage

查询 `/sdcard` 所在分区的容量（`df -k /sdcard/`），始终以普通 shell 用户执行。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |

响应：`StorageInfo`

```json
{ "total": 137438953472, "free": 51539607552 }
```

## 文件操作

以下接口均接受[公共参数](#公共参数)中的 `serial` 和 `root`。

### GET /api/ls

列出目录的直接子项。

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `serial` | 是 | |
| `path` | 是 | 目录的绝对路径 |
| `root` | 否 | `1` 表示以 root 身份读取 |

响应：`FileEntry[]`，顺序不固定，排序由前端完成。

```json
[
  { "name": "DCIM", "path": "/sdcard/DCIM", "type": "dir", "isDir": true, "size": 3452, "mtime": 1700000000, "atime": 1700000001 },
  { "name": "a.txt", "path": "/sdcard/a.txt", "type": "file", "isDir": false, "size": 12, "mtime": 1700000002, "atime": 1700000003 }
]
```

错误：路径不存在或不是目录时 `404`；没有读取权限时 `403`。

### POST /api/mkdir

新建文件夹，等同 `mkdir -p`：已存在时不报错，缺少的上层目录一并创建。

```json
{ "serial": "R5CT1234", "root": false, "path": "/sdcard/新建文件夹" }
```

响应：`{ "ok": true }`

### POST /api/rename

把 `from` 改名或移动为 `to`。

```json
{ "serial": "R5CT1234", "root": false, "from": "/sdcard/a.txt", "to": "/sdcard/b.txt" }
```

响应：`{ "ok": true }`

错误：`to` 已存在时 `400`；`from` 是受保护路径时 `400`。

### POST /api/delete

递归删除（`rm -rf`）。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/a.txt", "/sdcard/Old"] }
```

响应：`{ "ok": true }`

错误：任一路径受保护时 `400`，不会删除任何内容。

### POST /api/copy

把 `paths` 中的每一项复制到目录 `dest` 下。重名时依次命名为“名称 2.扩展名”“名称 3.扩展名”…，不会覆盖已有内容；目录名中的点不视为扩展名。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/a.txt"], "dest": "/sdcard/Backup" }
```

响应：`{ "ok": true }`

错误：`dest` 是某个源或其子目录时 `400`。多项时按顺序逐项复制，中途失败时已复制的部分保留。

### POST /api/move

把 `paths` 中的每一项移动到目录 `dest` 下，名称不变。已在 `dest` 中的项跳过。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/DCIM/x.jpg"], "dest": "/sdcard/Pictures" }
```

响应：`{ "ok": true }`

错误：任一源路径受保护、`dest` 是某个源或其子目录、目标位置已有同名项时 `400`。多项时逐项移动，中途失败时已移动的部分保留。

### 受保护路径

删除、移动和重命名（源路径）前，服务端按原路径和 `readlink -f` 解析后的真实路径各检查一次，以下路径一律拒绝：

- 根目录和一级目录，例如 `/`、`/sdcard`、`/data`、`/system`、`/storage`、`/mnt`
- `/storage` 的下一级，例如 `/storage/emulated`、`/storage/self`、SD 卡根目录 `/storage/1234-ABCD`
- 各用户的内部存储根目录，例如 `/storage/emulated/0`、`/storage/self/primary`
- `/mnt` 下除某个存储（`emulated/N` 或 SD 卡）内部内容以外的全部路径

`/data` 本身受保护，`/data` 下的内容不受此限制。

### GET /api/preview

以字节流返回设备上的图片（`adb exec-out cat`），供分栏视图和画廊视图显示预览。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是 |
| `root` | 否 |

仅支持以下扩展名，其余返回 `415`：

| 扩展名 | Content-Type |
| --- | --- |
| `.jpg` `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.avif` | `image/avif` |
| `.bmp` | `image/bmp` |
| `.svg` | `image/svg+xml` |

响应头包含 `X-Content-Type-Options: nosniff`、`Cache-Control: no-store` 和 `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`，SVG 中的脚本不会执行。客户端断开时终止 adb 进程。

## 传输

### POST /api/upload

上传文件或文件夹到设备。文件先保存到电脑临时目录，再 `adb push` 到设备；su 模式下额外经设备上的 `/data/local/tmp` 中转。

| 查询参数 | 必填 | 说明 |
| --- | --- | --- |
| `serial` | 是 | |
| `path` | 是 | 目标目录，不存在时自动创建 |
| `root` | 否 | |

请求体为 `multipart/form-data`：

| 字段 | 说明 |
| --- | --- |
| `paths` | JSON 字符串，各文件相对目标目录的路径数组，顺序与 `files` 一致。上传文件夹时包含子目录，例如 `["photos/1.jpg", "photos/2.jpg"]` |
| `files` | 文件内容，可重复多次。文件名不使用，以 `paths` 为准 |

`paths` 中的 `.`、`..` 和空段会被去掉。缺少 `paths` 中对应项时使用 multipart 的文件名。

响应：

```json
{ "ok": true, "count": 2 }
```

错误：没有收到文件时 `400`。

### POST /api/pull

下载的第一步：把设备上的内容 `adb pull` 到电脑临时目录，返回一次性 token。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/DCIM/Camera"] }
```

响应：

```json
{ "token": "3f0c1f9e-6c1b-4f43-9c55-2f3b8f0f0a11", "name": "Camera.zip" }
```

`name` 是下载后的文件名：

| 情况 | 文件名 |
| --- | --- |
| 单个文件 | 原文件名，不打包 |
| 单个目录 | `目录名.zip`，根目录为 `root.zip` |
| 多项 | `第一项所在目录名.zip`，取不到时为 `files.zip` |

token 30 分钟内有效，过期后临时文件被删除。

### GET /api/fetch/:token

下载的第二步：返回 `POST /api/pull` 准备好的内容，`Content-Disposition` 为 attachment。

- 单个文件原样返回，带 `Content-Length`
- 目录或多项打包为 zip 流式返回（压缩级别 1），不带 `Content-Length`

每个 token 只能使用一次：响应结束（包括客户端中途断开）后临时文件即被删除。token 不存在或已过期时返回 `404`。

## 前端封装（src/lib/api.ts）

```ts
/** 当前操作的设备；root 为 true 时后端以 root 身份执行 */
interface Target {
  serial: string;
  root: boolean;
}
```

| 方法 | 返回值 | 说明 |
| --- | --- | --- |
| `devices()` | `Promise<Device[]>` | |
| `rootCheck(serial)` | `Promise<{ method: RootMethod }>` | |
| `storage(serial)` | `Promise<StorageInfo>` | |
| `ls(target, path)` | `Promise<FileEntry[]>` | 通常经 `lib/queries.ts` 的 `lsQuery` 调用，结果由 TanStack Query 缓存 |
| `mkdir(target, path)` | `Promise<unknown>` | |
| `rename(target, from, to)` | `Promise<unknown>` | |
| `remove(target, paths)` | `Promise<unknown>` | 对应 `/api/delete` |
| `copy(target, paths, dest)` | `Promise<unknown>` | |
| `move(target, paths, dest)` | `Promise<unknown>` | |
| `previewUrl(target, path)` | `string` | 只拼接地址，供 `<img src>` 使用 |
| `download(target, paths)` | `Promise<void>` | 调用 `/api/pull` 后创建临时 `<a download>` 指向 `/api/fetch/:token` 并点击，由浏览器完成下载；Promise 在下载开始时即完成 |
| `upload(target, dest, files, onProgress)` | `Promise<void>` | 使用 XMLHttpRequest 以获得上传进度。`onProgress` 的取值为 0 到 1，只反映浏览器到电脑这一段；之后的 `adb push` 没有进度，完成后 Promise 才完成 |

行为说明：

- GET 请求的 `serial`、`root`、`path` 放在查询参数中，`root` 仅在为 true 时以 `root=1` 传递；POST 请求把 `Target` 展开到 JSON 请求体
- 每个请求都带 `X-Lang` 请求头，值为当前界面语言
- 响应状态码不是 2xx 时抛出 `Error`，`message` 为响应中的 `error`；响应不是 JSON 时为 `HTTP 状态码`
- 响应的 `code` 为 `root_lost` 时，先调用 `onRootLost(fn)` 注册的回调，再抛出错误。`useRootMode` 注册该回调，用于退出 root 模式
- `upload` 遇到网络错误时以“网络错误”（按界面语言）拒绝

### 调用方

| 方法 | 调用方 |
| --- | --- |
| `devices`、`storage` | `hooks/useDevices.ts` |
| `rootCheck`、`onRootLost` | `hooks/useRootMode.ts` |
| `ls` | `lib/queries.ts`，由 `hooks/useDirectory.ts`（`useDirectory`、`useListings`）和 `hooks/useTree.ts` 使用 |
| `mkdir`、`rename`、`remove`、`copy`、`move`、`upload`、`download` | `hooks/useFileOps.ts` |
| `previewUrl` | `components/views/ColumnView.tsx`、`components/views/GalleryView.tsx` |
