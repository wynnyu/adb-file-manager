import { ChevronRight, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { type MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { api, type Target } from "../../lib/api.ts";
import { arrange, type Sort } from "../../lib/entries.ts";
import { formatDate, formatSize } from "../../lib/format.ts";
import { kindLabel } from "../../lib/kinds.ts";
import type { FileEntry, Listing } from "../../types.ts";
import { IconButton } from "../ui.tsx";
import { FileIcon, isPreviewable } from "./FileIcon.tsx";

interface Props {
  target: Target;
  /** 当前目录：选中的条目在这一栏里 */
  path: string;
  /** 当前目录过滤、排序后的列表 */
  entries: FileEntry[];
  /** 其他各栏的列表，由上层按需加载 */
  dirs: Map<string, Listing>;
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  cut: Set<string>;
  sort: Sort;
  showHidden: boolean;
  /** focus：进入目录后选中这一项，true 为第一项 */
  onNavigate: (p: string, focus?: string | true) => void;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry | null, dir: string) => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

/**
 * 分栏视图：从根目录到当前目录一栏一栏排开，行为照着访达：
 * 单击只是选中，选中文件夹时右边多一栏列出它的内容，选中文件时显示详情；
 * 点别的栏里的条目就把选择移到那一栏，它右边的栏跟着换掉；右方向键进入选中的文件夹，左方向键回到上一栏
 */
export function ColumnView(props: Props) {
  const { target, path, entries, dirs, loading, error, selected, cut, sort, showHidden } = props;
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);

  const columns = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return ["/", ...parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"))];
  }, [path]);
  const preview = selected.size === 1 ? entries.find((e) => selected.has(e.path)) : undefined;
  /** 选中的是文件夹时，右边再排一栏列出它的内容；选中文件才显示详情 */
  const child = preview?.isDir ? preview.path : null;

  /** 点某一栏里的条目：当前栏照常选择（支持 Cmd / Ctrl 和 Shift 多选），别的栏把选择移过去 */
  const pick = (dir: string, entry: FileEntry, e: MouseEvent) => {
    if (dir === path) props.onSelect(entry, e);
    else props.onNavigate(dir, entry.path);
  };
  /** 双击文件夹进入它并选中第一项，同右方向键；双击文件打开 */
  const open = (entry: FileEntry) => (entry.isDir ? props.onNavigate(entry.path, true) : props.onOpen(entry));

  // 新的一栏出现时滚到最右边
  // biome-ignore lint/correctness/useExhaustiveDependencies: path 和 preview 路径是触发条件，变了就要滚动
  useLayoutEffect(() => {
    const el = scroller.current;
    el?.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [path, preview?.path]);

  return (
    <div
      ref={scroller}
      className="flex h-[min(68vh,44rem)] min-h-80 overflow-x-auto overflow-y-hidden rounded-[1.75rem] bg-base/60 ring-1 ring-surface0"
    >
      {/* 下一栏和其他栏放在同一个数组里，进入它时同一个组件接着用，不会重新淡入 */}
      {(child ? [...columns, child] : columns).map((dir, i, all) => {
        const current = dir === path;
        const next = all[i + 1];
        const listing = dirs.get(dir);
        return (
          <Column
            key={dir}
            current={current}
            entries={current ? entries : listing?.entries ? arrange(listing.entries, sort, showHidden, "", next) : []}
            loading={current ? loading : !listing}
            error={current ? error : (listing?.error ?? null)}
            emptyText={t("files.empty")}
            activePath={current ? null : (next ?? null)}
            selected={selected}
            cut={cut}
            onRowClick={(entry, e) => pick(dir, entry, e)}
            onRowDoubleClick={open}
            onBackgroundClick={current ? undefined : () => props.onNavigate(dir)}
            onContextMenu={(e, entry) => props.onContextMenu(e, entry, dir)}
          />
        );
      })}
      {!child && preview && (
        <Preview
          key={preview.path}
          target={target}
          entry={preview}
          onDownload={props.onDownload}
          onRename={props.onRename}
          onDelete={props.onDelete}
        />
      )}
      {/* 余下的空白：点了取消选择、右键是当前目录的菜单，交给外层处理 */}
      <div className="min-w-4 flex-1" />
    </div>
  );
}

interface ColumnProps {
  current: boolean;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  /** 上层栏里路径经过的那一项 */
  activePath: string | null;
  selected: Set<string>;
  cut: Set<string>;
  onRowClick: (entry: FileEntry, e: MouseEvent) => void;
  onRowDoubleClick: (entry: FileEntry) => void;
  onBackgroundClick?: () => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry | null) => void;
}

