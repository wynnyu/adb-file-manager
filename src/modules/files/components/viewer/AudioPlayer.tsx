import { Music } from "lucide-react";
import { motion } from "motion/react";
import { spring } from "../../../../components/ui.tsx";
import { useT } from "../../../../i18n/index.tsx";
import type { FileEntry } from "../../../../types.ts";
import type { MediaPlayer } from "../../hooks/index.ts";
import { MediaControls } from "./MediaControls.tsx";
import { Unsupported } from "./Unsupported.tsx";

/** 音频播放器：居中的卡片，播放时图标轻微起伏 */
export function AudioPlayer({
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

  if (player.error) return <Unsupported entry={entry} text={t("viewer.cannotPlay")} onDownload={onDownload} />;

  return (
    <div className="grid size-full place-items-center p-4">
      {/* biome-ignore lint/a11y/useMediaCaption: 音频文件没有字幕 */}
      <audio ref={player.attach} src={src} preload="metadata" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring}
        className="flex w-full max-w-md flex-col items-center gap-6 rounded-panel bg-mantle px-5 pt-10 pb-5 shadow-2xl shadow-crust/40 ring-1 ring-surface0"
      >
        <motion.span
          animate={player.playing ? { scale: [1, 1.05, 1] } : { scale: 1 }}
          transition={player.playing ? { duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" } : spring}
          className={`grid size-40 place-items-center rounded-circle bg-accent/15 text-accent ${player.loading ? "opacity-60" : ""}`}
        >
          <Music className="size-16" strokeWidth={1.8} />
        </motion.span>
        <p className="w-full truncate px-4 text-center font-bold">{entry.name}</p>
        <MediaControls player={player} />
      </motion.div>
    </div>
  );
}
