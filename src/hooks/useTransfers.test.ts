import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTransfers } from "./useTransfers.ts";

describe("useTransfers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("新任务分配 id 并加入队列，patch 合并字段", () => {
    const { result } = renderHook(() => useTransfers());
    let id = "";
    act(() => {
      id = result.current.startTransfer({ kind: "upload", label: "a.txt", status: "uploading", progress: 0 });
    });
    expect(result.current.transfers).toEqual([
      { id, kind: "upload", label: "a.txt", status: "uploading", progress: 0 },
    ]);
    act(() => result.current.patchTransfer(id, { progress: 0.5 }));
    expect(result.current.transfers[0]).toMatchObject({ status: "uploading", progress: 0.5 });
  });

  it("完成的任务 4 秒后移除", () => {
    const { result } = renderHook(() => useTransfers());
    let id = "";
    act(() => {
      id = result.current.startTransfer({ kind: "download", label: "a", status: "pulling" });
    });
    act(() => result.current.patchTransfer(id, { status: "done" }));
    expect(result.current.transfers).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.transfers).toEqual([]);
  });

  it("完成但带说明的任务一直保留，直到手动关闭", () => {
    const { result } = renderHook(() => useTransfers());
    let id = "";
    act(() => {
      id = result.current.startTransfer({ kind: "compress", label: "a", status: "compressing" });
    });
    act(() => result.current.patchTransfer(id, { status: "done", note: "已跳过 2 个符号链接或特殊文件" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.transfers).toHaveLength(1);
    act(() => result.current.dismissTransfer(id));
    expect(result.current.transfers).toEqual([]);
  });

  it("失败的任务一直保留，直到手动关闭", () => {
    const { result } = renderHook(() => useTransfers());
    let id = "";
    act(() => {
      id = result.current.startTransfer({ kind: "copy", label: "a", status: "copying" });
      result.current.startTransfer({ kind: "move", label: "b", status: "moving" });
    });
    act(() => result.current.patchTransfer(id, { status: "error", error: "失败原因" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.transfers.map((t) => t.label)).toEqual(["a", "b"]);
    act(() => result.current.dismissTransfer(id));
    expect(result.current.transfers.map((t) => t.label)).toEqual(["b"]);
  });
});
