import { useCallback, useState } from "react";
import { basename } from "../lib/format.ts";
import type { FileEntry } from "../types.ts";

/** 属性页：记录要查看的条目，条目为空时不显示 */
export function useProperties() {
  const [entries, setEntries] = useState<FileEntry[] | null>(null);

  const askProperties = useCallback((targets: FileEntry[]) => {
    if (targets.length) setEntries(targets);
  }, []);

  /** 当前目录没有对应的 FileEntry，按路径构造一个文件夹条目 */
  const askDirProperties = useCallback(
    (dir: string) =>
      setEntries([{ name: basename(dir) || "/", path: dir, type: "dir", isDir: true, size: 0, mtime: 0, atime: 0 }]),
    [],
  );

  const closeProperties = useCallback(() => setEntries(null), []);

  return { propertiesEntries: entries, askProperties, askDirProperties, closeProperties };
}
