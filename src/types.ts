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
}

export type TransferStatus = "uploading" | "pushing" | "pulling" | "done" | "error";

export interface Transfer {
  id: string;
  kind: "upload" | "download";
  label: string;
  status: TransferStatus;
  /** 0–1，仅浏览器 → 电脑上传阶段可知 */
  progress?: number;
  error?: string;
}
