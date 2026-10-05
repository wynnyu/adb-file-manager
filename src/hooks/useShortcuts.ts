import { useEffect, useRef } from "react";
import { arrange, type Sort } from "../lib/entries.ts";
import { parentPath } from "../lib/format.ts";
import type { Clip, FileEntry, Listing, ViewMode } from "../types.ts";
import { scrollToEntry } from "./useSelection.ts";

export interface ShortcutContext {
  /** 对话框或菜单打开时不响应 */
  blocked: boolean;
  path: string;
  view: ViewMode;
  selectable: FileEntry[];
  selectedEntries: FileEntry[];
  expanded: Set<string>;
  dirs: Map<string, Listing>;
  sort: Sort;
  showHidden: boolean;
  canPaste: boolean;
  clear: () => void;
  selectOnly: (p: string | null) => void;
  selectAll: () => void;
  step: (delta: 1 | -1) => void;
  toggleHidden: () => void;
  toggleExpand: (entry: FileEntry, open?: boolean) => void;
  toClip: (mode: Clip["mode"], items: FileEntry[]) => void;
  paste: (dest: string) => Promise<void>;
  navigate: (p: string, focus?: string | true) => void;
  open: (entry: FileEntry) => void;
  askRename: (entry: FileEntry) => void;
  askDelete: (targets: FileEntry[]) => void;
}

/** 全局快捷键。监听只注册一次，按键时通过 ref 读取最新的状态 */
export function useShortcuts(ctx: ShortcutContext) {
  const ref = useRef(ctx);
  ref.current = ctx;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e, ref.current);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function handleKey(e: KeyboardEvent, c: ShortcutContext) {
  if (c.blocked || (e.target as HTMLElement).closest("input, textarea")) return;
  const { path, view, selectedEntries } = c;
  const mod = e.metaKey || e.ctrlKey;
  const one = selectedEntries.length === 1 ? selectedEntries[0] : null;
  if (e.key === "Escape") c.clear();
  // 同访达的 ⌘⇧. ，按 code 判断，Shift 下 key 是 ">"
  else if (mod && e.shiftKey && e.code === "Period") {
    e.preventDefault();
    c.toggleHidden();
  } else if (mod && e.key === "a") {
    e.preventDefault();
    c.selectAll();
  } else if (mod && (e.key === "c" || e.key === "x")) {
    // 页面上选中了文字时让浏览器正常复制
    if (!selectedEntries.length || window.getSelection()?.toString()) return;
    e.preventDefault();
    c.toClip(e.key === "x" ? "cut" : "copy", selectedEntries);
  } else if (mod && e.key === "v") {
    if (!c.canPaste) return;
    e.preventDefault();
    void c.paste(path);
  } else if (!e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    // ⌥↑ 留给下面的“返回上一级”
    e.preventDefault();
    c.step(e.key === "ArrowDown" ? 1 : -1);
  } else if (view === "gallery" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    c.step(e.key === "ArrowRight" ? 1 : -1);
  } else if (view === "list" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
    if (!one) return;
    e.preventDefault();
    if (e.key === "ArrowRight") {
      if (one.isDir) c.toggleExpand(one, true);
    } else if (one.isDir && c.expanded.has(one.path)) c.toggleExpand(one, false);
    else if (parentPath(one.path) !== path) {
      // 展开出来的子项：跳回它所在的文件夹
      const parent = parentPath(one.path);
      c.selectOnly(parent);
      scrollToEntry(parent);
    }
  } else if (view === "columns" && e.key === "ArrowLeft") {
    e.preventDefault();
    if (path !== "/") c.navigate(parentPath(path), path);
  } else if (view === "columns" && e.key === "ArrowRight") {
    e.preventDefault();
    if (!one?.isDir) return;
    // 同访达：空文件夹、打不开的文件夹进不去，焦点留在原处
    const sub = c.dirs.get(one.path);
    if (sub && (sub.error || !arrange(sub.entries ?? [], c.sort, c.showHidden).length)) return;
    c.navigate(one.path, true);
  } else if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) c.askDelete(selectedEntries);
  else if (e.key === "Enter" && one) c.open(one);
  else if (e.key === "F2" && one) c.askRename(one);
  else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) path !== "/" && c.navigate(parentPath(path));
}
