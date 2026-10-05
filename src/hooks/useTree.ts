import { useCallback, useEffect, useMemo, useState } from "react";
import type { Target } from "../lib/api.ts";
import { arrange, type Sort } from "../lib/entries.ts";
import type { FileEntry, TreeRow } from "../types.ts";
import { useListings } from "./useDirectory.ts";

/** 列表视图的展开三角：哪些文件夹展开了、逐行展开后的行，以及还在加载的文件夹 */
export function useTree({
  visible,
  sort,
  showHidden,
  path,
  target,
  online,
  active,
}: {
  /** 当前目录排序、筛选后的条目 */
  visible: FileEntry[];
  sort: Sort;
  showHidden: boolean;
  path: string;
  target: Target | null;
  online: boolean;
  /** 是否在列表视图：其他视图不显示展开的内容，不用加载 */
  active: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const open = useMemo(() => (active ? [...expanded] : []), [active, expanded]);
  const dirs = useListings(target, online, open);

  // 换了目录或设备就全部收起
  // biome-ignore lint/correctness/useExhaustiveDependencies: path 和 target 是触发条件，变了就要重置
  useEffect(() => setExpanded(new Set()), [path, target]);

  const toggleExpand = useCallback((entry: FileEntry, open?: boolean) => {
    setExpanded((s) => {
      if (open === s.has(entry.path)) return s;
      const n = new Set(s);
      if (!n.delete(entry.path)) n.add(entry.path);
      return n;
    });
  }, []);

  /** 逐行展开后的样子：文件夹下面紧跟它的内容 */
  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (list: FileEntry[], depth: number) => {
      for (const entry of list) {
        out.push({ entry, depth });
        if (!entry.isDir || !expanded.has(entry.path)) continue;
        const sub = dirs.get(entry.path);
        if (sub?.error) out.push({ note: sub.error, key: `${entry.path}\0error`, depth: depth + 1 });
        else if (sub?.entries) walk(arrange(sub.entries, sort, showHidden), depth + 1);
      }
    };
    walk(visible, 0);
    return out;
  }, [visible, expanded, dirs, sort, showHidden]);

  const pending = useMemo(() => new Set([...expanded].filter((d) => !dirs.has(d))), [expanded, dirs]);

  return { expanded, toggleExpand, rows, pending };
}
