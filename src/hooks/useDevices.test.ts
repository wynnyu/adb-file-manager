import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/index.ts";
import type { Device, DeviceList, DeviceMode } from "../types.ts";
import { pickSerial, REBOOT_GRACE, useDevices, useStorage } from "./useDevices.ts";

const device = (serial: string, mode: DeviceMode = "system", transport: Device["transport"] = "adb"): Device => ({
  serial,
  transport,
  mode,
  model: serial,
  name: serial,
});

const listOf = (...devices: Device[]): DeviceList => ({ devices });

/** 让挂起的请求和到期的计时器都执行完 */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

describe("useDevices", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("优先选中系统模式的设备", async () => {
    vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A", "unauthorized"), device("B")));
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.devices).toHaveLength(2);
    expect(result.current.serial).toBe("B");
  });

  it("没有系统模式的设备时选第一台", async () => {
    vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A", "offline"), device("B", "unauthorized")));
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.serial).toBe("A");
  });

  it("每 2 秒轮询；当前设备还在就保持", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A"), device("B")));
    const { result } = renderHook(() => useDevices());
    await tick();
    act(() => result.current.setSerial("B"));

    await tick(2000);
    expect(list).toHaveBeenCalledTimes(2);
    expect(result.current.serial).toBe("B");
  });

  it("当前设备消失后宽限期内保持选择，超时后切换", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A"), device("B")));
    const { result } = renderHook(() => useDevices());
    await tick();
    act(() => result.current.setSerial("B"));
    await tick(2000);

    list.mockResolvedValue(listOf(device("A")));
    await tick(2000);
    expect(result.current.serial).toBe("B");
    expect(result.current.reconnecting).toBe(true);
    expect(result.current.device?.serial).toBe("B");

    await tick(REBOOT_GRACE - 2000);
    expect(result.current.serial).toBe("B");
    await tick(2000);
    expect(result.current.serial).toBe("A");
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.device?.serial).toBe("A");
  });

  it("消失后以 fastboot 模式重新出现时保持选中", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A")));
    const { result } = renderHook(() => useDevices());
    await tick();

    list.mockResolvedValue(listOf());
    await tick(2000);
    expect(result.current.reconnecting).toBe(true);

    list.mockResolvedValue(listOf(device("A", "bootloader", "fastboot")));
    await tick(2000);
    expect(result.current.serial).toBe("A");
    expect(result.current.reconnecting).toBe(false);
    expect(result.current.device).toMatchObject({ serial: "A", transport: "fastboot", mode: "bootloader" });
  });

  it("手动切换后不受之前的宽限影响", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A"), device("B")));
    const { result } = renderHook(() => useDevices());
    await tick();
    act(() => result.current.setSerial("B"));
    await tick(2000);
    list.mockResolvedValue(listOf(device("A")));
    await tick(2000);
    expect(result.current.reconnecting).toBe(true);

    act(() => result.current.setSerial("A"));
    expect(result.current.reconnecting).toBe(false);
    await tick(2000);
    expect(result.current.serial).toBe("A");
    expect(result.current.device?.serial).toBe("A");
  });

  it("设备全部断开时保留原来的 serial", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf(device("A")));
    const { result } = renderHook(() => useDevices());
    await tick();
    list.mockResolvedValue(listOf());
    await tick(2000);
    expect(result.current.devices).toEqual([]);
    expect(result.current.serial).toBe("A");
  });

  it("adb 出错时记下错误，恢复后清除", async () => {
    const list = vi.spyOn(api, "devices").mockRejectedValue(new Error("adb 不可用"));
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.adbError).toBe("adb 不可用");

    list.mockResolvedValue({ devices: [], adbError: "adb 启动失败" });
    await tick(2000);
    expect(result.current.adbError).toBe("adb 启动失败");

    list.mockResolvedValue(listOf(device("A")));
    await tick(2000);
    expect(result.current.adbError).toBeNull();
    expect(result.current.serial).toBe("A");
  });

  it("记录 fastboot 是否缺失", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue({ devices: [], fastbootMissing: true });
    const { result } = renderHook(() => useDevices());
    await tick();
    expect(result.current.fastbootMissing).toBe(true);

    list.mockResolvedValue({ devices: [] });
    await tick(2000);
    expect(result.current.fastbootMissing).toBe(false);
  });

  it("卸载后停止轮询", async () => {
    const list = vi.spyOn(api, "devices").mockResolvedValue(listOf());
    const { unmount } = renderHook(() => useDevices());
    await tick();
    unmount();
    await tick(10_000);
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("pickSerial", () => {
  const A = device("A");
  const B = device("B");
  const sleeping = device("C", "offline");

  it.each([
    ["没有选择且没有设备", null, [], null, 0, null, null],
    ["没有选择时优先系统模式", null, [sleeping, B], null, 0, "B", null],
    ["没有选择且没有系统模式时选第一台", null, [sleeping, device("D", "unauthorized")], null, 0, "C", null],
    ["当前设备在列表里则清除消失时刻", "A", [A, B], 500, 1000, "A", null],
    ["刚消失时开始计时并保持", "A", [B], null, 1000, "A", 1000],
    ["宽限期内保持", "A", [B], 1000, 1000 + REBOOT_GRACE - 1, "A", 1000],
    ["宽限期满后切到系统模式的设备", "A", [sleeping, B], 1000, 1000 + REBOOT_GRACE, "B", null],
    ["宽限期满后没有任何设备时继续保留", "A", [], 1000, 1000 + REBOOT_GRACE * 2, "A", 1000],
  ] as const)("%s", (_name, cur, list, goneSince, now, serial, expected) => {
    expect(pickSerial(cur, [...list], goneSince, now)).toEqual({ serial, goneSince: expected });
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
