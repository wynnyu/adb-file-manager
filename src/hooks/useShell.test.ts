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
  it("没有设备时不在线，target 为 null", async () => {
    vi.spyOn(api, "devices").mockResolvedValue([]);
    const { result } = renderHook(() => useShellState(), { wrapper: providers() });
    await vi.waitFor(() => expect(api.devices).toHaveBeenCalled());
    expect(result.current.online).toBe(false);
    expect(result.current.target).toBeNull();
  });

  it("closeDialog 传入已被替换的对话框时不关闭当前对话框", () => {
    vi.spyOn(api, "devices").mockResolvedValue([]);
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
