import { Download, FolderOpen, Loader2, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { Lang } from "../../i18n/index.tsx";
import { useI18n } from "../../i18n/index.tsx";
import { api, formatDate, formatSize, kindLabel, type Target } from "../../lib/index.ts";
import type { FileEntry } from "../../types.ts";
import { IconButton } from "../ui.tsx";
import { FileIcon, isPreviewable } from "./FileIcon.tsx";
import { Placeholder } from "./FileList.tsx";

interface Props {
  target: Target;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  cut: Set<string>;
  /** 最近点选的那一项，放在舞台上；为空时退回到选择里的第一项 */
  focused: string | null;
  onSelect: (entry: FileEntry, e: MouseEvent) => void;
  /** 只选中这一项（进目录后默认选中第一项） */
  onFocus: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (e: MouseEvent, entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
}

/** 画廊视图：上面是选中项的大预览，下面一排缩略图，右边是信息面板（同访达） */
export function GalleryView(props: Props) {
  const { target, entries, loading, error, selected, cut, focused } = props;
  const { t, lang } = useI18n();
  const strip = useRef<HTMLDivElement>(null);
  const current =
    (focused && selected.has(focused) ? entries.find((e) => e.path === focused) : undefined) ??
    entries.find((e) => selected.has(e.path));

  // 画廊里总有一项在舞台上：没选中任何东西时选中第一项
  // biome-ignore lint/correctness/useExhaustiveDependencies: props.onFocus 每次渲染都是新函数，只在选中状态变化时才触发
  useEffect(() => {
    if (!current && !loading && entries.length) props.onFocus(entries[0]);
  }, [current, loading, entries]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在选中项的路径变化时才滚动，current 对象本身会随列表刷新而变
  useEffect(() => {
    const el = strip.current;
    const item = current && el?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(current.path)}"]`);
    // 只滚缩略图条本身；scrollIntoView 会连带滚动整个页面
    if (el && item)
      el.scrollTo({ left: item.offsetLeft - (el.clientWidth - item.offsetWidth) / 2, behavior: "smooth" });
  }, [current?.path]);

  // 竖向滚轮也能横向翻缩略图
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      data-entry=""
      className="flex h-[min(68vh,44rem)] min-h-96 overflow-hidden rounded-[1.75rem] bg-base/60 ring-1 ring-surface0"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center p-6">
          {error ? (
            <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />
          ) : loading && entries.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.15 } }}
              className="text-muted"
            >
              <Loader2 className="size-7 animate-spin" />
            </motion.div>
          ) : entries.length === 0 ? (
            <Placeholder icon={<FolderOpen className="size-7" />} text={t("files.empty")} />
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              {current && (
                <motion.div
                  key={current.path}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  onDoubleClick={() => props.onOpen(current)}
                  onContextMenu={(e) => props.onContextMenu(e, current)}
                  className={`flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 ${cut.has(current.path) ? "opacity-50" : ""}`}
                >
                  <Thumb
                    target={target}
                    entry={current}
                    className="min-h-0 w-full flex-1"
                    imgClass="absolute inset-0 m-auto max-h-full max-w-full rounded-2xl shadow-xl shadow-crust/40"
                    icon={<FileIcon entry={current} size="size-36 sm:size-48 lg:size-56" stroke={1.4} />}
                  />
                  {/* 窄屏没有信息面板，名字写在预览下面 */}
                  <p className="max-w-full truncate text-center text-sm font-semibold md:hidden">
                    {current.name}
                    <span className="ml-2 font-normal text-muted">
                      {current.isDir ? kindLabel(current, t) : formatSize(current.size)}
                    </span>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        <div
          ref={strip}
          className="relative flex h-28 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden px-3 [scrollbar-width:thin]"
        >
          {entries.map((entry) => {
            const isCurrent = entry.path === current?.path;
            const isSel = selected.has(entry.path);
            return (
              <div
                key={entry.path}
                data-entry={entry.path}
                title={entry.name}
                onClick={(e) => props.onSelect(entry, e)}
                onDoubleClick={() => props.onOpen(entry)}
                onContextMenu={(e) => props.onContextMenu(e, entry)}
                className={`grid size-20 shrink-0 cursor-default place-items-center overflow-hidden rounded-2xl p-1.5 transition-colors select-none ${
                  isCurrent
                    ? "bg-surface1 ring-2 ring-accent"
                    : isSel
                      ? "bg-surface1/70 ring-1 ring-accent/50"
                      : "hover:bg-surface0/70"
                } ${cut.has(entry.path) ? "opacity-50" : ""}`}
              >
                <Thumb
                  target={target}
                  entry={entry}
                  lazy
                  className="size-full"
                  imgClass="absolute inset-0 size-full rounded-xl object-cover"
                  icon={<FileIcon entry={entry} size="size-14" stroke={1.8} />}
                />
              </div>
            );
          })}
        </div>
      </div>

      {current && (
        <Info
          entry={current}
          lang={lang}
          onDownload={props.onDownload}
          onRename={props.onRename}
          onDelete={props.onDelete}
        />
      )}
    </div>
  );
}

/** 能预览的图片显示图片，加载完之前和失败时显示文件图标 */
function Thumb({
  target,
  entry,
  lazy = false,
  className,
  imgClass,
  icon,
}: {
  target: Target;
  entry: FileEntry;
  lazy?: boolean;
  className: string;
  imgClass: string;
  icon: ReactNode;
}) {
  const [img, setImg] = useState<"loading" | "ok" | "failed">(isPreviewable(entry) ? "loading" : "failed");
  return (
    <div className={`relative grid place-items-center ${className}`}>
      {img !== "ok" && icon}
      {img === "loading" && !lazy && <Loader2 className="absolute size-6 animate-spin text-muted" />}
      {img !== "failed" && (
        <img
          src={api.previewUrl(target, entry.path)}
          alt=""
          loading={lazy ? "lazy" : undefined}
          draggable={false}
          onLoad={() => setImg("ok")}
          onError={() => setImg("failed")}
          className={img === "ok" ? imgClass : "absolute inset-0 size-full opacity-0"}
        />
      )}
    </div>
  );
}

function Info({
  entry,
  lang,
  onDownload,
  onRename,
  onDelete,
}: Pick<Props, "onDownload" | "onRename" | "onDelete"> & { entry: FileEntry; lang: Lang }) {
  const { t } = useI18n();
  const kind = kindLabel(entry, t);
  const rows: [string, string, string?][] = [
    [t("gallery.mtime"), formatDate(entry.mtime, lang, t, true)],
    [t("gallery.atime"), formatDate(entry.atime, lang, t, true)],
  ];
  if (!entry.isDir && entry.size >= 1024)
    rows.push([t("preview.size"), t("gallery.bytes", { n: entry.size.toLocaleString() })]);
  rows.push([t("gallery.where"), entry.path, "font-mono break-all text-left"]);

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l border-surface0 p-5 md:flex">
      <div className="flex items-center gap-3">
        <FileIcon entry={entry} size="size-14" stroke={1.8} />
        <div className="min-w-0">
          <p className="font-bold break-all">{entry.name}</p>
          <p className="text-xs text-muted">
            {kind}
            {!entry.isDir && ` - ${formatSize(entry.size)}`}
          </p>
        </div>
      </div>

      <section>
        <h3 className="mb-1 text-sm font-bold">{t("gallery.info")}</h3>
        <dl className="text-xs">
          {rows.map(([label, value, cls]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-surface0 py-2 last:border-0">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className={`min-w-0 text-right font-semibold ${cls ?? ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-auto flex justify-center gap-2">
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
    </aside>
  );
}
