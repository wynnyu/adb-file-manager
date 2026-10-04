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
  atime: number;
}

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

export type ViewMode = "icons" | "list" | "columns" | "gallery";

/** 应用内剪贴板：剪切 / 拷贝的条目，只能粘贴回同一台设备 */
export interface Clip {
  mode: "copy" | "cut";
  entries: FileEntry[];
  serial: string;
}
