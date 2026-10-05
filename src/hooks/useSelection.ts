import { type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import type { FileEntry } from "../types.ts";

/** 滚动到条目所在的行，使其可见 */
export function scrollToEntry(p: string) {
  document.querySelector(`[data-entry="${CSS.escape(p)}"]`)?.scrollIntoView({ block: "nearest" });
}

/**
 * 选中的条目路径。anchor 是 Shift 连选和方向键的起点。
 * 目录加载也要改动选择，所以选择状态单独放在这里，先于目录创建
 */
export function useSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);

  /** 只选中这一项并以它为起点；null 时清空选择和起点 */
  const selectOnly = useCallback((p: string | null) => {
    anchor.current = p;
    setSelected(new Set(p ? [p] : []));
  }, []);

  /** 清空选择，保留起点 */
  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, setSelected, anchor, selectOnly, clear };
}

export type Selection = ReturnType<typeof useSelection>;

/** 依赖可选条目的选择操作：点击、Shift 连选、Cmd / Ctrl 多选、全选和方向键 */
export function useSelectionActions(
  { selected, setSelected, anchor, selectOnly }: Selection,
  /** 能选中、能用方向键走到的条目，按显示顺序 */
  selectable: FileEntry[],
) {
  const selectedEntries = useMemo(() => selectable.filter((v) => selected.has(v.path)), [selectable, selected]);

  const onSelect = useCallback(
    (entry: FileEntry, e: MouseEvent) => {
      if (e.shiftKey && anchor.current) {
        const a = selectable.findIndex((v) => v.path === anchor.current);
        const b = selectable.findIndex((v) => v.path === entry.path);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(selectable.slice(lo, hi + 1).map((v) => v.path)));
          return;
        }
      }
      anchor.current = entry.path;
      if (e.metaKey || e.ctrlKey) {
        setSelected((s) => {
          const n = new Set(s);
          if (!n.delete(entry.path)) n.add(entry.path);
          return n;
        });
      } else {
        setSelected(new Set([entry.path]));
      }
    },
    [selectable, anchor, setSelected],
  );

  const onToggle = useCallback(
    (entry: FileEntry) => {
      anchor.current = entry.path;
      setSelected((s) => {
        const n = new Set(s);
        if (!n.delete(entry.path)) n.add(entry.path);
        return n;
      });
    },
    [anchor, setSelected],
  );

  const selectAll = useCallback(() => setSelected(new Set(selectable.map((v) => v.path))), [selectable, setSelected]);

  /** 方向键选择上一项 / 下一项，并滚动到可见 */
  const step = useCallback(
    (delta: 1 | -1) => {
      if (!selectable.length) return;
      const cur =
        anchor.current && selected.has(anchor.current) ? selectable.findIndex((v) => v.path === anchor.current) : -1;
      const i =
        cur < 0 ? (delta > 0 ? 0 : selectable.length - 1) : Math.min(selectable.length - 1, Math.max(0, cur + delta));
      const p = selectable[i].path;
      selectOnly(p);
      scrollToEntry(p);
    },
    [selectable, selected, anchor, selectOnly],
  );

  return { selectedEntries, onSelect, onToggle, selectAll, step };
}
