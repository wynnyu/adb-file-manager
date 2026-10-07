# API 文档

本文档说明后端提供的 HTTP 接口，以及前端 `src/lib/api.ts` 对这些接口的封装。整体结构见[架构说明](architecture.md)。

接口仅供本工具的前端使用，不保证向后兼容。

## 通用约定

### 地址与访问限制

- 后端监听 `127.0.0.1`，端口默认为 3001，可通过环境变量 `PORT` 修改；开发时前端经 Vite 代理访问
- 所有接口位于 `/api/` 下，设备相关的在 `/api/devices/`，文件相关的在 `/api/files/`；构建后，`/api/` 以外的 GET 请求返回前端页面
- 每个请求都经过 `localOnly` 校验，不满足以下条件时返回 `403`，`error` 按请求语言说明原因：
  - `Host` 去掉端口后为 `localhost`、`127.0.0.1` 或 `[::1]`
  - 若带有 `Origin`，须为上述主机的 `http:` 地址；若带有 `Sec-Fetch-Site`，须为 `same-origin` 或 `none`

### 公共参数

| 参数 | 位置 | 说明 |
| --- | --- | --- |
| `serial` | GET 和 `POST /api/files/upload` 为查询参数，其余 POST 为 JSON 请求体 | 设备序列号，取自 `GET /api/devices`。缺少时返回 `400` |
| `root` | 同上 | 值为 `"1"`（查询参数或请求体）或 `true`（请求体）时以 root 身份执行；其余取值视为普通模式 |
| `path`、`from`、`to`、`dest` | 同上 | 设备上的绝对路径。须以 `/` 开头且不含 NUL 字符，否则返回 `400`；服务端会做规范化（处理 `.`、`..` 和重复的 `/`） |
| `paths` | JSON 请求体 | 绝对路径数组，也接受单个字符串；为空时返回 `400` |

root 方式在首次 root 请求时检测并按设备缓存：adbd 本身以 root 运行时为 `adbd`，否则尝试 `su -c`（前缀可由 `ADBFM_SU` 修改）。

### 语言

错误信息按请求头 `X-Lang`（`zh` 或 `en`）选择语言；未提供时，`Accept-Language` 以 `zh` 开头则用中文，否则用英文。前端每个请求都带有当前界面语言的 `X-Lang`。

### 响应与错误

成功时返回 JSON（`/api/files/preview` 和下载接口除外），无返回数据时为 `OkResult`。失败时返回 `ErrorResponse`：

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
| `no_root` | 403 | `POST /api/devices/root-check` 检测到设备无法获取 root |
| `root_lost` | 403 | 某个 root 请求失败后复查发现 root 已不可用（例如在 root 管理器中撤销了授权）。前端收到后退出 root 模式 |

常见状态码：

| 状态码 | 场景 |
| --- | --- |
| 400 | 参数缺失或不合法；目标已存在；路径受保护；把目录复制或移动到自身内部；未收到上传的文件 |
| 403 | 非本机访问；设备上没有读取权限；无法获取 root |
| 404 | 目录或文件不存在；下载 token 已过期；任务不存在或已过期 |
| 415 | 预览不支持该文件类型 |
| 416 | 预览请求的范围超出文件大小 |
| 500 | adb 执行失败，例如未找到 adb、设备断开或未授权 |

### 数据类型

定义在 `shared/types.d.ts`，前后端共用。

