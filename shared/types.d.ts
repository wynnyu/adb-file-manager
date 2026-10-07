// 前后端共用的接口数据结构，只放类型。用 .d.ts 是为了不参与编译输出，后端的 rootDir 仍是 server/

/** 设备经由哪个工具连接 */
export type Transport = "adb" | "fastboot";

/** 规范化的设备模式；各模块按模式决定是否可用 */
export type DeviceMode = "system" | "recovery" | "sideload" | "bootloader" | "fastbootd" | "unauthorized" | "offline";

export interface Device {
  serial: string;
  transport: Transport;
  mode: DeviceMode;
  model: string;
  name: string;
}

/** GET /api/devices 的响应：adb 失败时 adbError 带上错误，fastboot 设备照常列出；fastboot 不存在时 fastbootMissing 为 true */
export interface DeviceList {
  devices: Device[];
  adbError?: string;
  fastbootMissing?: boolean;
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

/** POST /api/devices/root-check 的响应 */
export interface RootCheckResult {
  method: RootMethod;
}

/** 无返回数据时的成功响应 */
export interface OkResult {
  ok: true;
}

/**
 * 供前端识别的错误类型：no_root 为设备无法获取 root，root_lost 为 root 请求失败后复查发现 root 已失效，
 * needs_force 为 409 时的通用约定：error 是可直接显示的风险说明，前端强确认后带 force: true 重试
 */
export type ErrorCode = "no_root" | "root_lost" | "needs_force";

/** 所有接口出错时的响应；error 可直接显示给用户 */
export interface ErrorResponse {
  error: string;
  code?: ErrorCode;
}

/** 后台任务的状态：canceled 为用户取消 */
export type JobState = "running" | "done" | "error" | "canceled";

/** 任务当前所处的阶段，前端据此显示状态文字 */
export type JobPhase = "preparing" | "pulling" | "compressing" | "pushing" | "installing";

/** 启动任务的接口的响应 */
export interface JobRef {
  id: string;
}

/** GET /api/jobs/:id/events 的 state 事件：任务快照，不含日志；R 为 result 的类型 */
export interface JobSnapshot<R = unknown> {
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
export interface UploadResult extends OkResult {
  count: number;
}

/** POST /api/files/pull 的响应：一次性下载 token 和下载后的文件名 */
export interface PullResult {
  token: string;
  name: string;
}

/** GET /api/files/text 的响应：binary 表示不是 UTF-8 文本；truncated 时只含前 limit 字节 */
export type TextPreview = { kind: "text"; text: string; truncated: boolean; limit: number } | { kind: "binary" };

/** 支持预览和解压的压缩包格式：zip 系（含 apk、jar 等）、tar、tar.gz、tar.bz2 */
export type ArchiveFormat = "zip" | "tar" | "tgz" | "tbz";

/** 压缩包里的一个条目；路径相对压缩包根，不含首尾的 / */
export interface ArchiveEntry {
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
export interface ArchiveListing {
  format: ArchiveFormat;
  entries: ArchiveEntry[];
  truncated: boolean;
}

/** POST /api/files/extract 的响应：解压出的文件夹或文件 */
export interface ExtractResult {
  path: string;
}

/** POST /api/files/compress 的请求；压缩包生成在所选项的公共父目录 */
export interface CompressRequest {
  paths: string[];
  format: ArchiveFormat;
}

/** POST /api/files/compress 的响应：生成的压缩包；skipped 为 zip 未能收入的符号链接和特殊文件数，为 0 时缺省 */
export interface CompressResult {
  path: string;
  skipped?: number;
}

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

/** 条目所在的分区；读取不到时 GET /api/files/stat 不返回该字段 */
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

/** GET /api/files/stat 的响应；type 对符号链接为 link，目标信息见 link */
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

/** GET /api/files/usage 的响应：文件夹的递归统计，不跟随符号链接 */
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

/** POST /api/files/chmod 的请求；mode 为 3 到 4 位八进制字符串 */
export interface ChmodRequest {
  paths: string[];
  mode: string;
  recursive?: boolean;
}

/** POST /api/files/chown 的请求；owner 和 group 至少给一个，可以是名称或数字 id */
export interface ChownRequest {
  paths: string[];
  owner?: string;
  group?: string;
  recursive?: boolean;
}

/** 应用对用户 0 的状态：uninstalled 为系统应用被 pm uninstall --user 0 移除，可用 install-existing 恢复 */
export type AppState = "enabled" | "disabled" | "uninstalled";

/** 关键包的角色：core 为系统核心组件，其余为当前的系统界面、设置、启动器、输入法 */
export type CriticalRole = "core" | "systemui" | "settings" | "launcher" | "ime";

/** GET /api/apps 的一项 */
export interface AppEntry {
  pkg: string;
  /** APK 在设备上的路径；已卸载的系统应用仍保留原路径 */
  path: string;
  uid?: number;
  system: boolean;
  state: AppState;
  /** 关键包，停用、卸载、清除数据前需强确认；不是关键包时缺省 */
  critical?: CriticalRole;
}

/** 应用的一项权限 */
export interface AppPermission {
  name: string;
  /** 运行时权限，需用户授予 */
  runtime: boolean;
  /** 只在 requested 中出现时缺省 */
  granted?: boolean;
}

/** GET /api/apps/info 的响应；时间为设备本地时间原文，无时区 */
export interface AppDetail {
  pkg: string;
  versionName?: string;
  versionCode?: number;
  minSdk?: number;
  targetSdk?: number;
  firstInstall?: string;
  lastUpdate?: string;
  /** 安装来源的包名 */
  installer?: string;
  codePath?: string;
  dataDir?: string;
  abi?: string;
  uid?: number;
  /** pkgFlags 中的标志，如 SYSTEM、HAS_CODE */
  flags: string[];
  /** 系统应用已被更新过，卸载更新可回到出厂版本 */
  updatedSystem: boolean;
  permissions: AppPermission[];
}

/**
 * POST /api/apps/uninstall、uninstall-updates、disable、clear 的请求（另带 serial）。
 * 目标是关键包时必须带 force: true，否则返回 409
 */
export interface AppActionRequest {
  pkg: string;
  force?: boolean;
}

/** POST /api/apps/uninstall 的请求；user0 只为当前用户卸载（系统应用），keepData 保留数据和缓存 */
export interface AppUninstallRequest extends AppActionRequest {
  user0?: boolean;
  keepData?: boolean;
}

/** POST /api/apps/install 的任务结果；obb 为推送的 OBB 文件数，没有时缺省 */
export interface InstallResult {
  obb?: number;
}

/** GET /api/props 的一项 */
export interface PropEntry {
  key: string;
  /** 多行值以换行符连接 */
  value: string;
}

/** GET /api/props 的响应；resetprop 仅在 root 请求时检测，否则为 false */
export interface PropList {
  props: PropEntry[];
  resetprop: boolean;
}

/**
 * POST /api/props/set 的请求。ro.* 需要 root 和 resetprop；
 * 有风险的属性不带 force: true 时返回 409 和 needs_force
 */
export interface PropSetRequest {
  serial: string;
  root?: boolean;
  key: string;
  value: string;
  force?: boolean;
}

/** POST /api/props/delete 的请求；删除需要 root 和 resetprop，且总是要求 force: true */
export interface PropDeleteRequest {
  serial: string;
  root?: boolean;
  key: string;
  force?: boolean;
}
