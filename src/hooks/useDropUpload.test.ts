import { act, renderHook, waitFor } from "@testing-library/react";
import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDropUpload } from "./useDropUpload.ts";

const txt = new File(["x"], "a.txt");

/** 只带 dragProps 用到的字段 */
const dragEvent = (dataTransfer: Partial<DataTransfer>) =>
  ({
    preventDefault: vi.fn(),
    dataTransfer: { types: ["Files"], items: [], files: [], ...dataTransfer },
  }) as unknown as DragEvent & { preventDefault: ReturnType<typeof vi.fn> };

describe("useDropUpload", () => {
  function setup(enabled = true) {
    const upload = vi.fn(async () => {});
    const onError = vi.fn();
    const hook = renderHook(() => useDropUpload(enabled, upload, onError));
    const props = () => hook.result.current.dragProps as Required<typeof hook.result.current.dragProps>;
    return { ...hook, upload, onError, props };
  }

  it("禁用时不接收拖放", () => {
    const { result } = setup(false);
    expect(result.current.dragProps).toEqual({});
  });

  it.each([true, false])("enabled 为 %s 时重新渲染后 dragProps 保持不变", (enabled) => {
    const { result, rerender } = setup(enabled);
    const before = result.current.dragProps;
    rerender();
    expect(result.current.dragProps).toBe(before);
  });

  it("拖入文件时显示提示，经过子元素不闪烁，完全离开后隐藏", () => {
    const { result, props } = setup();
    act(() => props().onDragEnter(dragEvent({})));
    act(() => props().onDragEnter(dragEvent({})));
    expect(result.current.dragging).toBe(true);
    act(() => props().onDragLeave());
    expect(result.current.dragging).toBe(true);
    act(() => props().onDragLeave());
    expect(result.current.dragging).toBe(false);
  });

  it("拖入的不是文件时不响应", () => {
    const { result, props } = setup();
    const e = dragEvent({ types: ["text/plain"] });
    act(() => props().onDragEnter(e));
    expect(result.current.dragging).toBe(false);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("放下后上传拖进来的文件", async () => {
    const { result, props, upload } = setup();
    act(() => props().onDragEnter(dragEvent({})));
    await act(() => props().onDrop(dragEvent({ files: [txt] as unknown as FileList })));
    expect(result.current.dragging).toBe(false);
    expect(upload).toHaveBeenCalledWith([{ file: txt, path: "a.txt" }]);
  });

  it("读取拖入的内容失败时报告错误", async () => {
    const { props, onError, upload } = setup();
    const broken = {
      kind: "file",
      webkitGetAsEntry: () => {
        throw new Error("无法读取");
      },
    };
    await act(() => props().onDrop(dragEvent({ items: [broken] as unknown as DataTransferItemList })));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error("无法读取")));
    expect(upload).not.toHaveBeenCalled();
  });
});
