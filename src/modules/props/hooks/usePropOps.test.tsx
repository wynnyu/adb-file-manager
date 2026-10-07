import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DialogState } from "../../../components/overlays/index.ts";
import { ApiError, api } from "../../../lib/index.ts";
import { newQueryClient, shellProviders, tz } from "../../../test/utils.tsx";
import { usePropOps } from "./usePropOps.ts";

const TARGET = { serial: "S", root: true };

function setup(client: QueryClient = newQueryClient()) {
  const flash = vi.fn();
  const openDialog = vi.fn<(d: DialogState) => void>();
  const hook = renderHook(() => usePropOps(), {
    wrapper: shellProviders({ serial: "S", target: TARGET, flash, openDialog }, client),
  });
  const dialog = <K extends DialogState["kind"]>(kind: K, nth = -1) => {
    const state = openDialog.mock.calls.at(nth)?.[0];
    if (state?.kind !== kind) throw new Error(`最近打开的不是 ${kind} 对话框`);
    return state as Extract<DialogState, { kind: K }>;
  };
  return { ...hook, flash, openDialog, dialog, client };
}

const needsForce = (message = "风险说明") => new ApiError(message, "needs_force");

afterEach(() => vi.restoreAllMocks());

describe("usePropOps.edit", () => {
  it("打开表单：属性名只读，值带当前内容", () => {
    const { result, dialog } = setup();
    act(() => result.current.edit({ key: "persist.a", value: "old" }));
    const form = dialog("form");
    expect(form.fields.map((f) => [f.initial, !!f.readOnly])).toEqual([
      ["persist.a", true],
      ["old", false],
    ]);
  });

  it("没有风险时直接提交，成功后提示并让列表缓存失效", async () => {
    const set = vi.spyOn(api, "setProp").mockResolvedValue({ ok: true });
    const { result, dialog, openDialog, flash, client } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => result.current.edit({ key: "persist.a", value: "old" }));
    await act(() => dialog("form").onSubmit(["persist.a", "new"]));
    expect(set).toHaveBeenCalledWith(TARGET, "persist.a", "new", undefined);
    expect(flash).toHaveBeenCalledWith(tz("prop.flash.saved", { key: "persist.a" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["props", "S"] });
    expect(openDialog).toHaveBeenCalledTimes(1);
  });

  it("409 needs_force 时换成带风险说明和倒计时的 danger 确认框，确认后带 force 重试", async () => {
    const set = vi
      .spyOn(api, "setProp")
      .mockRejectedValueOnce(needsForce("ro 属性仅在本次开机内生效"))
      .mockResolvedValue({ ok: true });
    const { result, dialog, openDialog, flash } = setup();
    act(() => result.current.edit({ key: "ro.x", value: "1" }));
    await act(() => dialog("form").onSubmit(["ro.x", "2"]));
    expect(set).toHaveBeenCalledTimes(1);
    expect(flash).not.toHaveBeenCalled();

    expect(openDialog).toHaveBeenCalledTimes(2);
    const confirm = dialog("confirm");
    expect(confirm).toMatchObject({
      tone: "danger",
      message: "ro 属性仅在本次开机内生效",
      countdown: 5,
      title: tz("prop.confirm.setTitle", { key: "ro.x" }),
      confirm: tz("prop.confirm.apply"),
    });

    await act(() => confirm.onSubmit(false));
    expect(set).toHaveBeenLastCalledWith(TARGET, "ro.x", "2", true);
    expect(flash).toHaveBeenCalledWith(tz("prop.flash.saved", { key: "ro.x" }));
  });

  it("普通失败抛给表单显示，不打开确认框", async () => {
    vi.spyOn(api, "setProp").mockRejectedValue(new ApiError("操作失败：x"));
    const { result, dialog, openDialog, flash } = setup();
    act(() => result.current.edit({ key: "persist.a", value: "old" }));
    await expect(dialog("form").onSubmit(["persist.a", "new"])).rejects.toThrow("操作失败：x");
    expect(openDialog).toHaveBeenCalledTimes(1);
    expect(flash).not.toHaveBeenCalled();
  });

  it("强确认后重试失败时错误抛给确认框", async () => {
    vi.spyOn(api, "setProp").mockRejectedValueOnce(needsForce()).mockRejectedValueOnce(new ApiError("属性未生效"));
    const { result, dialog, flash } = setup();
    act(() => result.current.edit({ key: "ro.x", value: "1" }));
    await act(() => dialog("form").onSubmit(["ro.x", "2"]));
    await expect(dialog("confirm").onSubmit(false)).rejects.toThrow("属性未生效");
    expect(flash).not.toHaveBeenCalled();
  });
});

describe("usePropOps.add", () => {
  it("属性名必填，提交新建的键和值", async () => {
    const set = vi.spyOn(api, "setProp").mockResolvedValue({ ok: true });
    const { result, dialog, flash } = setup();
    act(() => result.current.add());
    const form = dialog("form");
    expect(form.fields.map((f) => !!f.required)).toEqual([true, false]);
    await act(() => form.onSubmit(["debug.adbfm.test", "1"]));
    expect(set).toHaveBeenCalledWith(TARGET, "debug.adbfm.test", "1", undefined);
    expect(flash).toHaveBeenCalledWith(tz("prop.flash.saved", { key: "debug.adbfm.test" }));
  });

  it("新建风险属性同样走强确认", async () => {
    const set = vi
      .spyOn(api, "setProp")
      .mockRejectedValueOnce(needsForce("可能断开 adb"))
      .mockResolvedValue({ ok: true });
    const { result, dialog } = setup();
    act(() => result.current.add());
    await act(() => dialog("form").onSubmit(["sys.usb.config", "none"]));
    await act(() => dialog("confirm").onSubmit(false));
    expect(set).toHaveBeenLastCalledWith(TARGET, "sys.usb.config", "none", true);
  });
});

describe("usePropOps.remove", () => {
  it("先不带 force 请求，409 后打开确认框，确认后带 force 删除", async () => {
    const del = vi
      .spyOn(api, "deleteProp")
      .mockRejectedValueOnce(needsForce("删除说明"))
      .mockResolvedValue({ ok: true });
    const { result, dialog, flash } = setup();
    act(() => result.current.remove({ key: "persist.a", value: "1" }));
    await waitFor(() => expect(del).toHaveBeenCalledTimes(1));
    expect(del).toHaveBeenCalledWith(TARGET, "persist.a", undefined);
    const confirm = await waitFor(() => dialog("confirm"));
    expect(confirm).toMatchObject({
      message: "删除说明",
      title: tz("prop.confirm.deleteTitle", { key: "persist.a" }),
      confirm: tz("prop.confirm.delete"),
    });
    await act(() => confirm.onSubmit(false));
    expect(del).toHaveBeenLastCalledWith(TARGET, "persist.a", true);
    expect(flash).toHaveBeenCalledWith(tz("prop.flash.deleted", { key: "persist.a" }));
  });

  it("其他错误用提示显示，不打开确认框", async () => {
    vi.spyOn(api, "deleteProp").mockRejectedValue(new ApiError("此操作需要 root 模式"));
    const { result, flash, openDialog } = setup();
    act(() => result.current.remove({ key: "persist.a", value: "1" }));
    await waitFor(() => expect(flash).toHaveBeenCalledWith("此操作需要 root 模式"));
    expect(openDialog).not.toHaveBeenCalled();
  });
});
