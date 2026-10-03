import { ArrowDown, Check, CornerLeftUp, Download, FolderOpen, Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { formatSize, formatTime } from "../format.ts";
import type { FileEntry } from "../types.ts";
import { FileIcon } from "./FileIcon.tsx";
import { IconButton, spring } from "./ui.tsx";

export type SortKey = "name" | "size" | "mtime";
export interface Sort {
  key: SortKey;
  asc: boolean;
}

const cols = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_6.5rem_10.5rem_auto] items-center gap-3";
const rowBase = "group cursor-default rounded-full py-1.5 pr-2 pl-1.5 transition-colors select-none";

interface Props {
  /** 当前目录，切换目录时重新播放进场动画 */
  dir: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onUp?: () => void;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  onToggle: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

function SortHeader({ label, k, sort, onSort, className = "" }: { label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; className?: string }) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`flex h-8 items-center gap-1 rounded-full px-3 transition-colors hover:bg-surface0 ${active ? "text-mauve" : ""} ${className}`}
    >
      {label}
      <AnimatePresence initial={false}>
        {active && (
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, rotate: sort.asc ? 180 : 0 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={spring}
          >
            <ArrowDown className="size-3" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function Placeholder({ icon, text, tone = "bg-surface0 text-overlay1" }: { icon: ReactNode; text: string; tone?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: 0.1 }}
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <motion.span
        initial={{ scale: 0.4, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.12 }}
        className={`grid size-16 place-items-center rounded-[50%] ${tone}`}
      >
        {icon}
      </motion.span>
      <p className="max-w-md font-semibold">{text}</p>
    </motion.div>
  );
}

export function FileList(props: Props) {
  const { dir, entries, loading, error, selected, sort, onSort, onUp } = props;
  const animateLayout = entries.length <= 200;

  return (
    <div className="flex flex-col gap-1">
      <div className={`${cols} px-2 text-xs font-bold tracking-wide text-overlay1 uppercase`}>
        <SortHeader label="名称" k="name" sort={sort} onSort={onSort} className="justify-self-start pl-14" />
        <SortHeader label="大小" k="size" sort={sort} onSort={onSort} className="hidden justify-self-end sm:flex" />
        <SortHeader label="修改时间" k="mtime" sort={sort} onSort={onSort} className="hidden sm:flex" />
        <span className="w-[8.5rem]" />
      </div>

      {onUp && (
        <motion.div
          key={`up:${dir}`}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring}
          onClick={onUp}
          title="返回上一级"
          className={`${rowBase} ${cols} cursor-pointer hover:bg-surface0/70`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-[50%] bg-surface0 text-subtext0 transition-[color,background-color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:bg-mauve/15 group-hover:text-mauve"
            >
              <CornerLeftUp className="size-[45%]" strokeWidth={2.4} />
            </span>
            <span className="font-mono font-semibold text-subtext1">..</span>
            <span className="hidden text-xs text-overlay0 transition-opacity group-hover:opacity-100 sm:inline sm:opacity-0">返回上一级</span>
          </div>
        </motion.div>
      )}

      {error ? (
        <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />
      ) : (
        <div key={dir} className="flex flex-col gap-1">
          {loading && entries.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.15 } }} className="flex justify-center py-20 text-overlay1">
              <Loader2 className="size-7 animate-spin" />
            </motion.div>
          )}

          {!loading && entries.length === 0 && (
            <Placeholder icon={<FolderOpen className="size-7" />} text="空文件夹 · 把文件拖到这里上传" />
          )}

          <AnimatePresence mode="popLayout">
            {entries.map((entry, i) => {
              const isSel = selected.has(entry.path);
              return (
                <motion.div
                  key={entry.path}
                  layout={animateLayout ? "position" : false}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring, delay: Math.min(i, 24) * 0.018 } }}
                  exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.2 } }}
                  transition={spring}
                  onClick={(e) => props.onSelect(entry, e)}
                  onDoubleClick={() => props.onOpen(entry)}
                  className={`${rowBase} ${cols} ${isSel ? "bg-mauve/15 ring-1 ring-mauve/40" : "hover:bg-surface0/70"}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onToggle(entry);
                      }}
                      className="relative shrink-0 transition-transform duration-300 group-hover:scale-105"
                      title="选择"
                    >
                      <FileIcon entry={entry} />
                      {!isSel && (
                        <span className="absolute inset-0 grid place-items-center rounded-[50%] bg-mauve/80 text-crust opacity-0 transition-opacity hover:opacity-70">
                          <Check className="size-5" strokeWidth={3} />
                        </span>
                      )}
                      <AnimatePresence>
                        {isSel && (
                          <motion.span
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90, transition: { duration: 0.15 } }}
                            transition={{ type: "spring", stiffness: 600, damping: 22 }}
                            className="absolute inset-0 grid place-items-center rounded-[50%] bg-mauve text-crust"
                          >
                            <Check className="size-5" strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                    <span className="min-w-0">
                      <span className={`block truncate font-semibold ${entry.name.startsWith(".") ? "text-overlay2" : ""}`}>
                        {entry.name}
                      </span>
                      <span className="block truncate text-xs text-overlay1 sm:hidden">
                        {entry.isDir ? "文件夹" : formatSize(entry.size)} · {formatTime(entry.mtime)}
                      </span>
                    </span>
                  </div>
                  <span className="hidden pr-3 text-right font-mono text-sm text-subtext0 sm:block">
                    {entry.isDir ? "—" : formatSize(entry.size)}
                  </span>
                  <span className="hidden px-3 font-mono text-sm text-subtext0 sm:block">{formatTime(entry.mtime)}</span>
                  <div
                    className="flex w-[8.5rem] justify-end gap-1 transition-[opacity,transform] duration-200 sm:translate-x-2 sm:opacity-0 sm:group-hover:translate-x-0 sm:group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <IconButton tone="ghost" className="size-9" title="下载到电脑" onClick={() => props.onDownload(entry)}>
                      <Download className="size-4" />
                    </IconButton>
                    <IconButton tone="ghost" className="size-9" title="重命名" onClick={() => props.onRename(entry)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton tone="ghost" className="size-9 hover:!bg-red/15 hover:!text-red" title="删除" onClick={() => props.onDelete(entry)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
