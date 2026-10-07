import type { FileEntry } from "../../types.ts";

/** 另外加载的某个目录的内容（分栏视图的其他栏、列表视图展开的文件夹） */
export interface Listing {
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