```ts
/** 设备经由哪个工具连接 */
type Transport = "adb" | "fastboot";

/** 规范化的设备模式 */
type DeviceMode = "system" | "recovery" | "sideload" | "bootloader" | "fastbootd" | "unauthorized" | "offline";

interface Device {
  serial: string;
  transport: Transport;
  mode: DeviceMode;
  /** adb 设备为 adb devices -l 中的 model（下划线换成空格），fastboot 设备为 getvar product */
  model: string;
  /** 设备的市场名称，读取不到时依次退回到品牌加型号、model、serial；fastboot 设备优先使用 adb 时缓存的名称，其次 product、serial */
  name: string;
}

/** GET /api/devices 的响应 */
interface DeviceList {
  devices: Device[];
  /** adb 调用失败时的错误信息；此时 fastboot 设备仍会列出 */
  adbError?: string;
  /** 找不到 fastboot 可执行文件 */
  fastbootMissing?: boolean;
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

/** POST /api/devices/root-check 的响应 */
interface RootCheckResult {
  method: RootMethod;
}

/** 无返回数据时的成功响应 */
interface OkResult {
  ok: true;
}

/** 供前端识别的错误类型，见“响应与错误” */
type ErrorCode = "no_root" | "root_lost";

/** 所有接口出错时的响应；error 可直接显示给用户 */
interface ErrorResponse {
  error: string;
  code?: ErrorCode;
}

/** 后台任务的状态：canceled 为用户取消 */
type JobState = "running" | "done" | "error" | "canceled";

/** 任务当前所处的阶段，前端据此显示状态文字 */
type JobPhase = "preparing" | "pulling" | "compressing" | "pushing";

/** 启动任务的接口的响应 */
interface JobRef {
  id: string;
}

/** GET /api/jobs/:id/events 的 state 事件：任务快照，不含日志；R 为 result 的类型 */
interface JobSnapshot<R = unknown> {
  id: string;
  state: JobState;
  phase?: JobPhase;
  /** 0 到 1，未知时缺省 */
  progress?: number;
  /** 当前阶段是否允许取消 */
  cancelable: boolean;
  result?: R;
  error?: string;
  code?: ErrorCode;
}

/** POST /api/files/upload 的响应；count 为收到的文件数 */
interface UploadResult extends OkResult {
  count: number;
}

/** POST /api/files/pull 启动的任务的结果：一次性下载 token 和下载后的文件名 */
interface PullResult {
  token: string;
  name: string;
}

/** GET /api/files/text 的响应：binary 表示不是 UTF-8 文本；truncated 时只含前 limit 字节 */
type TextPreview = { kind: "text"; text: string; truncated: boolean; limit: number } | { kind: "binary" };

/** 支持预览和解压的压缩包格式：zip 系（含 apk、jar 等）、tar、tar.gz、tar.bz2 */
type ArchiveFormat = "zip" | "tar" | "tgz" | "tbz";

/** 压缩包里的一个条目；路径相对压缩包根，不含首尾的 / */
interface ArchiveEntry {
  path: string;
  isDir: boolean;
  /** 解压后的大小，字节 */
  size: number;
  /** 压缩包里记录的时间原文，无时区 */
  date?: string;
  /** 符号链接的目标 */
  link?: string;
}

/** GET /api/files/archive 的响应；truncated 时只含前面的部分条目 */
interface ArchiveListing {
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  truncated: boolean;
}

/** POST /api/files/extract 的响应：解压出的文件夹或文件 */
interface ExtractResult {
  path: string;
}

/** POST /api/files/compress 的请求；压缩包生成在所选项的公共父目录 */
interface CompressRequest {
  paths: string[];
  format: ArchiveFormat;
}

/** POST /api/files/compress 启动的任务的结果：生成的压缩包；skipped 为 zip 未能收入的符号链接和特殊文件数，为 0 时缺省 */
interface CompressResult {
  path: string;
  skipped?: number;
}

/** 符号链接的信息；目标按跟随链接后的结果统计 */
interface LinkInfo {
  /** 链接中保存的原始目标，可能是相对路径 */
  target: string;
  /** 目标的绝对路径，用于跳转 */
  resolved: string;
  /** 目标不存在 */
  broken: boolean;
  targetType?: "dir" | "file";
  targetSize?: number;
}

/** 条目所在的分区；读取不到时 GET /api/files/stat 不返回该字段 */
interface PartitionInfo {
  /** 挂载点 */
  mount: string;
  device: string;
  /** 文件系统类型，读取不到 /proc/mounts 时缺省 */
  fsType?: string;
  /** 字节 */
  total: number;
  free: number;
}

/** GET /api/files/stat 的响应；type 对符号链接为 link，目标信息见 link */
interface FileStat {
  name: string;
  path: string;
  type: "dir" | "file" | "link";
  size: number;
  mtime: number;
  /** 状态变更时间（ctime） */
  ctime: number;
  /** 权限位的数值，含 setuid、setgid、sticky，例如 0o755 为 493 */
  mode: number;
  uid: number;
  gid: number;
  /** 老设备的 stat 不支持名称时缺省 */
  user?: string;
  group?: string;
  inode?: number;
  links?: number;
  /** SELinux 上下文，设备不支持时缺省 */
  context?: string;
  link?: LinkInfo;
  partition?: PartitionInfo;
  /** 路径受保护，不允许修改权限 */
  protected: boolean;
}

/** GET /api/files/usage 的响应：文件夹的递归统计，不跟随符号链接 */
interface DirUsage {
  /** 全部非目录条目的大小之和，字节 */
  size: number;
  /** 非目录条目数（含符号链接） */
  files: number;
  /** 子文件夹数，不含自身 */
  dirs: number;
  /** 部分子项无权限读取，统计不完整 */
  partial: boolean;
}

/** POST /api/files/chmod 的请求；mode 为 3 到 4 位八进制字符串 */
interface ChmodRequest {
  paths: string[];
  mode: string;
  recursive?: boolean;
}

/** POST /api/files/chown 的请求；owner 和 group 至少给一个，可以是名称或数字 id */
interface ChownRequest {
  paths: string[];
  owner?: string;
  group?: string;
  recursive?: boolean;
}
```

## 接口一览

