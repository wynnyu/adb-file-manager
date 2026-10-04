import { ChevronRight, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { api, type Target } from "../api.ts";
import { arrange, type Sort } from "../entries.ts";
import { formatDate, formatSize } from "../format.ts";
import { useI18n } from "../i18n/index.tsx";
import type { FileEntry, Listing } from "../types.ts";
import { kindLabel } from "../kinds.ts";
import { FileIcon, isPreviewable } from "./FileIcon.tsx";
import { IconButton } from "./ui.tsx";

interface Props {
  target: Target;
  path: string;
  /** raw 属于哪个目录；目录还没加载完时为 null */
  rawDir: string | null;
  /** 当前目录未过滤的列表，存进缓存，往下走一层时上一栏不用重新加载 */
  raw: FileEntry[];
  /** 当前目录过滤、排序后的列表 */
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  cut: Set<string>;
  sort: Sort;
  showHidden: boolean;
  /** 每次刷新 / 增删改后 +1，上层各栏据此重新加载 */
  rev: number;
  /** focus：进入目录后选中这一项，true 为第一项 */
  onNavigate: (p: string, focus?: string | true) => void;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry | null, dir: string) => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

/** 分栏视图：从根目录到当前目录一栏一栏排开，最右边是选中项的预览 */
export function ColumnView(props: Props) {
  const { target, path, rawDir, raw, entries, loading, error, selected, cut, sort, showHidden, rev } = props;
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const [cache, setCache] = useState(() => new Map<string, Listing>());
  const cacheRef = useRef(cache);
  cacheRef.current = cache;
  const inflight = useRef(new Set<string>());

  const columns = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return ["/", ...parts.map((_, i) => "/" + parts.slice(0, i + 1).join("/"))];
  }, [path]);
  const ancestors = columns.slice(0, -1);
  const preview = selected.size === 1 ? entries.find((e) => selected.has(e.path)) : undefined;
  /** 选中的是文件夹时，右边再排一栏列出它的内容（同访达）；选中文件才显示属性 */
  const child = preview?.isDir ? preview.path : null;
  /** 当前目录以外需要另外加载的各栏：上层各栏，加上选中文件夹的下一栏 */
  const othersKey = [...ancestors, ...(child ? [child] : [])].join("\n");

  const put = (dir: string, listing: Listing) =>
    setCache((c) => ((c.get(dir)?.rev ?? -1) > listing.rev ? c : new Map(c).set(dir, listing)));

  // 当前目录加载好了就记下来
  useEffect(() => {
    if (rawDir && !error) put(rawDir, { rev, entries: raw });
  }, [rawDir, raw, error, rev]);

  // 上层各栏和下一栏：缓存里没有或已过期的才去拉
  useEffect(() => {
    for (const dir of othersKey ? othersKey.split("\n") : []) {
      const key = `${dir}@${rev}`;
      if (cacheRef.current.get(dir)?.rev === rev || inflight.current.has(key)) continue;
      inflight.current.add(key);
      api
        .ls(target, dir)
        .then(
          (list) => put(dir, { rev, entries: list }),
          (e: Error) => put(dir, { rev, error: e.message }),
        )
        .finally(() => inflight.current.delete(key));
    }
  }, [othersKey, rev, target]);

  const childListing = child ? cache.get(child) : undefined;
  const childEntries = childListing?.entries ? arrange(childListing.entries, sort, showHidden) : [];

  // 新的一栏出现时滚到最右边
  useLayoutEffect(() => {
    const el = scroller.current;
    el?.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [path, preview?.path]);

  return (
    <div
      ref={scroller}
      className="flex h-[min(68vh,44rem)] min-h-80 overflow-x-auto overflow-y-hidden rounded-[1.75rem] bg-base/60 ring-1 ring-surface0"
    >
      {columns.map((dir, i) => {
        const current = i === columns.length - 1;
        const next = columns[i + 1];
        const listing = cache.get(dir);
        return (
          <Column
            key={dir}
            dir={dir}
            current={current}
            entries={current ? entries : listing?.entries ? arrange(listing.entries, sort, showHidden, "", next) : []}
            loading={current ? loading && entries.length === 0 : !listing}
            error={current ? error : (listing?.error ?? null)}
            emptyText={t("files.empty")}
            activePath={current ? null : next}
            selected={selected}
            cut={cut}
            onRowClick={(entry, e) => {
              // 进入文件夹时选中它的第一项，焦点跟着走
              if (!current) props.onNavigate(entry.isDir ? entry.path : dir, entry.isDir ? true : entry.path);
              else if (entry.isDir && !(e.metaKey || e.ctrlKey || e.shiftKey)) props.onNavigate(entry.path, true);
              else props.onSelect(entry, e);
            }}
            onRowDoubleClick={(entry) => !entry.isDir && props.onOpen(entry)}
            onBackgroundClick={current ? undefined : () => props.onNavigate(dir)}
            onContextMenu={(e, entry) => props.onContextMenu(e, entry, dir)}
          />
        );
      })}
      {child ? (
        <Column
          key={child}
          dir={child}
          current={false}
          entries={childEntries}
          loading={!childListing}
          error={childListing?.error ?? null}
          emptyText={t("files.empty")}
          // 第一项标出焦点，按 → 或点进去就选中它
          activePath={childEntries[0]?.path ?? null}
          selected={selected}
          cut={cut}
          onRowClick={(entry) => props.onNavigate(entry.isDir ? entry.path : child, entry.isDir ? true : entry.path)}
          onRowDoubleClick={(entry) => !entry.isDir && props.onOpen(entry)}
          onBackgroundClick={() => props.onNavigate(child)}
          onContextMenu={(e, entry) => props.onContextMenu(e, entry, child)}
        />
      ) : preview && (
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
  dir: string;
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
      className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-surface0 p-1.5"
    >
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
              <FileIcon entry={entry} size="size-7" />
              <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${!isSel && entry.name.startsWith(".") ? "text-muted" : ""}`}>
                {entry.name}
              </span>
              {entry.isDir && <ChevronRight className={`size-3.5 shrink-0 ${isSel ? "" : "text-overlay1"}`} />}
            </div>
          );
        })
      )}
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
