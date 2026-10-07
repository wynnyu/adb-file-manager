import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { IconButton, spring } from "../../../../components/ui.tsx";
import { useT } from "../../../../i18n/index.tsx";
import { api, formatSize, type Target } from "../../../../lib/index.ts";
import type { FileEntry } from "../../../../types.ts";
import type { MediaPlayer } from "../../hooks/index.ts";
import { viewerKind } from "../../lib/index.ts";
import { FileIcon } from "../views/index.ts";
import { ArchiveView } from "./ArchiveView.tsx";
import { AudioPlayer } from "./AudioPlayer.tsx";
import { ImageViewer } from "./ImageViewer.tsx";
import { TextViewer } from "./TextViewer.tsx";
import { VideoPlayer } from "./VideoPlayer.tsx";

interface Props {
  target: Target;
  entry: FileEntry;
  /** 在可切换的文件中的位置，从 0 开始；不在其中时为 -1，不显示位置 */
  index: number;
  count: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 视频、音频的播放状态，由 App 中的 useMediaPlayer 提供 */
  media: MediaPlayer;
  onStep: (delta: 1 | -1) => void;
  onClose: () => void;
  onDownload: (entry: FileEntry) => void;
}

/** 页面内查看器：铺满窗口的遮罩，按文件类型显示图片、视频、音频、压缩包内容或文本 */
export function Viewer({ target, entry, index, count, hasPrev, hasNext, media, onStep, onClose, onDownload }: Props) {
  const t = useT();
  const kind = viewerKind(entry);
  const src = api.previewUrl(target, entry.path);
  const download = () => onDownload(entry);
  // 键盘监听只注册一次，通过 ref 读取最新的回调
  const latest = useRef({ hasPrev, hasNext, onStep, onClose });
  latest.current = { hasPrev, hasNext, onStep, onClose };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 已被处理的按键不再响应，例如搜索面板中的 Esc 只关闭面板
      if (e.defaultPrevented) return;
      const c = latest.current;
      // 全屏时 Esc 由浏览器退出全屏
      if (e.key === "Escape" && !document.fullscreenElement) {
        e.preventDefault();
        c.onClose();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // 焦点在进度条或音量滑块上时，方向键由滑块自己处理
        if ((e.target as HTMLElement).closest("input")) return;
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        if (delta > 0 ? c.hasNext : c.hasPrev) c.onStep(delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={entry.name}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-40 flex flex-col bg-crust/85 backdrop-blur-md"
    >
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="flex shrink-0 items-center gap-3 px-3 py-3 sm:px-5"
      >
        <FileIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold">{entry.name}</h2>
          <p className="flex gap-3 text-xs font-medium text-muted tabular-nums">
            {index >= 0 && <span>{t("viewer.position", { i: index + 1, n: count })}</span>}
            <span>{formatSize(entry.size)}</span>
          </p>
        </div>
        <IconButton tone="ghost" title={t("viewer.prev")} disabled={!hasPrev} onClick={() => onStep(-1)}>
          <ChevronLeft className="size-5" />
        </IconButton>
        <IconButton tone="ghost" title={t("viewer.next")} disabled={!hasNext} onClick={() => onStep(1)}>
          <ChevronRight className="size-5" />
        </IconButton>
        <IconButton tone="ghost" title={t("files.download")} onClick={download}>
          <Download className="size-5" />
        </IconButton>
        <IconButton title={t("viewer.close")} onClick={onClose}>
          <X className="size-5" />
        </IconButton>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
        transition={spring}
        className="relative min-h-0 flex-1 px-3 pb-3 sm:px-5 sm:pb-5"
      >
        {/* key 为路径：切换文件时子组件完全重置 */}
        {kind === "image" ? (
          <ImageViewer key={entry.path} entry={entry} src={src} onDownload={download} />
        ) : kind === "video" ? (
          <VideoPlayer key={entry.path} entry={entry} src={src} player={media} onDownload={download} />
        ) : kind === "audio" ? (
          <AudioPlayer key={entry.path} entry={entry} src={src} player={media} onDownload={download} />
        ) : kind === "archive" ? (
          <ArchiveView key={entry.path} target={target} entry={entry} onDownload={download} />
        ) : (
          <TextViewer key={entry.path} target={target} entry={entry} onDownload={download} />
        )}
      </motion.div>
    </motion.div>
  );
}
