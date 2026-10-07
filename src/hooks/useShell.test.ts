import { act, renderHook } from "@testing-library/react";
import { Check } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import type { DialogState } from "../components/overlays/index.ts";
import { api } from "../lib/index.ts";
import { providers } from "../test/utils.tsx";
import { useShell, useShellState } from "./useShell.ts";

const dialog = (title: string): DialogState => ({
  kind: "confirm",
  title,
  icon: Check,
  message: { kind: "rootEnable" },
  confirm: "ok",
  onSubmit: async () => {},
});

describe("useShell", () => {
  it("没有 ShellContext 时抛出错误", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useShell())).toThrow();
  });
});

describe("useShellState", () => {
  it("没有设备时 adbReady 为 false，target 为 null", async () => {
    vi.spyOn(api, "devices").mockResolvedValue({ devices: [] });
    const { result } = renderHook(() => useShellState(), { wrapper: providers() });
    await vi.waitFor(() => expect(api.devices).toHaveBeenCalled());
    expect(result.current.adbReady).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it.each([
    ["adb 系统模式", { transport: "adb", mode: "system" }, true],
    ["adb 待授权", { transport: "adb", mode: "unauthorized" }, false],
    ["fastboot bootloader", { transport: "fastboot", mode: "bootloader" }, false],
  ] as const)("%s 时的 adbReady", async (_name, patch, expected) => {
    vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
    vi.spyOn(api, "devices").mockResolvedValue({ devices: [{ serial: "A", model: "", name: "A", ...patch }] });
    const { result } = renderHook(() => useShellState(), { wrapper: providers() });
    await vi.waitFor(() => expect(result.current.serial).toBe("A"));
    expect(result.current.adbReady).toBe(expected);
    expect(result.current.device?.serial).toBe("A");
  });

  it("closeDialog 传入已被替换的对话框时不关闭当前对话框", () => {
    vi.spyOn(api, "devices").mockResolvedValue({ devices: [] });
    const { result } = renderHook(() => useShellState(), { wrapper: providers() });
    const first = dialog("first");
    const second = dialog("second");
    act(() => result.current.openDialog(first));
    act(() => result.current.openDialog(second));
    act(() => result.current.closeDialog(first));
    expect(result.current.dialog).toBe(second);
    act(() => result.current.closeDialog(second));
    expect(result.current.dialog).toBeNull();
  });
});