| 方法 | 路径 | 说明 | 前端封装 |
| --- | --- | --- | --- |
| GET | `/api/devices` | 列出 adb 和 fastboot 设备 | `api.devices()` |
| POST | `/api/devices/reconnect` | 重新请求授权 | `api.reconnectDevices()` |
| POST | `/api/devices/restart-server` | 重启 adb 服务 | `api.restartAdb()` |
| POST | `/api/devices/root-check` | 检测 root 方式 | `api.rootCheck(serial)` |
| GET | `/api/devices/storage` | 查询存储空间 | `api.storage(serial)` |
| GET | `/api/files/ls` | 列出目录 | `api.ls(target, path)` |
| POST | `/api/files/mkdir` | 新建文件夹 | `api.mkdir(target, path)` |
| POST | `/api/files/rename` | 重命名 | `api.rename(target, from, to)` |
| POST | `/api/files/delete` | 删除 | `api.remove(target, paths)` |
| POST | `/api/files/copy` | 复制到目录 | `api.copy(target, paths, dest)` |
| POST | `/api/files/move` | 移动到目录 | `api.move(target, paths, dest)` |
| GET | `/api/files/preview` | 读取图片、视频、音频，支持 Range | `api.previewUrl(target, path)` |
| GET | `/api/files/text` | 以文本读取文件开头 | `api.text(target, path)` |
| GET | `/api/files/archive` | 列出压缩包内的条目 | `api.archive(target, path)` |
| POST | `/api/files/extract` | 在设备上解压压缩包 | `api.extract(target, path)` |
| POST | `/api/files/compress` | 启动压缩任务，把文件和文件夹压缩为 zip 或 tar 系压缩包 | `api.compress(target, paths, format)` |
| GET | `/api/files/stat` | 读取属性 | `api.stat(target, path)` |
| GET | `/api/files/usage` | 递归统计文件夹 | `api.usage(target, path, signal)` |
| POST | `/api/files/chmod` | 修改权限 | `api.chmod(target, paths, mode, recursive)` |
| POST | `/api/files/chown` | 修改所有者和用户组 | `api.chown(target, paths, owner, group, recursive)` |
| POST | `/api/files/upload` | 上传 | `api.upload(target, dest, files, onProgress)` |
| POST | `/api/files/pull` | 启动下载任务 | `api.pull(target, paths)`，`api.download` 第一步 |
| GET | `/api/files/fetch/:token` | 取回下载内容 | `api.download(target, paths)` 最后一步 |
| GET | `/api/jobs/:id/events` | 订阅任务的进度、日志和结果（SSE） | `api.watchJob(id, onUpdate)` |
| POST | `/api/jobs/:id/cancel` | 取消任务 | `api.cancelJob(id)` |

## 设备

### GET /api/devices

列出 adb 和 fastboot 识别到的全部设备，包括未授权和离线的设备。执行 `adb devices -l`（超时 10 秒）和 `fastboot devices -l`（超时 5 秒），两者并行，按 serial 去重，同一 serial 两边都有时保留 adb 的条目。adb 设备名称通过 `getprop` 读取并按序列号缓存。

adb 的状态映射为 `mode`：`device` 为 `system`，`recovery`、`sideload`、`bootloader`、`unauthorized` 同名，其余（`offline`、`authorizing`、`connecting`、`no permissions`、`host` 等）一律为 `offline`。fastboot 设备在首次出现时执行一次 `getvar is-userspace` 和 `getvar product`：`is-userspace` 为 `yes` 时 `mode` 为 `fastbootd`，否则为 `bootloader`；fastboot 报告的其他状态为 `offline`。查询结果按 serial 缓存，设备从列表消失时清除，轮询期间不再向 fastboot 设备发送命令。

fastboot 的可执行文件路径可通过环境变量 `FASTBOOT_PATH` 指定，默认从 `PATH` 查找。

本接口总是返回 `200`。adb 失败时 `adbError` 带上错误信息，fastboot 设备照常列出；找不到 fastboot 时 `fastbootMissing` 为 `true`，adb 设备不受影响。fastboot 的其他错误按没有设备处理。

某台设备连续处于 `unauthorized` 超过 8 秒时，会自动执行一次 `adb reconnect offline` 让设备重新弹出授权提示；状态变化或设备消失后记录清除，重新插拔后可再次自动重试。

响应：`DeviceList`

```json
{
  "devices": [{ "serial": "R5CT1234", "transport": "adb", "mode": "system", "model": "Pixel 9", "name": "Pixel 9" }],
  "fastbootMissing": true
}
```

### POST /api/devices/reconnect

执行 `adb reconnect offline`，断开并重连 offline 和 unauthorized 的设备，设备会重新弹出授权提示，不影响已授权的设备。超时 10 秒。无需参数，响应：`{ "ok": true }`

### POST /api/devices/restart-server

执行 `adb kill-server` 后接 `adb start-server`，会中断其他正在使用 adb 的工具。服务未运行导致的 kill-server 错误会被忽略。无需参数，响应：`{ "ok": true }`

前端每 2 秒轮询一次（`useDevices`）。

### POST /api/devices/root-check

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

### GET /api/devices/storage

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

### GET /api/files/ls

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

### POST /api/files/mkdir

新建文件夹，等同 `mkdir -p`：已存在时不报错，缺少的上层目录一并创建。

```json
{ "serial": "R5CT1234", "root": false, "path": "/sdcard/新建文件夹" }
```

响应：`{ "ok": true }`

### POST /api/files/rename

把 `from` 改名或移动为 `to`。

```json
{ "serial": "R5CT1234", "root": false, "from": "/sdcard/a.txt", "to": "/sdcard/b.txt" }
```

响应：`{ "ok": true }`

错误：`to` 已存在时 `400`；`from` 是受保护路径时 `400`。

### POST /api/files/delete

递归删除（`rm -rf`）。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/a.txt", "/sdcard/Old"] }
```

响应：`{ "ok": true }`

错误：任一路径受保护时 `400`，不会删除任何内容。

### POST /api/files/copy

把 `paths` 中的每一项复制到目录 `dest` 下。重名时依次命名为“名称 2.扩展名”“名称 3.扩展名”……，不会覆盖已有内容；目录名中的点不视为扩展名。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/a.txt"], "dest": "/sdcard/Backup" }
```

