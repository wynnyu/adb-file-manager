// 前后端共用的接口数据结构，只放类型。用 .d.ts 是为了不参与编译输出，后端的 rootDir 仍是 server/

export interface Device {
  serial: string;
  state: "device" | "unauthorized" | "offline" | string;
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

/** POST /api/upload 的响应；count 为收到的文件数 */
export interface UploadResult {
  ok: true;
  count: number;
}

/** POST /api/pull 的响应：一次性下载 token 和下载后的文件名 */
export interface PullResult {
  token: string;
  name: string;
}
