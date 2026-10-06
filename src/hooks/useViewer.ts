import { useCallback, useEffect, useMemo, useState } from "react";
import type { Target } from "../lib/index.ts";
import type { FileEntry } from "../types.ts";
import { scrollToEntry } from "./useSelection.ts";

/**
 * 页面内查看器打开的文件。前后切换的范围是 selectable 中的文件，即当前排序和筛选下的结果；
 * 切换时同步选中，关闭后选中项停在最后查看的文件上
 */
export function useViewer({
  selectable,
  selectOnly,
  target,
  online,
}: {
  /** 能选中的条目，按显示顺序 */
  selectable: FileEntry[];
  selectOnly: (p: string | null) => void;
  target: Target | null;
  online: boolean;
}) {
  // 记下打开时的设备：切换设备或 root 模式后视为已关闭
  const [opened, setOpened] = useState<{ entry: FileEntry; target: Target | null } | null>(null);
  const entry = opened && opened.target === target ? opened.entry : null;

  // 设备断开时关闭，重新连上后不再弹出
  useEffect(() => {
    if (!online) setOpened(null);
  }, [online]);

  const files = useMemo(() => selectable.filter((e) => !e.isDir), [selectable]);
  /** 当前文件在 files 中的位置；不在其中时（例如已被删除）为 -1 */
  const index = entry ? files.findIndex((e) => e.path === entry.path) : -1;

  const openFile = useCallback((e: FileEntry) => setOpened({ entry: e, target }), [target]);
  const close = useCallback(() => setOpened(null), []);

  /** 打开上一个 / 下一个文件，到两端时不动 */
  const step = useCallback(
    (delta: 1 | -1) => {
      const next = index < 0 ? undefined : files[index + delta];
      if (!next) return;
      setOpened({ entry: next, target });
      selectOnly(next.path);
      scrollToEntry(next.path);
    },
    [files, index, target, selectOnly],
  );

  return {
    entry,
    index,
    count: files.length,
    hasPrev: index > 0,
    hasNext: index >= 0 && index < files.length - 1,
    openFile,
    close,
    step,
  };
}
