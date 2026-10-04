import { FolderOpen, Loader2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent } from "react";
import { formatDate, formatSize } from "../format.ts";
import { kindLabel } from "../kinds.ts";
import { useI18n } from "../i18n/index.tsx";
import type { FileEntry } from "../types.ts";
import { FileIcon } from "./FileIcon.tsx";
import { Placeholder } from "./FileList.tsx";
import { spring } from "./ui.tsx";

interface Props {
  dir: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  cut: Set<string>;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry) => void;
}

/** 图标视图：Finder 式大图标网格，选中时图标加底、文件名变成主色胶囊 */
export function IconGrid({ dir, entries, loading, error, selected, cut, onSelect, onOpen, onContextMenu }: Props) {
  const { t, lang } = useI18n();
  const animateLayout = entries.length <= 200;

  if (error) return <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />;

  return (
    <div key={dir}>
      {loading && entries.length === 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.15 } }} className="flex justify-center py-20 text-muted">
          <Loader2 className="size-7 animate-spin" />
        </motion.div>
      )}
      {!loading && entries.length === 0 && <Placeholder icon={<FolderOpen className="size-7" />} text={t("files.empty")} />}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]">
        <AnimatePresence mode="popLayout">
          {entries.map((entry) => {
            const isSel = selected.has(entry.path);
            return (
              <motion.div
                key={entry.path}
                data-entry={entry.path}
                layout={animateLayout ? "position" : false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.12 } }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
                transition={spring}
                onClick={(e) => onSelect(entry, e)}
                onDoubleClick={() => onOpen(entry)}
                onContextMenu={(e) => onContextMenu(e, entry)}
                title={`${entry.name}\n${entry.isDir ? kindLabel(entry, t) : `${kindLabel(entry, t)} · ${formatSize(entry.size)}`}\n${formatDate(entry.mtime, lang, t)}`}
                className={`group flex cursor-default flex-col items-center gap-1.5 rounded-[1.75rem] px-2 pt-3 pb-2.5 select-none ${
                  cut.has(entry.path) ? "opacity-50" : ""
                }`}
              >
                <span
                  className={`grid place-items-center rounded-[1.5rem] p-1.5 transition-colors ${
                    isSel ? "bg-surface1/80" : "group-hover:bg-surface0/70"
                  }`}
                >
                  <FileIcon entry={entry} size="size-16" stroke={1.8} />
                </span>
                <span
                  className={`line-clamp-2 max-w-full rounded-xl px-2 py-0.5 text-center text-sm leading-snug font-semibold break-all transition-colors ${
                    isSel ? "bg-accent text-on-accent" : entry.name.startsWith(".") ? "text-muted" : ""
                  }`}
                >
                  {entry.name}
                </span>
                {!entry.isDir && <span className="font-mono text-[11px] text-muted">{formatSize(entry.size)}</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
