import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Target } from "../../../lib/index.ts";
import { file, folder } from "../../../test/utils.tsx";
import type { FileEntry } from "../../../types.ts";
import { useViewer } from "./useViewer.ts";

const a = file("/d/a.txt");
const b = file("/d/b.png");
const c = file("/d/c.mp4");
const list = [folder("/d/A"), a, folder("/d/B"), b, c];
const target: Target = { serial: "R5CT", root: false };

interface Props {
  selectable: FileEntry[];
  target: Target | null;
  online: boolean;
}

function setup(patch: Partial<Props> = {}) {
  const selectOnly = vi.fn();
  const hook = renderHook((p: Props) => useViewer({ ...p, selectOnly }), {
    initialProps: { selectable: list, target, online: true, ...patch },
  });
  return { selectOnly, ...hook };
}

describe("useViewer", () => {
  it("打开文件后给出它在文件中的位置，文件夹不计入", () => {
    const { result } = setup();
    act(() => result.current.openFile(b));
    expect(result.current.entry).toBe(b);
    expect([result.current.index, result.current.count]).toEqual([1, 3]);
    expect([result.current.hasPrev, result.current.hasNext]).toEqual([true, true]);
  });

  it("前后切换跳过文件夹，并选中切换到的文件", () => {
    const { result, selectOnly } = setup();
    act(() => result.current.openFile(b));
    act(() => result.current.step(-1));
    expect(result.current.entry).toBe(a);
    expect(selectOnly).toHaveBeenLastCalledWith(a.path);
    act(() => result.current.step(1));
    act(() => result.current.step(1));
    expect(result.current.entry).toBe(c);
    expect(selectOnly).toHaveBeenLastCalledWith(c.path);
  });

  it("到两端时停止，不循环", () => {
    const { result, selectOnly } = setup();
    act(() => result.current.openFile(a));
    expect(result.current.hasPrev).toBe(false);
    act(() => result.current.step(-1));
    expect(result.current.entry).toBe(a);
    act(() => result.current.openFile(c));
    expect(result.current.hasNext).toBe(false);
    act(() => result.current.step(1));
    expect(result.current.entry).toBe(c);
    expect(selectOnly).not.toHaveBeenCalled();
  });

  it("文件不在列表中时不显示位置，也不能切换", () => {
    const { result } = setup();
    act(() => result.current.openFile(file("/other/x.txt")));
    expect(result.current.index).toBe(-1);
    expect([result.current.hasPrev, result.current.hasNext]).toEqual([false, false]);
  });

  it("关闭后不再有打开的文件", () => {
    const { result } = setup();
    act(() => result.current.openFile(a));
    act(() => result.current.close());
    expect(result.current.entry).toBeNull();
  });

  it("设备断开后关闭，重新连上也不再弹出", () => {
    const { result, rerender } = setup();
    act(() => result.current.openFile(a));
    rerender({ selectable: list, target, online: false });
    expect(result.current.entry).toBeNull();
    rerender({ selectable: list, target, online: true });
    expect(result.current.entry).toBeNull();
  });

  it("切换设备或 root 模式后关闭", () => {
    const { result, rerender } = setup();
    act(() => result.current.openFile(a));
    rerender({ selectable: list, target: { ...target, root: true }, online: true });
    expect(result.current.entry).toBeNull();
  });
});
