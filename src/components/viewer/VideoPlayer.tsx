import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaPlayer } from "../../hooks/useMediaPlayer.ts";
import { useT } from "../../i18n/index.tsx";
import type { FileEntry } from "../../types.ts";
import { spring } from "../ui.tsx";
import { MediaControls } from "./MediaControls.tsx";
import { Spinner, Unsupported } from "./Unsupported.tsx";

/** 播放时鼠标停止移动这么久后隐藏控制条 */
const IDLE_MS = 2000;

/** 视频播放器：不用浏览器自带的控制条，下方叠加 MediaControls */
export function VideoPlayer({
  entry,
  src,
  player,
  onDownload,
}: {
  entry: FileEntry;
  src: string;
  player: MediaPlayer;
  onDownload: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);

  useEffect(() => {
    wake();
    return () => clearTimeout(timer.current);
  }, [wake]);

  useEffect(() => {
    const sync = () => setFullscreen(!!box.current && document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen();
  }, []);

  if (player.error) return <Unsupported entry={entry} text={t("viewer.cannotPlay")} onDownload={onDownload} />;

  const hidden = idle && player.playing;
  return (
    <div
      ref={box}
      onMouseMove={wake}
      onPointerDown={wake}
      onKeyDown={wake}
      className={`relative grid size-full place-items-center overflow-hidden rounded-[1.75rem] bg-crust ${hidden ? "cursor-none" : ""}`}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: 设备上的视频没有字幕文件 */}
      <video
        ref={player.attach}
        src={src}
        playsInline
        onClick={player.toggle}
        onDoubleClick={toggleFullscreen}
        className="max-h-full max-w-full"
      />
      {player.loading && <Spinner />}
      <AnimatePresence>
        {!hidden && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={spring}
            className="absolute inset-x-3 bottom-3 sm:inset-x-6 sm:bottom-5"
          >
            <MediaControls player={player} fullscreen={fullscreen} onFullscreen={toggleFullscreen} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
