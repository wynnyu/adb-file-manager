import { Maximize, Minimize, Pause, Play, Volume1, Volume2, VolumeX } from "lucide-react";
import type { MediaPlayer } from "../../hooks/useMediaPlayer.ts";
import { useT } from "../../i18n/index.tsx";
import { formatDuration } from "../../lib/format.ts";
import { IconButton } from "../ui.tsx";

/** 音频和视频共用的控制条：播放 / 暂停、进度、时间、静音和音量，视频另有全屏 */
export function MediaControls({
  player,
  fullscreen,
  onFullscreen,
}: {
  player: MediaPlayer;
  /** 当前是否全屏；不传 onFullscreen 时不显示全屏按钮 */
  fullscreen?: boolean;
  onFullscreen?: () => void;
}) {
  const t = useT();
  const { playing, time, duration, volume, muted } = player;
  const known = Number.isFinite(duration);
  const level = muted ? 0 : volume;
  const VolumeIcon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex w-full items-center gap-1 rounded-full bg-mantle/90 p-1 shadow-xl shadow-crust/40 ring-1 ring-surface0 backdrop-blur-md">
      <IconButton tone="ghost" title={t(playing ? "viewer.pause" : "viewer.play")} onClick={player.toggle}>
        {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
      </IconButton>
      <input
        type="range"
        min={0}
        max={known ? duration : 0}
        step="any"
        value={known ? Math.min(time, duration) : 0}
        disabled={!known}
        aria-label={t("viewer.seek")}
        onChange={(e) => player.seek(Number(e.target.value))}
        className="h-10 min-w-0 flex-1 cursor-pointer accent-accent disabled:cursor-default"
      />
      <span className="shrink-0 px-2 text-xs font-semibold text-subtext0 tabular-nums">
        {formatDuration(time)} / {formatDuration(duration)}
      </span>
      <IconButton tone="ghost" title={t(level === 0 ? "viewer.unmute" : "viewer.mute")} onClick={player.toggleMute}>
        <VolumeIcon className="size-5" />
      </IconButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={level}
        aria-label={t("viewer.volume")}
        onChange={(e) => player.changeVolume(Number(e.target.value))}
        className="hidden h-10 w-20 shrink-0 cursor-pointer accent-accent sm:block"
      />
      {onFullscreen && (
        <IconButton
          tone="ghost"
          title={t(fullscreen ? "viewer.exitFullscreen" : "viewer.fullscreen")}
          onClick={onFullscreen}
        >
          {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
        </IconButton>
      )}
    </div>
  );
}
