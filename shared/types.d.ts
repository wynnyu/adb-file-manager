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

/** 符号链接的信息；目标按跟随链接后的结果统计 */
export interface LinkInfo {
  /** 链接中保存的原始目标，可能是相对路径 */
  target: string;
  /** 目标的绝对路径，用于跳转 */
  resolved: string;
  /** 目标不存在 */
  broken: boolean;
  targetType?: "dir" | "file";
  targetSize?: number;
}

/** 条目所在的分区；读取不到时 GET /api/stat 不返回该字段 */
export interface PartitionInfo {
  /** 挂载点 */
  mount: string;
  device: string;
  /** 文件系统类型，读取不到 /proc/mounts 时缺省 */
  fsType?: string;
  /** 字节 */
  total: number;
  free: number;
}

/** GET /api/stat 的响应；type 对符号链接为 link，目标信息见 link */
export interface FileStat {
  name: string;
  path: string;
  type: FileEntry["type"];
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
  /** 路径受 guard 保护，不允许修改权限 */
  protected: boolean;
}

/** GET /api/usage 的响应：文件夹的递归统计，不跟随符号链接 */
export interface DirUsage {
  /** 全部非目录条目的大小之和，字节 */
  size: number;
  /** 非目录条目数（含符号链接） */
  files: number;
  /** 子文件夹数，不含自身 */
  dirs: number;
  /** 部分子项无权限读取，统计不完整 */
  partial: boolean;
}

/** POST /api/chmod 的请求；mode 为 3 到 4 位八进制字符串 */
export interface ChmodRequest {
  paths: string[];
  mode: string;
  recursive?: boolean;
}

/** POST /api/chown 的请求；owner 和 group 至少给一个，可以是名称或数字 id */
export interface ChownRequest {
  paths: string[];
  owner?: string;
  group?: string;
  recursive?: boolean;
}
