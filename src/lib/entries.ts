import { tr } from "../i18n/translate.ts";
import type { FileEntry } from "../types.ts";
import { kindLabel } from "./kinds.ts";

export type SortKey = "name" | "mtime" | "size" | "kind";
export interface Sort {
  key: SortKey;
  asc: boolean;
}

/**
 * 按显示设置过滤并排序（文件夹总在前面）。
 * keep 是无论如何都要保留的路径：分栏视图里路径上的隐藏目录得留着，不然当前位置在上一栏里看不到
 */
export function arrange(entries: FileEntry[], sort: Sort, showHidden: boolean, filter = "", keep?: string) {
  const q = filter.trim().toLowerCase();
  const list = entries.filter(
    (e) => e.path === keep || ((showHidden || !e.name.startsWith(".")) && (!q || e.name.toLowerCase().includes(q))),
  );
  const dir = sort.asc ? 1 : -1;
  return list.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    let r = 0;
    if (sort.key === "size") r = a.size - b.size;
    else if (sort.key === "mtime") r = a.mtime - b.mtime;
    else if (sort.key === "kind") r = kindLabel(a, tr).localeCompare(kindLabel(b, tr), "zh-CN");
    if (r === 0) r = a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" });
    return r * dir;
  });
}

export const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);

/** 快捷键提示里的修饰键 */
export const MOD = IS_MAC ? "⌘" : "Ctrl+";