function Column(p: ColumnProps) {
  const activeRow = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: activePath 和 loading 是触发条件，变了就要滚动
  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest" });
  }, [p.activePath, p.loading]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => {
        if (!p.onBackgroundClick || (e.target as HTMLElement).closest("[data-entry]")) return;
        e.stopPropagation();
        p.onBackgroundClick();
      }}
      onContextMenu={(e) => {
        e.stopPropagation();
        p.onContextMenu(e, null);
      }}
      className="flex w-60 shrink-0 flex-col border-r border-surface0 py-2"
    >
      {/* 滚动区上下内缩，滚出去的行被直线截断而不是进入外框圆角；左右内边距让行与圆角同心 */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {p.error ? (
          <p className="m-2 rounded-2xl bg-red/15 px-3 py-2 text-xs text-red wrap-anywhere">{p.error}</p>
        ) : p.loading ? (
          <div className="flex justify-center py-10 text-muted">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : p.entries.length === 0 ? (
          <p className="px-3 py-10 text-center text-xs text-muted">{p.emptyText}</p>
        ) : (
          p.entries.map((entry) => {
            const onPath = entry.path === p.activePath;
            const isSel = p.current && p.selected.has(entry.path);
            return (
              <div
                key={entry.path}
                ref={onPath ? activeRow : undefined}
                data-entry={entry.path}
                title={entry.name}
                onClick={(e) => p.onRowClick(entry, e)}
                onDoubleClick={() => p.onRowDoubleClick(entry)}
                onContextMenu={(e) => {
                  e.stopPropagation();
                  p.onContextMenu(e, entry);
                }}
                className={`flex h-9 shrink-0 cursor-default items-center gap-2 rounded-full pr-2 pl-1 transition-colors select-none ${
                  isSel ? "bg-accent text-on-accent" : onPath ? "bg-surface1" : "hover:bg-surface0/70"
                } ${p.cut.has(entry.path) ? "opacity-50" : ""}`}
              >
                <FileIcon entry={entry} size="size-7" onAccent={isSel} />
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-semibold ${!isSel && entry.name.startsWith(".") ? "text-muted" : ""}`}
                >
                  {entry.name}
                </span>
                {entry.isDir && <ChevronRight className={`size-3.5 shrink-0 ${isSel ? "" : "text-overlay1"}`} />}
              </div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

function Preview({
  target,
  entry,
  onDownload,
  onRename,
  onDelete,
}: {
  target: Target;
  entry: FileEntry;
  onDownload: (e: FileEntry) => void;
  onRename: (e: FileEntry) => void;
  onDelete: (e: FileEntry) => void;
}) {
  const { t, lang } = useI18n();
  const [img, setImg] = useState<"loading" | "ok" | "failed">(isPreviewable(entry) ? "loading" : "failed");
  const kind = kindLabel(entry, t);

  return (
    <motion.aside
      data-entry=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex w-72 shrink-0 flex-col items-center gap-4 overflow-y-auto border-r border-surface0 p-5"
    >
      <div className="relative grid h-44 w-full shrink-0 place-items-center">
        {img !== "ok" && <FileIcon entry={entry} size="size-28" stroke={1.6} />}
        {img === "loading" && <Loader2 className="absolute size-6 animate-spin text-muted" />}
        {img !== "failed" && (
          <img
            src={api.previewUrl(target, entry.path)}
            alt=""
            onLoad={() => setImg("ok")}
            onError={() => setImg("failed")}
            // 绝对定位才能让 max-h-full 按这块固定高度算；放在网格里百分比高度不生效，大图会溢出盖住下面的信息
            className={`absolute inset-0 m-auto max-h-full max-w-full rounded-2xl shadow-lg shadow-crust/40 ${img === "ok" ? "" : "hidden"}`}
          />
        )}
      </div>
      <div className="w-full text-center">
        <p className="font-bold break-all">{entry.name}</p>
        <p className="mt-0.5 text-xs text-muted">{kind}</p>
      </div>
      <dl className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-2xl bg-mantle/70 p-3 text-xs">
        <dt className="text-muted">{t("preview.kind")}</dt>
        <dd>{kind}</dd>
        {!entry.isDir && (
          <>
            <dt className="text-muted">{t("preview.size")}</dt>
            <dd className="font-mono">
              {formatSize(entry.size)}
              {entry.size >= 1024 && <span className="text-muted"> ({entry.size.toLocaleString()} B)</span>}
            </dd>
          </>
        )}
        <dt className="text-muted">{t("preview.mtime")}</dt>
        <dd>{formatDate(entry.mtime, lang, t, true)}</dd>
        <dt className="text-muted">{t("preview.path")}</dt>
        <dd className="font-mono break-all">{entry.path}</dd>
      </dl>
      <div className="flex gap-2">
        <IconButton title={t("files.download")} onClick={() => onDownload(entry)}>
          <Download className="size-4" />
        </IconButton>
        <IconButton title={t("files.rename")} onClick={() => onRename(entry)}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton tone="danger" title={t("files.delete")} onClick={() => onDelete(entry)}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </motion.aside>
  );
}