响应：`{ "ok": true }`

错误：`dest` 是某个源或其子目录时 `400`。多项时按顺序逐项复制，中途失败时已复制的部分保留。

### POST /api/files/move

把 `paths` 中的每一项移动到目录 `dest` 下，名称不变。已在 `dest` 中的项跳过。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/DCIM/x.jpg"], "dest": "/sdcard/Pictures" }
```

响应：`{ "ok": true }`

错误：任一源路径受保护、`dest` 是某个源或其子目录、目标位置已有同名项时 `400`。多项时逐项移动，中途失败时已移动的部分保留。

### 受保护路径

删除、移动、重命名（源路径），以及修改权限和所有者前，服务端按原路径和 `readlink -f` 解析后的真实路径各检查一次，以下路径一律拒绝：

- 根目录和一级目录，例如 `/`、`/sdcard`、`/data`、`/system`、`/storage`、`/mnt`
- `/storage` 的下一级，例如 `/storage/emulated`、`/storage/self`、SD 卡根目录 `/storage/1234-ABCD`
- 各用户的内部存储根目录，例如 `/storage/emulated/0`、`/storage/self/primary`
- `/mnt` 下除某个存储（`emulated/N` 或 SD 卡）内部内容以外的全部路径

`/data` 本身受保护，`/data` 下的内容不受此限制。

## 查看文件

### GET /api/files/preview

以字节流返回设备上的图片、视频或音频（`adb exec-out`），供分栏视图、画廊视图的缩略图和页面内查看器使用。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是 |
| `root` | 否 |

仅支持以下扩展名，其余返回 `415`。`Content-Type` 为文件的真实类型，浏览器能否解码取决于浏览器本身，例如 `.mkv`、`.amr` 在多数浏览器中无法播放：

| 扩展名 | Content-Type |
| --- | --- |
| `.jpg` `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.avif` | `image/avif` |
| `.bmp` | `image/bmp` |
| `.svg` | `image/svg+xml` |
| `.mp4` `.m4v` | `video/mp4` |
| `.webm` | `video/webm` |
| `.mov` | `video/quicktime` |
| `.mkv` | `video/x-matroska` |
| `.3gp` | `video/3gpp` |
| `.mp3` | `audio/mpeg` |
| `.m4a` | `audio/mp4` |
| `.aac` | `audio/aac` |
| `.flac` | `audio/flac` |
| `.wav` | `audio/wav` |
| `.ogg` `.opus` | `audio/ogg` |
| `.amr` | `audio/amr` |

先读取文件大小（符号链接取目标的大小），文件不存在时返回 `404`，无读取权限时返回 `403`。之后按 `Range` 请求头响应：

| 请求 | 响应 |
| --- | --- |
| 无 `Range`，或格式不合法、包含多段 | `200`，完整内容，带 `Content-Length` |
| 单段 `bytes=a-b`、`bytes=a-` 或 `bytes=-n` | `206`，带 `Content-Range: bytes 起点-终点/大小` 和 `Content-Length`；终点超出文件时截到文件末尾 |
| 起点不小于文件大小，或 `bytes=-0` | `416`，带 `Content-Range: bytes */大小`，响应体为 `ErrorResponse` |

分段读取在设备上执行 `dd`（`iflag=skip_bytes,count_bytes`），直接跳到起点读取；Android 10 之前的设备若不支持这两个参数，退回 `tail -c +起点 | head -c 长度`。视频和音频的进度条依赖 `206` 响应才能拖动。

响应头始终包含 `Accept-Ranges: bytes`；成功时另有 `X-Content-Type-Options: nosniff`、`Cache-Control: no-store` 和 `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`，SVG 中的脚本不会执行。客户端断开时终止 adb 进程。

### GET /api/files/text

读取文件开头作为文本，供查看器显示图片、视频、音频以外的文件。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是 |
| `root` | 否 |

响应：`TextPreview`

```json
{ "kind": "text", "text": "ro.build.type=user\n", "truncated": false, "limit": 1048576 }
```

- 最多读取前 1 MB（`limit`，单位字节）；文件更大时 `truncated` 为 `true`，末尾被截断的不完整字符会被去掉
- 开头的 UTF-8 BOM 会被去掉
- 前 8 KB 中含 NUL 字节，或内容不是合法的 UTF-8 时，返回 `{ "kind": "binary" }`。GBK、UTF-16 等编码的文本同样按二进制处理

错误：文件不存在时 `404`；无读取权限时 `403`。

## 压缩包

压缩包在设备上处理，不经电脑中转：zip 系用设备自带的 `unzip`（Android 9 起提供），tar 系用 toybox 的 `tar`。支持的格式按文件扩展名判断，其余（7z、rar、xz 等）返回 `415`：

| 扩展名 | 格式 |
| --- | --- |
| `.zip` `.apk` `.apks` `.xapk` `.jar` `.aar` | `zip` |
| `.tar` | `tar` |
| `.tar.gz` `.tgz` | `tgz` |
| `.tar.bz2` `.tbz2` `.tbz` | `tbz` |

设备上缺少对应命令时返回 `501`，提示缺少 `unzip` 或 `tar`。toybox 的 `tar` 支持 `z` 和 `j`，不支持 xz。

### GET /api/files/archive

列出压缩包内的全部条目，供查看器显示目录树。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是 |
| `root` | 否 |

响应：`ArchiveListing`

```json
{
  "format": "zip",
  "entries": [
    { "path": "res", "isDir": true, "size": 0, "date": "2009-01-01 00:00" },
    { "path": "res/layout/main.xml", "isDir": false, "size": 3104, "date": "2009-01-01 00:00" }
  ],
  "truncated": false
}
```

- 条目路径去掉开头的 `./` 和末尾的 `/`，压缩包根（`.`）不列出；压缩包没有单独列出的中间目录不会补全，由前端补齐
- zip 解析 `unzip -lv` 的输出，tar 解析 `tar -tv` 的输出；tar 中符号链接的目标放在 `link`，硬链接按普通文件处理
- `date` 是压缩包里记录的时间原文，格式为 `YYYY-MM-DD HH:MM`，不含时区
- 条目超过 20000 时只返回前 20000 个，`truncated` 为 `true`

错误：扩展名不受支持时 `415`；文件不存在时 `404`；无读取权限时 `403`；压缩包损坏或命令执行失败时 `400`；设备缺少命令时 `501`。

### POST /api/files/extract

在设备上把压缩包解压到它所在的目录，不覆盖已有内容。

请求体：`{ serial, path, root? }`，`path` 为压缩包的绝对路径。响应：`ExtractResult`

```json
{ "path": "/sdcard/Download/photos" }
```

解压位置同访达：

- 压缩包内只有一个顶层项目时，直接解出该项目
- 否则新建以压缩包名（去掉 `.zip`、`.tar.gz` 等扩展名）命名的文件夹，把全部内容放入其中
- 目标重名时依次改为“名字 2”“名字 3”，文件保留扩展名（`a 2.txt`），文件夹不拆分名字中的点；悬空的符号链接同样视为重名

实现上先解到压缩包所在目录下的暂存目录 `.adbfm-extract-<随机>`，再移到最终位置，最后删除暂存目录，失败时也会删除。tar 使用 `-o`，不还原属主，root 模式下也不会产生异常的 uid。

安全检查（`archive.ts` 的 `assertSafeEntries`）：解压前列出全部条目，出现以下任一情况即返回 `400`，不解压任何内容：

- 绝对路径
- 路径含 `..` 段（zip-slip）
- 路径位于某个符号链接条目之下（先放置指向目录之外的链接，再经由链接写出）

错误：除上述外，与 `GET /api/files/archive` 相同。

### POST /api/files/compress

把一个或多个文件、文件夹压缩为压缩包，不覆盖已有内容。

请求体：`{ serial, paths, format, root? }`，请求类型 `CompressRequest`。`paths` 为绝对路径列表，`format` 为 `zip`、`tar`、`tgz`、`tbz` 之一（界面目前只提供 `zip` 和 `tgz`）。

校验（路径、格式、各项是否存在）在请求内完成，出错时直接返回 JSON 错误；通过后启动任务并返回 `JobRef`，压缩在后台进行，进度和结果经 [任务](#任务) 的 `/api/jobs/:id/events` 取得：

```json
{ "id": "6b0c6f0e-6a7e-4f55-9a4f-0d6b3f6a2c10" }
```

任务的结果为 `CompressResult`：

```json
{ "path": "/sdcard/Download/photos.zip", "skipped": 2 }
```

位置和命名同访达：

- 压缩包生成在所选项的公共父目录，包内路径相对该目录。所选项在同一目录时就是该目录；跨目录时（例如列表视图中展开的子文件夹）取最近的公共祖先，包内保留相对层级（`archive.ts` 的 `packBase`）
- 重复项以及被其他所选项包含的项会先去掉，所以公共父目录必然在所有所选项之外，压缩包不会落进它自己的源里
- 单项命名为“名字加扩展名”，文件保留原扩展名（`a.jpg` 为 `a.jpg.zip`）；多项命名为 `Archive.zip`、`Archive.tar.gz`
- 重名时依次改为“名字 2.zip”“名字 3.zip”，复合扩展名不拆开（`a 2.tar.gz`），从不覆盖

两种生成方式：

| 格式 | 生成位置 | 做法 |
| --- | --- | --- |
| `tar`、`tgz`、`tbz` | 设备端 | `tar -cf`、`tar -czf`、`tar -cjf` 先写到所在目录下的暂存文件 `.adbfm-pack-<随机>`，成功后改为最终名字，失败时删除暂存文件，不留下半个压缩包。toybox 的 tar 只认最后一个 `-C`，所以所有名称以同一个基准目录为准，并以 `--` 与选项隔开。root 模式下压缩包会交给所在目录的所有者，避免生成 root 属主的文件 |
| `zip` | 电脑端 | 设备上没有 `zip` 命令。先估算空间（需要源大小的两倍，不足时任务以 `507` 失败），再 `adb pull` 到电脑临时目录，用 `archiver` 打包，最后 `adb push` 回设备，临时目录无论成败都会删除（`zip.ts` 的 `compressZip`）。已压缩的格式（图片、视频、音频、压缩包等）以存储方式写入，其余用 deflate |

任务的阶段和进度：

| 格式 | 阶段 | 进度 | 可取消 |
| --- | --- | --- | --- |
| `zip` | `preparing`：`du` 统计总大小、`find` 统计会被跳过的条目 | 无 | 是 |
| | `pulling`：`adb pull` 到电脑 | 按临时目录的增长估算，上限 0.99 | 是 |
| | `compressing`：打包 | `archiver` 已处理的输入字节占比 | 是 |
| | `pushing`：`adb push` 回设备 | 无 | 否，避免设备上留下不完整的压缩包 |
| `tar`、`tgz`、`tbz` | `compressing`：在设备上执行 | 无 | 否 |

取消后临时目录被删除，设备上不留下压缩包。

`adb pull` 会跳过符号链接、套接字等既不是文件也不是目录的条目，所以 zip 里没有它们，数量记在响应的 `skipped` 中，前端据此提示。tar 系格式保留符号链接，不会有 `skipped`。

错误：路径不存在时 `404`；`format` 不受支持时 `415`；压缩根目录时 `400`，这些在启动任务前返回。无读取权限或所在目录不可写时（`403`）、zip 所需的电脑临时空间不足时（`507`）、其他命令执行失败时（`400`），任务以 `error` 状态结束，错误信息在快照的 `error` 中。任一源出错则整体失败，设备上不留下压缩包。

## 属性

以下接口均接受[公共参数](#公共参数)中的 `serial` 和 `root`。

### GET /api/files/stat

读取单个条目的属性，符号链接不跟随，目标信息放在 `link` 中。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是 |
| `root` | 否 |

响应：`FileStat`

```json
{
  "name": "a.txt", "path": "/sdcard/a.txt", "type": "file", "size": 12,
  "mtime": 1700000000, "ctime": 1700000100, "mode": 432, "uid": 0, "gid": 1015,
  "user": "root", "group": "sdcard_rw", "inode": 42, "links": 1,
  "context": "u:object_r:sdcardfs:s0",
  "partition": { "mount": "/storage/emulated", "device": "/dev/fuse", "fsType": "sdcardfs", "total": 137438953472, "free": 51539607552 },
  "protected": false
}
```

- `stat -c` 的格式依次降级：完整格式、不含 SELinux 上下文、只含基本字段。老设备上不支持的字段缺省，不报错
- 分区信息来自 `df -k` 和 `/proc/mounts`，读取失败时不返回 `partition`
- `protected` 为 `true` 时，`POST /api/files/chmod` 和 `POST /api/files/chown` 会拒绝该路径

错误：路径不存在时 `404`；无权限读取时 `403`。

### GET /api/files/usage

递归统计文件夹的总大小、文件数和子文件夹数。统计的是各条目的实际字节数，不是磁盘占用；不跟随符号链接，符号链接按一个文件计，大小为链接自身的大小。

| 查询参数 | 必填 |
| --- | --- |
| `serial` | 是 |
| `path` | 是，须为目录 |
| `root` | 否 |

响应：`DirUsage`

```json
{ "size": 1048576, "files": 120, "dirs": 8, "partial": false }
```

目录很大时耗时较长：超时 120 秒，客户端取消请求或断开连接时终止设备上的 `find`。部分子项无权限读取时仍返回已统计的结果，`partial` 为 `true`。

错误：路径不存在时 `404`；不是目录时 `400`。

### POST /api/files/chmod

修改权限位。

```json
{ "serial": "R5CT1234", "root": true, "paths": ["/sdcard/a.sh"], "mode": "755", "recursive": false }
```

`mode` 须为 3 到 4 位八进制数字，`recursive` 为 `true` 时加 `-R` 作用于子项。响应：`{ "ok": true }`

错误：`mode` 不合法时 `400`；任一路径受保护时 `400`，不会修改任何内容；设备拒绝时返回设备给出的错误信息。

### POST /api/files/chown

修改所有者或用户组。

```json
{ "serial": "R5CT1234", "root": true, "paths": ["/sdcard/a.sh"], "owner": "root", "group": "sdcard_rw", "recursive": false }
```

`owner` 和 `group` 至少给一个，可以是名称或数字 id，只允许字母、数字、下划线、点和连字符，且不能以点或连字符开头。响应：`{ "ok": true }`

错误：二者都缺省或不合法时 `400`；任一路径受保护时 `400`；设备拒绝时返回设备给出的错误信息。普通 shell 用户通常无权修改，需开启 root 模式。

## 传输

### POST /api/files/upload

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

错误：没有收到文件，或 `paths` 不是字符串数组的 JSON 时 `400`。

### POST /api/files/pull

下载的第一步：启动下载任务，任务的结果是一次性 token。

```json
{ "serial": "R5CT1234", "root": false, "paths": ["/sdcard/DCIM/Camera"] }
```

请求内先确认路径存在；只选了一个文件时再确认文件可读（不存在为 `404`，无读取权限为 `403`），这些错误直接以 JSON 返回。通过后启动任务并返回 `JobRef`：

```json
{ "id": "6b0c6f0e-6a7e-4f55-9a4f-0d6b3f6a2c10" }
```

任务的结果为 `PullResult`：

```json
{ "token": "3f0c1f9e-6c1b-4f43-9c55-2f3b8f0f0a11", "name": "Camera.zip" }
```

| 选择 | 任务过程 |
| --- | --- |
| 单个文件 | 不落盘，任务立即完成，没有阶段和进度 |
| 目录或多选 | `preparing`：`du` 统计总大小；`pulling`：逐个 `adb pull` 到电脑临时目录，进度按临时目录的增长估算（上限 0.99）。两个阶段都可取消，失败或取消时删除临时目录 |

`name` 是下载后的文件名：

| 情况 | 文件名 |
| --- | --- |
| 单个文件 | 原文件名，不打包 |
| 单个目录 | `目录名.zip`，根目录为 `root.zip` |
| 多项 | `第一项所在目录名.zip`，取不到时为 `files.zip` |

token 在任务完成后 30 分钟内有效，过期后临时文件（若有）被删除。

### GET /api/files/fetch/:token

下载的第二步：返回 `POST /api/files/pull` 准备好的内容，`Content-Disposition` 为 attachment。

- 单个文件不经过电脑临时目录，用 `adb exec-out cat` 流式返回（root 为 su 方式时由 su 提权读取），带 `Content-Length`，浏览器立即开始下载。取回时重新读取文件大小，文件已被删除则返回 `404`
- 目录或多项打包为 zip 流式返回（压缩级别 1），不带 `Content-Length`

每个 token 只能使用一次：响应结束（包括客户端中途断开）后任务即被删除，打包用的临时目录一并清除。token 不存在或已过期时返回 `404`。

## 任务

耗时的操作以后台任务运行：启动任务的接口（目前为 `/api/files/pull` 和 `/api/files/compress`）校验参数后立即返回 `JobRef`，任务在服务端后台执行，进度、日志和结果通过 SSE 推送，也可以取消。任务由 `server/jobs.ts` 管理，保存在内存中，服务重启后丢失。

### GET /api/jobs/:id/events

响应为 `Content-Type: text/event-stream`，`Cache-Control: no-cache, no-transform`。连接建立后依次发送：

1. 一个 `state` 事件，数据为当前的 `JobSnapshot`
2. 已有的日志，每行一个 `log` 事件，数据为 JSON 字符串（最多保留最近 500 行）
3. 之后的增量：`state` 事件在阶段切换和结束时立即发送，进度更新约每 250 毫秒最多发送一次；`log` 事件在每次追加日志时发送

任务结束（状态不是 `running`）时发送最后一个 `state` 事件并关闭连接。每 15 秒发送一行 `: ping` 注释保活。

```
event: state
data: {"id":"6b0c6f0e","state":"running","phase":"pulling","progress":0.42,"cancelable":true}

