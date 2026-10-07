export type {
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
  | "uploading"
  | "pushing"
  | "pulling"
  | "copying"
  | "moving"
  | "extracting"
  | "compressing"
  | "done"
  | "error";

export interface Task {
  id: string;
  kind: "upload" | "download" | "copy" | "move" | "extract" | "compress";
  label: string;
  status: TaskStatus;
  /** 0 到 1，仅浏览器传到电脑的阶段可知 */
  progress?: number;
  error?: string;
  /** 完成后需要用户留意的说明，有说明的任务不会自动移除 */
  note?: string;
}
