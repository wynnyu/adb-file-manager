import {
  ArrowDown,
  Check,
  ChevronRight,
  CornerLeftUp,
  Download,
  FolderOpen,
  Loader2,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MouseEvent, ReactNode } from "react";
import { useI18n } from "../../i18n/index.tsx";
import type { Sort, SortKey } from "../../lib/entries.ts";
import { formatDate, formatSize } from "../../lib/format.ts";
import { kindLabel } from "../../lib/kinds.ts";
import type { FileEntry, TreeRow } from "../../types.ts";
import { IconButton, spring, springPop } from "../ui.tsx";
import { FileIcon } from "./FileIcon.tsx";

/** 列的顺序同访达：名称、修改日期、大小、种类；窄屏只留名称 */
const cols =
  "grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_11rem_5.5rem] lg:grid-cols-[minmax(0,1fr)_11rem_5.5rem_9.5rem] items-center gap-2";
const rowBase = "group cursor-default rounded-full py-1.5 pr-2 pl-1.5 transition-colors select-none";
/** 每深一层名称往右缩进的距离 */
const INDENT_REM = 1.5;

interface Props {
  /** 当前目录，切换目录时重新播放进场动画 */
  dir: string;
  /** 当前目录的条目，加上展开的文件夹里的条目（同访达的展开三角） */
  rows: TreeRow[];
  /** 展开了的文件夹 */
  expanded: Set<string>;
  /** 展开了但内容还没加载好的文件夹 */
  pending: Set<string>;
  onToggleExpand: (entry: FileEntry) => void;
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  /** 剪切板里待移动的条目，半透明显示 */
  cut: Set<string>;
  sort: Sort;
  onSort: (key: SortKey) => void;
  onUp?: () => void;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  onToggle: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry) => void;
}