event: log
data: "pulled 12 files"

event: state
data: {"id":"6b0c6f0e","state":"done","cancelable":false,"result":{"token":"3f0c1f9e","name":"Camera.zip"}}
```

快照字段见 `JobSnapshot`：

| 字段 | 说明 |
| --- | --- |
| `state` | `running`、`done`、`error`、`canceled` |
| `phase` | 当前阶段：`preparing`（统计大小）、`pulling`、`compressing`、`pushing`；尚未进入任何阶段时缺省 |
| `progress` | 当前阶段的进度，0 到 1；切换阶段时清除，未知时缺省 |
| `cancelable` | 当前阶段是否允许取消，结束后为 `false` |
| `result` | `done` 时为任务的结果，类型随接口而定 |
| `error`、`code` | `error` 时的错误信息和 `ErrorCode`。root 请求失败后复查发现 root 已失效时，`code` 为 `root_lost`，与普通接口一致 |

任务结束后在内存中保留 60 秒，供晚到的订阅者读取（包括断线重连），之后删除。任务不存在或已过期时返回 `404`，格式同其他接口。错误信息的语言取自启动任务的请求。

经 Vite 开发服务器代理时事件也是实时到达的，不会被缓冲。

### POST /api/jobs/:id/cancel

取消任务：任务在运行且 `cancelable` 为 `true` 时中止，底层的 `adb` 调用随之终止，任务以 `canceled` 状态结束。其他情况下不做任何事。响应 `OkResult`。任务不存在或已过期时返回 `404`。

### 在服务端使用

```ts
const ref = startJob<MyResult>(req, async (job) => {
  job.phase("preparing");
  const total = await cmds.diskUsage(ctx, paths, job.signal);
  job.phase("pulling");
  // job.progress(0.5)、job.log("...") 随时调用
  await adb.pull(ctx, remote, local, job.signal);
  job.phase("pushing", { cancelable: false });
  return { ... };
});
res.json(ref satisfies JobRef);
```

- `startJob` 要在路由的处理函数里调用，语言上下文和 root 复查所需的请求参数都来自这个请求
- `signal` 传给 `adb.pull`、`adb.push`、`cmds.diskUsage` 等支持取消的调用；`signal` 已触发时，无论任务函数抛出什么，任务都记为 `canceled`
- `phase(name, { cancelable })` 切换阶段，`cancelable` 缺省为 `true`；不能安全中断的阶段（例如推送）传 `false`
- 任务函数返回的值成为 `result`；抛出的异常经 `rootGuard` 复查后成为 `error`
- 需要清理的资源（临时目录等）在任务函数的 `finally` 或 `catch` 里处理，取消同样会走到这里

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
| `devices()` | `Promise<DeviceList>` | |
| `reconnectDevices()`、`restartAdb()` | `Promise<OkResult>` | 设备待授权时的补救操作，由 `hooks/useReauthorize.ts` 调用 |
| `rootCheck(serial)` | `Promise<{ method: RootMethod }>` | |
| `storage(serial)` | `Promise<StorageInfo>` | |
| `ls(target, path)` | `Promise<FileEntry[]>` | 通常经 `modules/files/lib/queries.ts` 的 `lsQuery` 调用，结果由 TanStack Query 缓存 |
| `mkdir(target, path)` | `Promise<OkResult>` | |
| `rename(target, from, to)` | `Promise<OkResult>` | |
| `remove(target, paths)` | `Promise<OkResult>` | 对应 `/api/files/delete` |
| `copy(target, paths, dest)` | `Promise<OkResult>` | |
| `move(target, paths, dest)` | `Promise<OkResult>` | |
| `previewUrl(target, path)` | `string` | 只拼接地址，供 `<img>`、`<video>`、`<audio>` 的 `src` 使用；媒体元素自行发出 Range 请求 |
| `text(target, path)` | `Promise<TextPreview>` | 通常经 `modules/files/lib/queries.ts` 的 `textQuery` 调用，查询键为 `["text", serial, root, path]`，关闭查看器后不保留缓存 |
| `archive(target, path)` | `Promise<ArchiveListing>` | 通常经 `modules/files/lib/queries.ts` 的 `archiveQuery` 调用，查询键为 `["archive", serial, root, path]`，关闭查看器后不保留缓存 |
| `extract(target, path)` | `Promise<ExtractResult>` | 耗时随压缩包大小而定，没有进度 |
| `compress(target, paths, format)` | `Promise<JobRef>` | 启动压缩任务，结果（`CompressResult`）用 `watchJob` 取得 |
| `pull(target, paths)` | `Promise<JobRef>` | 启动下载任务，结果（`PullResult`）用 `watchJob` 取得 |
| `watchJob<R>(id, onUpdate)` | `Promise<R>` | 用 `EventSource` 订阅 `/api/jobs/:id/events`，每个 `state` 事件回调一次快照。`done` 时返回 `result`；`error` 时抛出 `Error`（`root_lost` 同时调用 `onRootLost` 的回调）；`canceled` 时抛出 `JobCanceled`；连接断开且 `readyState` 为 `CLOSED` 时抛出网络错误，正在重连时继续等待，服务端会在重连后重发当前快照 |
| `cancelJob(id)` | `Promise<OkResult>` | |
| `download(target, paths, hooks?)` | `Promise<void>` | 依次调用 `pull`、`watchJob`，拿到 token 后创建临时 `<a download>` 指向 `/api/files/fetch/:token` 并点击，由浏览器完成下载；Promise 在下载开始时即完成。`hooks.onJob` 在任务启动后回调任务 id，`hooks.onUpdate` 在任务状态变化时回调快照 |
| `upload(target, dest, files, onProgress)` | `Promise<void>` | 使用 XMLHttpRequest 以获得上传进度。`onProgress` 的取值为 0 到 1，只反映浏览器到电脑这一段；之后的 `adb push` 没有进度，完成后 Promise 才完成 |

行为说明：

- GET 请求的 `serial`、`root`、`path` 放在查询参数中，`root` 仅在为 true 时以 `root=1` 传递；POST 请求把 `Target` 展开到 JSON 请求体
- 每个请求都带 `X-Lang` 请求头，值为当前界面语言
- 响应状态码不是 2xx 时抛出 `Error`，`message` 为响应中的 `error`；响应不是 JSON 时为 `HTTP 状态码`
- 响应的 `code` 为 `root_lost` 时，先调用 `onRootLost(fn)` 注册的回调，再抛出错误。`useRootMode` 注册该回调，用于退出 root 模式
- `upload` 遇到网络错误时以“网络错误”（按界面语言）拒绝
- `EventSource` 无法自定义请求头，`watchJob` 不带 `X-Lang`；任务里的错误信息语言取自启动任务的请求

### 调用方

| 方法 | 调用方 |
| --- | --- |
| `devices`、`storage` | `hooks/useDevices.ts` |
| `rootCheck`、`onRootLost` | `hooks/useRootMode.ts` |
| `ls` | `modules/files/lib/queries.ts`，由 `modules/files/hooks/useDirectory.ts`（`useDirectory`、`useListings`）和 `modules/files/hooks/useTree.ts` 使用 |
| `mkdir`、`rename`、`remove`、`copy`、`move`、`extract`、`compress`、`upload`、`download`、`watchJob`、`cancelJob` | `modules/files/hooks/useFileOps.ts` |
| `previewUrl` | `modules/files/components/views/ColumnView.tsx`、`modules/files/components/views/GalleryView.tsx`、`modules/files/components/viewer/Viewer.tsx` |
| `text` | `modules/files/lib/queries.ts`，由 `modules/files/components/viewer/TextViewer.tsx` 使用 |
| `archive` | `modules/files/lib/queries.ts`，由 `modules/files/components/viewer/ArchiveView.tsx` 使用 |
