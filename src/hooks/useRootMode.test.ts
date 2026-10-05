import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DialogState } from "../components/overlays/Dialog.tsx";
import { api } from "../lib/api.ts";
import { loadPref } from "../lib/prefs.ts";
import { providers, tz } from "../test/utils.tsx";
import { useRootMode } from "./useRootMode.ts";

function setup({ serial = "A" as string | null, online = true } = {}) {
  const flash = vi.fn();
  const openDialog = vi.fn<(d: DialogState) => void>();
  const hook = renderHook((p: { serial: string | null; online: boolean }) => useRootMode({ ...p, flash, openDialog }), {
    initialProps: { serial, online },
    wrapper: providers(),
  });
  /** 最近一次打开的对话框 */
  const dialog = () => openDialog.mock.lastCall![0] as Extract<DialogState, { kind: "confirm" }>;
  return { ...hook, flash, openDialog, dialog };
}

describe("useRootMode", () => {
  it("默认关闭", () => {
    const { result } = setup();
    expect(result.current.rootMode).toBe(false);
    expect(document.title).toBe(tz("app.name"));
  });

  it("开启前弹出确认框，确认后检查 root 并开启", async () => {
    const check = vi.spyOn(api, "rootCheck").mockResolvedValue({ method: "su" });
    const { result, dialog } = setup();
    act(() => result.current.askEnableRoot());
    expect(dialog()).toMatchObject({ kind: "confirm", tone: "warn", checkbox: tz("root.enable.remember") });

    await act(() => dialog().onSubmit(false));
    expect(check).toHaveBeenCalledWith("A");
    expect(result.current.rootMode).toBe(true);
    expect(loadPref("afm.rootRemember", null)).toBe(false);
    expect(document.title).toBe(tz("app.rootTitle", { name: tz("app.name") }));
  });

  it("勾选“记住选择”后保存偏好", async () => {
    vi.spyOn(api, "rootCheck").mockResolvedValue({ method: "adbd" });
    const { result, dialog } = setup();
    act(() => result.current.askEnableRoot());
    await act(() => dialog().onSubmit(true));
    expect(loadPref("afm.rootRemember", null)).toBe(true);
  });

  it("拿不到 root 时确认框报错，不开启", async () => {
    vi.spyOn(api, "rootCheck").mockRejectedValue(new Error("未找到 su"));
    const { result, dialog } = setup();
    act(() => result.current.askEnableRoot());
    await expect(dialog().onSubmit(false)).rejects.toThrow("未找到 su");
    expect(result.current.rootMode).toBe(false);
  });

  it("没有设备时不弹确认框", () => {
    const { result, openDialog } = setup({ serial: null });
    act(() => result.current.askEnableRoot());
    expect(openDialog).not.toHaveBeenCalled();
  });

  it("记住了选择时自动开启，检查通过后同一台设备不再检查", async () => {
    localStorage.setItem("afm.rootRemember", "true");
    const check = vi.spyOn(api, "rootCheck").mockResolvedValue({ method: "su" });
    const { result, rerender } = setup();
    expect(result.current.rootMode).toBe(true);
    await waitFor(() => expect(check).toHaveBeenCalledWith("A"));

    rerender({ serial: "A", online: false });
    rerender({ serial: "A", online: true });
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("自动开启时检查失败：退出 root 模式并提示", async () => {
    localStorage.setItem("afm.rootRemember", "true");
    vi.spyOn(api, "rootCheck").mockRejectedValue(new Error("su 被拒绝"));
    const { result, flash } = setup();
    await waitFor(() => expect(result.current.rootMode).toBe(false));
    expect(flash).toHaveBeenCalledWith(tz("root.exited", { reason: "su 被拒绝" }));
  });

  it("设备离线时不检查", () => {
    localStorage.setItem("afm.rootRemember", "true");
    const check = vi.spyOn(api, "rootCheck");
    setup({ online: false });
    expect(check).not.toHaveBeenCalled();
  });

  it("disableRoot 关闭并清除“记住选择”", async () => {
    localStorage.setItem("afm.rootRemember", "true");
    vi.spyOn(api, "rootCheck").mockResolvedValue({ method: "su" });
    const { result } = setup();
    act(() => result.current.disableRoot());
    expect(result.current.rootMode).toBe(false);
    expect(loadPref("afm.rootRemember", null)).toBe(false);
  });

  it("后端返回 root_lost 时退出 root 模式，保留“记住选择”", async () => {
    localStorage.setItem("afm.rootRemember", "true");
    vi.spyOn(api, "rootCheck").mockResolvedValue({ method: "su" });
    const { result, flash } = setup();
    await waitFor(() => expect(api.rootCheck).toHaveBeenCalled());

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "root 权限已撤销", code: "root_lost" }, { status: 403 }),
    );
    await act(() => api.ls({ serial: "A", root: true }, "/data").catch(() => {}));
    expect(result.current.rootMode).toBe(false);
    expect(flash).toHaveBeenCalledWith(tz("root.exited", { reason: "root 权限已撤销" }));
    expect(loadPref("afm.rootRemember", null)).toBe(true);
  });
});
