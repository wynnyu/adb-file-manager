import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { file, providers, tz } from "../../../test/utils.tsx";
import { useClipboard } from "./useClipboard.ts";

const a = file("/sdcard/a.txt");
const b = file("/sdcard/b.txt");

function setup(serial: string | null = "S1") {
  const flash = vi.fn();
  const hook = renderHook(({ serial }) => useClipboard(serial, flash), {
    initialProps: { serial },
    wrapper: providers(),
  });
  return { ...hook, flash };
}

describe("useClipboard", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>();

  beforeEach(() => {
    writeText.mockReset();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });

  it("剪切后记下设备并提示条目数", () => {
    const { result, flash } = setup();
    act(() => result.current.toClip("cut", [a, b]));
    expect(result.current.clip).toEqual({ mode: "cut", entries: [a, b], serial: "S1" });
    expect(flash).toHaveBeenCalledWith(tz("clip.cut", { n: 2 }), "info");
    expect(result.current.canPaste).toBe(true);
    expect([...result.current.cutPaths]).toEqual([a.path, b.path]);
  });

  it("拷贝的条目不淡化显示", () => {
    const { result, flash } = setup();
    act(() => result.current.toClip("copy", [a]));
    expect(flash).toHaveBeenCalledWith(tz("clip.copied", { n: 1 }), "info");
    expect(result.current.cutPaths.size).toBe(0);
  });

  it("没有设备或没有条目时不改动剪贴板", () => {
    const { result, flash } = setup(null);
    act(() => result.current.toClip("copy", [a]));
    expect(result.current.clip).toBeNull();

    const other = setup();
    act(() => other.result.current.toClip("copy", []));
    expect(other.result.current.clip).toBeNull();
    expect(flash).not.toHaveBeenCalled();
  });

  it("只能粘贴回同一台设备", () => {
    const { result, rerender } = setup("S1");
    act(() => result.current.toClip("cut", [a]));
    rerender({ serial: "S2" });
    expect(result.current.canPaste).toBe(false);
    expect(result.current.cutPaths.size).toBe(0);
    rerender({ serial: "S1" });
    expect(result.current.canPaste).toBe(true);
  });

  it("拷贝文字到系统剪贴板并提示结果", async () => {
    const { result, flash } = setup();
    writeText.mockResolvedValueOnce();
    act(() => result.current.copyText("/sdcard/a.txt"));
    expect(writeText).toHaveBeenCalledWith("/sdcard/a.txt");
    await waitFor(() => expect(flash).toHaveBeenCalledWith(tz("clip.pathCopied"), "info"));

    writeText.mockRejectedValueOnce(new Error("denied"));
    act(() => result.current.copyText("x"));
    await waitFor(() => expect(flash).toHaveBeenLastCalledWith(tz("clip.failed")));
  });
});