function SortHeader({
  label,
  k,
  sort,
  onSort,
  className = "",
}: {
  label: string;
  k: SortKey;
  sort: Sort;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      className={`flex h-8 items-center gap-1 rounded-full px-3 transition-colors hover:bg-surface0 ${active ? "text-accent" : ""} ${className}`}
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

export function Placeholder({
  icon,
  text,
  tone = "bg-surface0 text-muted",
}: {
  icon: ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <span className={`grid size-16 place-items-center rounded-[50%] ${tone}`}>{icon}</span>
      <p className="max-w-md font-semibold">{text}</p>
    </motion.div>
  );
}

export function FileList(props: Props) {
  const { dir, rows, expanded, pending, loading, error, selected, cut, sort, onSort, onUp } = props;
  const { t, lang } = useI18n();
  const animateLayout = rows.length <= 200;

  return (
    <div className="flex flex-col gap-1">
      <div className={`${cols} border-b border-surface0 px-2 pb-1 text-xs font-bold text-muted`}>
        <SortHeader
          label={t("files.name")}
          k="name"
          sort={sort}
          onSort={onSort}
          className="justify-self-start pl-[4.75rem]"
        />
        <SortHeader
          label={t("files.mtime")}
          k="mtime"
          sort={sort}
          onSort={onSort}
          className="hidden justify-self-start sm:flex"
        />
        <SortHeader
          label={t("files.size")}
          k="size"
          sort={sort}
          onSort={onSort}
          className="hidden justify-self-end sm:flex"
        />
        <SortHeader
          label={t("files.kind")}
          k="kind"
          sort={sort}
          onSort={onSort}
          className="hidden justify-self-start lg:flex"
        />
      </div>

      {onUp && (
        <div
          onClick={onUp}
          title={t("files.goUp")}
          className={`${rowBase} ${cols} cursor-pointer hover:bg-surface0/70`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="-mr-2 w-4 shrink-0" />
            <span className="grid size-10 shrink-0 place-items-center rounded-[50%] bg-surface0 text-subtext0 transition-colors group-hover:bg-accent/15 group-hover:text-accent">
              <CornerLeftUp className="size-[45%]" strokeWidth={2.4} />
            </span>
            <span className="font-mono font-semibold text-subtext1">..</span>
            <span className="hidden text-xs text-muted transition-opacity group-hover:opacity-100 sm:inline sm:opacity-0">
              {t("files.goUp")}
            </span>
          </div>
        </div>
      )}

      {error ? (
        <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />
      ) : (
        <div key={dir} className="flex flex-col gap-1">
          {loading && rows.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.15 } }}
              className="flex justify-center py-20 text-muted"
            >
              <Loader2 className="size-7 animate-spin" />
            </motion.div>
          )}

          {!loading && rows.length === 0 && (
            <Placeholder icon={<FolderOpen className="size-7" />} text={t("files.empty")} />
          )}

          <AnimatePresence mode="popLayout">
            {rows.map((row) => {
              if (!("entry" in row)) {
                return (
                  <motion.p
                    key={row.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ paddingLeft: `${row.depth * INDENT_REM + 4.75}rem` }}
                    className="truncate py-1 text-xs text-red"
                  >
                    {row.note}
                  </motion.p>
                );
              }
              const { entry, depth } = row;
              const isSel = selected.has(entry.path);
              const open = entry.isDir && expanded.has(entry.path);
              return (
                <motion.div
                  key={entry.path}
                  data-entry={entry.path}
                  layout={animateLayout ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: 0.12 } }}
                  exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.2 } }}
                  transition={spring}
                  onClick={(e) => props.onSelect(entry, e)}
                  onDoubleClick={() => props.onOpen(entry)}
                  onContextMenu={(e) => props.onContextMenu(e, entry)}
                  className={`${rowBase} ${cols} ${isSel ? "bg-accent/15 ring-1 ring-accent/40" : "even:bg-base/60 hover:bg-surface0/70"} ${
                    cut.has(entry.path) ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3" style={{ paddingLeft: `${depth * INDENT_REM}rem` }}>
                    {/* 展开三角：只展开 / 收起，不改变选择 */}
                    {entry.isDir ? (
                      <button
                        type="button"
                        title={t(open ? "files.collapse" : "files.expand")}
                        aria-label={t(open ? "files.collapse" : "files.expand")}
                        aria-expanded={open}
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onToggleExpand(entry);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`-mr-2 grid h-8 w-4 shrink-0 place-items-center rounded-full ${isSel ? "" : "text-overlay2 hover:text-text"}`}
                      >
                        {pending.has(entry.path) ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <ChevronRight
                            className={`size-3.5 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                            strokeWidth={2.6}
                          />
                        )}
                      </button>
                    ) : (
                      <span className="-mr-2 w-4 shrink-0" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onToggle(entry);
                      }}
                      className="relative shrink-0"
                      title={t("files.select")}
                      aria-label={t("files.select")}
                    >
                      <FileIcon entry={entry} />
                      {!isSel && (
                        <span className="absolute inset-0 grid place-items-center rounded-[50%] bg-accent/80 text-on-accent opacity-0 transition-opacity hover:opacity-70">
                          <Check className="size-5" strokeWidth={3} />
                        </span>
                      )}
                      <AnimatePresence>
                        {isSel && (
                          <motion.span
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0, rotate: 90, transition: { duration: 0.15 } }}
                            transition={springPop}
                            className="absolute inset-0 grid place-items-center rounded-[50%] bg-accent text-on-accent"
                          >
                            <Check className="size-5" strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </button>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-semibold ${entry.name.startsWith(".") ? "text-muted" : ""}`}
                      >
                        {entry.name}
                      </span>
                      <span className="block truncate text-xs text-muted sm:hidden">
                        {entry.isDir ? kindLabel(entry, t) : formatSize(entry.size)}, {formatDate(entry.mtime, lang, t)}
                      </span>
                    </span>
                    {/* 快捷操作：窄屏常驻，宽屏悬停时才出现，不占列 */}
                    <div
                      className="flex shrink-0 gap-1 sm:hidden sm:group-hover:flex"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <IconButton
                        tone="ghost"
                        className="size-9"
                        title={t("files.download")}
                        onClick={() => props.onDownload(entry)}
                      >
                        <Download className="size-4" />
                      </IconButton>
                      <IconButton
                        tone="ghost"
                        className="size-9"
                        title={t("files.rename")}
                        onClick={() => props.onRename(entry)}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton
                        tone="ghost-danger"
                        className="size-9"
                        title={t("files.delete")}
                        onClick={() => props.onDelete(entry)}
                      >
                        <Trash2 className="size-4" />
                      </IconButton>
                    </div>
                  </div>
                  <span className="hidden truncate px-3 text-sm text-subtext0 tabular-nums sm:block">
                    {formatDate(entry.mtime, lang, t)}
                  </span>
                  <span className="hidden px-3 text-right text-sm text-subtext0 tabular-nums sm:block">
                    {entry.isDir ? "--" : formatSize(entry.size)}
                  </span>
                  <span className="hidden truncate px-3 text-sm text-subtext0 lg:block">{kindLabel(entry, t)}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
