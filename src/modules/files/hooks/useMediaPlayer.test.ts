import { act, fireEvent, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPref } from "../../../lib/index.ts";
import { AUTOPLAY_DELAY, useMediaPlayer } from "./useMediaPlayer.ts";

let el: HTMLVideoElement;
let play: ReturnType<typeof vi.fn<() => Promise<void>>>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom 没有实现播放
  play = vi.fn(async () => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  el = document.createElement("video");
});

function setup() {
  const hook = renderHook((source: string | null) => useMediaPlayer(source), { initialProps: "/sdcard/a.mp4" });
  act(() => hook.result.current.attach(el));
  return hook;
}

/** 元数据加载完成 */
const loaded = () => act(() => void fireEvent(el, new Event("loadedmetadata")));

describe("useMediaPlayer", () => {
  it("元数据加载后等 1 秒自动播放", () => {
    const { result } = setup();
    expect(result.current.loading).toBe(true);
    loaded();
    expect(result.current.loading).toBe(false);
    act(() => vi.advanceTimersByTime(AUTOPLAY_DELAY - 1));
    expect(play).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(play).toHaveBeenCalledOnce();
  });

  it("等待期间操作过播放就不再自动播放", () => {
    const { result } = setup();
    loaded();
    act(() => result.current.toggle());
    play.mockClear();
    act(() => vi.advanceTimersByTime(AUTOPLAY_DELAY));
    expect(play).not.toHaveBeenCalled();
  });

  it("等待期间拖动过进度就不再自动播放", () => {
    const { result } = setup();
    loaded();
    act(() => result.current.seek(12));
    expect(result.current.time).toBe(12);
    act(() => vi.advanceTimersByTime(AUTOPLAY_DELAY));
    expect(play).not.toHaveBeenCalled();
  });

  it("浏览器拒绝自动播放时保持暂停，不算出错", async () => {
    play.mockRejectedValue(new DOMException("blocked", "NotAllowedError"));
    const { result } = setup();
    loaded();
    await act(async () => vi.advanceTimersByTime(AUTOPLAY_DELAY));
    expect(play).toHaveBeenCalled();
    expect(result.current.playing).toBe(false);
    expect(result.current.error).toBe(false);
  });

  it("加载失败时报告错误", () => {
    const { result } = setup();
    act(() => void fireEvent.error(el));
    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it("切换到其他文件后状态重置", () => {
    const { result, rerender } = setup();
    act(() => void fireEvent.error(el));
    expect(result.current.error).toBe(true);
    // 出错后媒体元素被替换为提示，卸下后错误状态保留
    act(() => result.current.attach(null));
    expect(result.current.error).toBe(true);
    rerender("/sdcard/b.mp4");
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it("没有挂上媒体元素时空格不起作用", () => {
    const { result } = setup();
    act(() => result.current.attach(null));
    expect(fireEvent.keyDown(document.body, { key: " " })).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("空格切换播放，焦点在按钮上时交给按钮", () => {
    setup();
    fireEvent.keyDown(document.body, { key: " " });
    expect(play).toHaveBeenCalledOnce();
    const button = document.createElement("button");
    document.body.append(button);
    fireEvent.keyDown(button, { key: " " });
    expect(play).toHaveBeenCalledOnce();
    button.remove();
  });

  it("音量和静音应用到元素上并保存", () => {
    const { result } = setup();
    act(() => result.current.changeVolume(0.4));
    expect(el.volume).toBeCloseTo(0.4);
    expect(loadPref("afm.volume", 1)).toBeCloseTo(0.4);
    act(() => result.current.toggleMute());
    expect(el.muted).toBe(true);
    expect(loadPref("afm.muted", false)).toBe(true);
    // 拖动音量时自动取消静音
    act(() => result.current.changeVolume(0.6));
    expect(el.muted).toBe(false);
  });

  it("音量为 0 时取消静音恢复到最大音量", () => {
    const { result } = setup();
    act(() => result.current.changeVolume(0));
    act(() => result.current.toggleMute());
    expect(result.current.volume).toBe(1);
    expect(result.current.muted).toBe(false);
  });
});
