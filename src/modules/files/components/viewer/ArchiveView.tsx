import { useQuery } from "@tanstack/react-query";
import { ChevronRight, FileArchive, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "../../../../i18n/index.tsx";
import type { Target } from "../../../../lib/index.ts";
import { formatSize } from "../../../../lib/index.ts";
import type { FileEntry } from "../../../../types.ts";
import type { ArchiveNode } from "../../lib/index.ts";
import { archiveQuery, archiveTree, flattenTree, treeStats } from "../../lib/index.ts";
import { FileIcon } from "../views/index.ts";
import { Spinner, Unsupported } from "./Unsupported.tsx";

/** 压缩包里的条目没有设备上的属性，构造一个只够 FileIcon 分类用的条目 */
const asEntry = (n: ArchiveNode): FileEntry => ({
  name: n.name,
  path: n.path,
  type: n.link !== undefined ? "link" : n.isDir ? "dir" : "file",
  isDir: n.isDir,
  size: n.size,
  mtime: 0,
  atime: 0,
});

/** 每深一层往右缩进的距离 */
const INDENT_REM = 1.5;

/** 压缩包预览：可展开的目录树，只列条目，不预览内部文件 */
export function ArchiveView({
  target,
  entry,
  onDownload,
}: {
  target: Target;
  entry: FileEntry;
  onDownload: () => void;
}) {
  const t = useT();
  const { data, error } = useQuery(archiveQuery(target, entry.path));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => archiveTree(data?.entries ?? []), [data]);
  const stats = useMemo(() => treeStats(tree), [tree]);
  const rows = useMemo(() => flattenTree(tree, expanded), [tree, expanded]);

  if (error) return <Unsupported entry={entry} text={error.message} onDownload={onDownload} />;
  if (!data) return <Spinner />;

  const toggle = (path: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="flex size-full flex-col overflow-hidden rounded-card bg-mantle ring-1 ring-surface0">
      <p className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-surface0 px-5 py-2.5 text-sm font-semibold text-subtext0">
        <span>
          {t("archive.summary", {
            files: t("props.fileCount", { n: stats.files }),
            dirs: t("props.dirCount", { n: stats.dirs }),
            size: formatSize(stats.size),
          })}
        </span>
        {data.truncated && (
          <span className="flex items-center gap-1.5 text-peach">
            <Info className="size-4 shrink-0" />
            {t("archive.truncated", { n: data.entries.length })}
          </span>
        )}
      </p>
      {rows.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center">
          <div className="flex flex-col items-center gap-3 text-subtext0">
            <span className="grid size-16 place-items-center rounded-circle bg-surface0">
              <FileArchive className="size-7" />
            </span>
            <p className="text-sm font-semibold">{t("archive.empty")}</p>
          </div>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {rows.map(({ node, depth }) => {
            const open = expanded.has(node.path);
            const body = (
              <>
                <span
                  className="flex min-w-0 flex-1 items-center gap-2"
                  style={{ paddingLeft: `${depth * INDENT_REM}rem` }}
                >
                  {node.isDir ? (
                    <ChevronRight
                      className={`size-3.5 shrink-0 text-overlay2 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                      strokeWidth={2.6}
                    />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <FileIcon entry={asEntry(node)} size="size-8" />
                  <span className={`truncate font-semibold ${node.name.startsWith(".") ? "text-muted" : ""}`}>
                    {node.name}
                  </span>
                  {node.link !== undefined && <span className="truncate text-xs text-muted">{node.link}</span>}
                </span>
                <span className="hidden shrink-0 text-sm text-subtext0 tabular-nums sm:block">{node.date}</span>
                <span className="w-20 shrink-0 text-right text-sm text-subtext0 tabular-nums">
                  {node.isDir ? "--" : formatSize(node.size)}
                </span>
              </>
            );
            const row = "flex items-center gap-3 rounded-full py-1 pr-3 pl-2 text-left even:bg-base/60";
            return (
              <li key={node.path}>
                {node.isDir ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => toggle(node.path)}
                    className={`${row} w-full cursor-pointer hover:bg-surface0/70`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={row}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
