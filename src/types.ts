import type { FileEntry } from "../shared/types.d.ts";

export type { Device, FileEntry, RootMethod, StorageInfo } from "../shared/types.d.ts";

export type TransferStatus = "uploading" | "pushing" | "pulling" | "copying" | "moving" | "done" | "error";

export interface Transfer {
  id: string;
  kind: "upload" | "download" | "copy" | "move";
  label: string;
  status: TransferStatus;
  /** 0–1，仅浏览器 → 电脑上传阶段可知 */
  progress?: number;
  error?: string;
}

/** 另外加载的某个目录的内容（分栏视图的其他栏、列表视图展开的文件夹） */
export interface Listing {
  /** 拉取时的刷新序号，和当前 rev 不一致说明过期了 */
  rev: number;
  entries?: FileEntry[];
  error?: string;
}

/** 列表视图里的一行：条目，或展开的文件夹读取失败时的提示；depth 是缩进层级 */
export type TreeRow = { entry: FileEntry; depth: number } | { note: string; key: string; depth: number };

export type ViewMode = "icons" | "list" | "columns" | "gallery";

/** 应用内剪贴板：剪切 / 拷贝的条目，只能粘贴回同一台设备 */
export interface Clip {
  mode: "copy" | "cut";
  entries: FileEntry[];
  serial: string;
}
