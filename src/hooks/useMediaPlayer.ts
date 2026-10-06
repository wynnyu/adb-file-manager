import { useCallback, useEffect, useRef, useState } from "react";
import { usePref } from "../lib/index.ts";

/** 元数据加载完成后等这么久再自动播放 */
export const AUTOPLAY_DELAY = 1000;

interface PlayState {
  playing: boolean;
  /** 当前播放位置，单位秒 */
  time: number;
  /** 总时长，单位秒；未知时为 NaN */
  duration: number;
  loading: boolean;
  /** 浏览器无法加载或解码 */
  error: boolean;
}

const INITIAL: PlayState = { playing: false, time: 0, duration: Number.NaN, loading: true, error: false };

/**
 * 查看器中音频、视频的播放状态和控制。媒体元素通过返回的 attach 挂上来，source 变化时状态重置。
 * 元数据加载后 1 秒自动播放，这期间操作过播放或进度就不再自动播放；浏览器拒绝自动播放时停在暂停状态。
 * 音量和静音在不同文件之间保持。空格键播放或暂停
 */
export function useMediaPlayer(
  /** 当前打开的文件，例如其路径；没有打开文件时为 null */
  source: string | null,
) {
  const [el, setEl] = useState<HTMLMediaElement | null>(null);
  const [state, setState] = useState(INITIAL);
  const [prevSource, setPrevSource] = useState(source);
  if (source !== prevSource) {
    setPrevSource(source);
    setState(INITIAL);
  }
  const [volume, setVolume] = usePref("afm.volume", 1);
  const [muted, setMuted] = usePref("afm.muted", false);
  /** 用户已经操作过播放或进度 */
  const touched = useRef(false);

  /** 作为媒体元素的 ref */
  const attach = useCallback((node: HTMLMediaElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [el, volume, muted]);

  useEffect(() => {
    if (!el) return;
    touched.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const patch = (p: Partial<PlayState>) => setState((s) => ({ ...s, ...p }));
    const sync = () => patch({ playing: !el.paused });
    const onMeta = () => {
      patch({ duration: el.duration, loading: false });
      timer = setTimeout(() => {
        // Safari 等浏览器可能拒绝没有用户手势的播放，这时保持暂停，不当作错误
        if (!touched.current) el.play()?.catch(() => {});
      }, AUTOPLAY_DELAY);
    };
    const handlers: Record<string, () => void> = {
      play: sync,
      pause: sync,
      ended: sync,
      loadedmetadata: onMeta,
      durationchange: () => patch({ duration: el.duration }),
      timeupdate: () => patch({ time: el.currentTime }),
      waiting: () => patch({ loading: true }),
      playing: () => patch({ loading: false }),
      canplay: () => patch({ loading: false }),
      seeked: () => patch({ loading: false }),
      error: () => patch({ error: true, loading: false }),
    };
    for (const [name, fn] of Object.entries(handlers)) el.addEventListener(name, fn);
    // 监听注册之前可能已经加载完或出错
    if (el.error) handlers.error();
    else if (el.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    return () => {
      clearTimeout(timer);
      for (const [name, fn] of Object.entries(handlers)) el.removeEventListener(name, fn);
    };
  }, [el]);

  const toggle = useCallback(() => {
    if (!el) return;
    touched.current = true;
    if (el.paused) el.play()?.catch(() => {});
    else el.pause();
  }, [el]);

  // 空格播放或暂停；焦点在按钮上时由按钮自己响应，避免触发两次
  useEffect(() => {
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement).closest("button, textarea, input:not([type=range])")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [el, toggle]);

  const seek = useCallback(
    (t: number) => {
      if (!el) return;
      touched.current = true;
      el.currentTime = t;
      setState((s) => ({ ...s, time: t }));
    },
    [el],
  );

  const changeVolume = useCallback(
    (v: number) => {
      setVolume(v);
      if (v > 0) setMuted(false);
    },
    [setVolume, setMuted],
  );

  /** 静音或取消静音；音量拖到 0 后取消静音时恢复到最大音量 */
  const toggleMute = useCallback(() => {
    if (!muted && volume > 0) return setMuted(true);
    setMuted(false);
    if (volume === 0) setVolume(1);
  }, [muted, volume, setMuted, setVolume]);

  return { ...state, volume, muted, attach, toggle, seek, changeVolume, toggleMute };
}

export type MediaPlayer = ReturnType<typeof useMediaPlayer>;
