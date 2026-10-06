import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/index.ts";
import type { Device } from "../types.ts";
import { useDevices, useStorage } from "./useDevices.ts";

const device = (serial: string, state = "device"): Device => ({ serial, state, model: serial, name: serial });

/** 让挂起的请求和到期的计时器都执行完 */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useDevices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("优先选中已连接的设备", async () => {
    vi.spyOn(api, "devices").mockResolvedValue([device("A", "unauthorized"), device("B")]);
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.devices).toHaveLength(2);
    expect(result.current.serial).toBe("B");
  });

  it("没有已连接的设备时选第一台", async () => {
    vi.spyOn(api, "devices").mockResolvedValue([device("A", "offline"), device("B", "unauthorized")]);
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.serial).toBe("A");
  });

  it("每 2 秒轮询；当前设备还在就保持，断开后切到另一台", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue([device("A"), device("B")]);
    const { result } = renderHook(() => useDevices());
    await tick();
    act(() => result.current.setSerial("B"));

    await tick(2000);
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.serial).toBe("B");

    list.mockResolvedValue([device("A")]);
    await tick(2000);
    expect(result.current.serial).toBe("A");
  });

  it("设备全部断开时保留原来的 serial", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue([device("A")]);
    const { result } = renderHook(() => useDevices());
    await tick();
    list.mockResolvedValue([]);
    await tick(2000);
    expect(result.current.devices).toEqual([]);
    expect(result.current.serial).toBe("A");
  });

  it("adb 出错时记下错误，恢复后清除", async () => {
    const list = vi.spyOn(api, "devices").mockRejectedValue(new Error("adb 不可用"));
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.adbError).toBe("adb 不可用");

    list.mockResolvedValue([device("A")]);
    await tick(2000);
    expect(result.current.adbError).toBeNull();
    expect(result.current.serial).toBe("A");
  });

  it("卸载后停止轮询", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue([]);
    const { unmount } = renderHook(() => useDevices());
    await tick();
    unmount();
    await tick(10_000);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("useStorage", () => {
  it("在线时读取存储空间，refreshStorage 重新读取", async () => {
    const storage = vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
    const { result } = renderHook(() => useStorage("A", true));
    await waitFor(() => expect(result.current.storage).toEqual({ total: 100, free: 40 }));
    expect(storage).toHaveBeenCalledWith("A");

    storage.mockResolvedValue({ total: 100, free: 10 });
    act(() => result.current.refreshStorage());
    await waitFor(() => expect(result.current.storage?.free).toBe(10));
  });

  it("读取失败时为 null", async () => {
    vi.spyOn(api, "storage").mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useStorage("A", true));
    await waitFor(() => expect(api.storage).toHaveBeenCalled());
    expect(result.current.storage).toBeNull();
  });

  it("离线时不请求，并清掉之前的数据", async () => {
    const storage = vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
    const { result, rerender } = renderHook(({ online }) => useStorage("A", online), {
      initialProps: { online: true },
    });
    await waitFor(() => expect(result.current.storage).not.toBeNull());
    rerender({ online: false });
    expect(result.current.storage).toBeNull();
    act(() => result.current.refreshStorage());
    expect(storage).toHaveBeenCalledTimes(1);
  });
});
