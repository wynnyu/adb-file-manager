export type {
  AppDetail,
  AppEntry,
  AppPermission,
  AppState,
  ArchiveEntry,
  ArchiveFormat,
  ArchiveListing,
  CompressRequest,
  CompressResult,
  Device,
  DeviceList,
  DeviceMode,
  DirUsage,
  ErrorCode,
  ErrorResponse,
  ExtractResult,
  FileEntry,
  FileStat,
  JobPhase,
  JobRef,
  JobSnapshot,
  JobState,
  LinkInfo,
  OkResult,
  PartitionInfo,
  PullResult,
  RootCheckResult,
  RootMethod,
  StorageInfo,
  TextPreview,
  Transport,
  UploadResult,
} from "../shared/types.d.ts";

export type TaskStatus =
  | "preparing"
  | "uploading"
  | "pushing"
  | "installing"
  | "pulling"
  | "copying"
  | "moving"
  | "extracting"
  | "compressing"
  | "done"
  | "error"
  | "canceled";

export interface Task {
  id: string;
  kind: "upload" | "download" | "copy" | "move" | "extract" | "compress" | "install";
  label: string;
  status: TaskStatus;
  /** 0 到 1，未知时缺省；任何进行中的状态都可以带进度 */
  progress?: number;
  error?: string;
  /** 完成后需要用户留意的说明，有说明的任务不会自动移除 */
  note?: string;
  /** 取消任务；存在且任务进行中时卡片显示取消按钮 */
  cancel?: () => void;
}
