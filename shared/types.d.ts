// 前后端共用的接口数据结构，只放类型。用 .d.ts 是为了不参与编译输出，后端的 rootDir 仍是 server/

export interface Device {
  serial: string;
  /** adb devices 报告的状态，常见的有 device、unauthorized、offline，也可能是 bootloader、recovery 等 */
  state: string;
  model: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file" | "link";
  isDir: boolean;
  size: number;
  mtime: number;
  /** 上次访问时间；多数 Android 挂载用 relatime，只是近似值 */
  atime: number;
}

/** 设备获取 root 的方式：adbd 本身以 root 运行，或通过 su 提权 */
export type RootMethod = "adbd" | "su";

/** 共享存储（/sdcard）的空间，单位字节 */
export interface StorageInfo {
  total: number;
  free: number;
}

/** POST /api/root-check 的响应 */
export interface RootCheckResult {
  method: RootMethod;
}

/** 无返回数据时的成功响应 */
export interface OkResult {
  ok: true;
}

/** 供前端识别的错误类型：no_root 为设备无法获取 root，root_lost 为 root 请求失败后复查发现 root 已失效 */
export type ErrorCode = "no_root" | "root_lost";

/** 所有接口出错时的响应；error 可直接显示给用户 */
export interface ErrorResponse {
  error: string;
  code?: ErrorCode;
}

/** POST /api/upload 的响应；count 为收到的文件数 */
export interface UploadResult extends OkResult {
  count: number;
}

/** POST /api/pull 的响应：一次性下载 token 和下载后的文件名 */
export interface PullResult {
  token: string;
  name: string;
}

/** GET /api/text 的响应：binary 表示不是 UTF-8 文本；truncated 时只含前 limit 字节 */
export type TextPreview = { kind: "text"; text: string; truncated: boolean; limit: number } | { kind: "binary" };
