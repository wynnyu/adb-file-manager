import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ShieldAlert } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DialogState } from "../../../components/overlays/index.ts";
import type { Tasks } from "../../../hooks/index.ts";
import { api, JobCanceled } from "../../../lib/index.ts";
import { deferred, newQueryClient, shellProviders, tz } from "../../../test/utils.tsx";
import type { AppEntry, JobSnapshot, Task } from "../../../types.ts";
import { useAppOps } from "./useAppOps.ts";

const entry = (patch: Partial<AppEntry> = {}): AppEntry => ({
  pkg: "com.example.app",
  path: "/data/app/x/base.apk",
  system: false,
  state: "enabled",
  ...patch,
});

function setup(client: QueryClient = newQueryClient()) {
  const flash = vi.fn();
  const openDialog = vi.fn<(d: DialogState) => void>();
  const startTask = vi.fn((_task: Omit<Task, "id">) => "task-1" as ReturnType<Tasks["startTask"]>);
  const patchTask = vi.fn();
  const hook = renderHook(() => useAppOps(), {
    wrapper: shellProviders({ serial: "S", flash, openDialog, startTask, patchTask }, client),
  });
  /** 最近一次打开的确认对话框 */
  const confirm = () => {
    const state = openDialog.mock.calls.at(-1)?.[0];
    if (state?.kind !== "confirm") throw new Error("没有打开确认对话框");
    return state;
  };
  return { ...hook, flash, openDialog, startTask, patchTask, confirm, client };
}

const file = (name: string) => new File(["x"], name);
const snap = (patch: Partial<JobSnapshot>): JobSnapshot => ({ id: "j1", state: "running", cancelable: true, ...patch });

afterEach(() => vi.restoreAllMocks());

describe("useAppOps.run 直接执行的操作", () => {
  it.each([
    ["stop", "force-stop", "apps.flash.stopped"],
    ["enable", "enable", "apps.flash.enabled"],
    ["restore", "restore", "apps.flash.restored"],
  ] as const)("%s 不弹确认，调用 %s 并提示", async (op, action, flashKey) => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, openDialog, flash } = setup();
    act(() => result.current.run(op, entry()));
    await waitFor(() => expect(flash).toHaveBeenCalledWith(tz(flashKey, { pkg: "com.example.app" })));
    expect(call).toHaveBeenCalledWith("S", action, "com.example.app", {});
    expect(openDialog).not.toHaveBeenCalled();
  });

  it("失败时提示错误原因", async () => {
    vi.spyOn(api, "appAction").mockRejectedValue(new Error("操作失败：x"));
    const { result, flash } = setup();
    act(() => result.current.run("stop", entry()));
    await waitFor(() => expect(flash).toHaveBeenCalledWith("操作失败：x"));
  });

  it("成功后让应用列表和该应用的详情失效", async () => {
    vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const client = newQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result, flash } = setup(client);
    act(() => result.current.run("enable", entry()));
    await waitFor(() => expect(flash).toHaveBeenCalled());
    const keys = invalidate.mock.calls.map(([f]) => f?.queryKey);
    expect(keys).toContainEqual(["apps", "S"]);
    expect(keys).toContainEqual(["app", "S", "com.example.app"]);
  });
});

describe("useAppOps.run 需要确认的操作", () => {
  it.each([
    ["disable", "disable"],
    ["clear", "clear"],
    ["uninstallUpdates", "uninstall-updates"],
  ] as const)("%s 先打开危险确认，提交后调用 %s", async (op, action) => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm, flash } = setup();
    act(() => result.current.run(op, entry()));
    const dialog = confirm();
    expect(dialog.tone).toBe("danger");
    expect(dialog.countdown).toBeUndefined();
    expect(dialog.title).toContain("com.example.app");
    expect(call).not.toHaveBeenCalled();
    await act(() => dialog.onSubmit(false));
    expect(call).toHaveBeenCalledWith("S", action, "com.example.app", {});
    expect(flash).toHaveBeenCalled();
  });

  it("卸载用户应用：带“保留数据”复选框，勾选后传 keepData", async () => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm } = setup();
    act(() => result.current.run("uninstall", entry()));
    expect(confirm().checkbox).toBe(tz("apps.confirm.keepData"));
    expect(confirm().title).toBe(tz("apps.confirm.uninstall.title", { pkg: "com.example.app" }));
    await act(() => confirm().onSubmit(true));
    expect(call).toHaveBeenLastCalledWith("S", "uninstall", "com.example.app", { keepData: true });
    await act(() => confirm().onSubmit(false));
    expect(call).toHaveBeenLastCalledWith("S", "uninstall", "com.example.app", {});
  });

  it("卸载系统应用：只为当前用户卸载，传 user0", async () => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm } = setup();
    act(() => result.current.run("uninstall", entry({ system: true })));
    expect(confirm().title).toBe(tz("apps.confirm.uninstallUser.title", { pkg: "com.example.app" }));
    expect(confirm().confirm).toBe(tz("apps.action.uninstallUser"));
    await act(() => confirm().onSubmit(false));
    expect(call).toHaveBeenCalledWith("S", "uninstall", "com.example.app", { user0: true });
  });

  it("关键包改为强确认：ShieldAlert 图标、5 秒倒计时、按角色说明后果，提交带 force", async () => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm } = setup();
    act(() =>
      result.current.run("disable", entry({ pkg: "com.android.systemui", system: true, critical: "systemui" })),
    );
    const dialog = confirm();
    expect(dialog.icon).toBe(ShieldAlert);
    expect(dialog.countdown).toBe(5);
    expect(dialog.tone).toBe("danger");
    expect(dialog.message).toBe(tz("apps.critical.systemui"));
    await act(() => dialog.onSubmit(false));
    expect(call).toHaveBeenCalledWith("S", "disable", "com.android.systemui", { force: true });
  });

  it.each(["core", "systemui", "settings", "launcher", "ime"] as const)("关键包角色 %s 显示对应说明", (role) => {
    const { result, confirm } = setup();
    act(() => result.current.run("clear", entry({ critical: role })));
    expect(confirm().message).toBe(tz(`apps.critical.${role}`));
  });

  it("卸载系统关键包同时带 force、user0 和 keepData", async () => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm } = setup();
    act(() => result.current.run("uninstall", entry({ system: true, critical: "launcher" })));
    await act(() => confirm().onSubmit(true));
    expect(call).toHaveBeenCalledWith("S", "uninstall", "com.example.app", {
      force: true,
      user0: true,
      keepData: true,
    });
  });

  it("非关键包不带 force", async () => {
    const call = vi.spyOn(api, "appAction").mockResolvedValue({ ok: true });
    const { result, confirm } = setup();
    act(() => result.current.run("clear", entry()));
    await act(() => confirm().onSubmit(false));
    expect(call.mock.calls[0][3]).not.toHaveProperty("force");
  });

  it("失败时由对话框显示错误，不另行提示", async () => {
    vi.spyOn(api, "appAction").mockRejectedValue(new Error("操作失败：DELETE_FAILED"));
    const { result, confirm, flash } = setup();
    act(() => result.current.run("uninstall", entry()));
    await expect(confirm().onSubmit(false)).rejects.toThrow("操作失败：DELETE_FAILED");
    expect(flash).not.toHaveBeenCalled();
  });
});

describe("useAppOps.extract", () => {
  it("开一张下载卡片，调用 extractApk，完成后标记完成", async () => {
    const call = vi.spyOn(api, "extractApk").mockResolvedValue(undefined);
    const { result, startTask, patchTask } = setup();
    await act(() => result.current.extract(entry()));
    expect(startTask).toHaveBeenCalledWith({ kind: "download", label: "com.example.app", status: "pulling" });
    expect(call).toHaveBeenCalledWith("S", "com.example.app", expect.any(Object));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", { status: "done" });
  });

  it("失败时卡片显示错误", async () => {
    vi.spyOn(api, "extractApk").mockRejectedValue(new Error("设备上未找到应用"));
    const { result, patchTask } = setup();
    await act(() => result.current.extract(entry()));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", { status: "error", error: "设备上未找到应用" });
  });

  it("取消时卡片标记已取消", async () => {
    vi.spyOn(api, "extractApk").mockRejectedValue(new JobCanceled());
    const { result, patchTask } = setup();
    await act(() => result.current.extract(entry()));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", { status: "canceled" });
  });

  it("把任务快照转为卡片补丁", async () => {
    vi.spyOn(api, "extractApk").mockImplementation(async (_s, _p, hooks) => {
      hooks?.onUpdate?.(snap({ phase: "pulling", progress: 0.5 }) as JobSnapshot<never>);
    });
    const { result, patchTask } = setup();
    await act(() => result.current.extract(entry()));
    expect(patchTask).toHaveBeenCalledWith("task-1", { status: "pulling", progress: 0.5 });
  });
});

describe("useAppOps.install", () => {
  it("一个 APK 一张卡片：上传、等任务完成，刷新应用列表", async () => {
    const upload = vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockResolvedValue({});
    const client = newQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result, startTask, patchTask } = setup(client);
    const a = file("a.apk");
    await act(() => result.current.install([a]));
    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "install", label: "a.apk", status: "uploading", progress: 0 }),
    );
    expect(upload).toHaveBeenCalledWith("S", [a], expect.any(Function), expect.any(AbortSignal));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", { status: "done" });
    expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toContainEqual(["apps", "S"]);
  });

  it("有 OBB 时把数量写进卡片的说明", async () => {
    vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockResolvedValue({ obb: 2 });
    const { result, patchTask } = setup();
    await act(() => result.current.install([file("game.xapk")]));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", {
      status: "done",
      note: tz("apps.install.obb", { n: 2 }),
    });
  });

  it("上传进度写进卡片，传完后进入准备阶段", async () => {
    vi.spyOn(api, "installApps").mockImplementation(async (_s, _f, onProgress) => {
      onProgress(0.4);
      onProgress(1);
      return { id: "j1" };
    });
    vi.spyOn(api, "watchJob").mockResolvedValue({});
    const { result, patchTask } = setup();
    await act(() => result.current.install([file("a.apk")]));
    expect(patchTask).toHaveBeenCalledWith("task-1", { progress: 0.4 });
    expect(patchTask).toHaveBeenCalledWith("task-1", { status: "preparing", progress: undefined, cancel: undefined });
  });

  it("安装阶段不可取消，卡片去掉取消按钮", async () => {
    vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockImplementation(async (_id, onUpdate) => {
      onUpdate(snap({ phase: "installing", cancelable: false }) as JobSnapshot<never>);
      return {} as never;
    });
    const { result, patchTask } = setup();
    await act(() => result.current.install([file("a.apk")]));
    expect(patchTask).toHaveBeenCalledWith("task-1", { status: "installing", progress: undefined, cancel: undefined });
  });

  it("base.apk 与 split_*.apk 合为一张卡片，一次上传", async () => {
    const upload = vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockResolvedValue({});
    const { result, startTask } = setup();
    const files = [file("base.apk"), file("split_a.apk"), file("split_b.apk")];
    await act(() => result.current.install(files));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toEqual(files);
    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ label: tz("common.itemsEtc", { name: "base.apk", n: 3 }) }),
    );
  });

  it("多个文件按顺序安装：上一个完成后才上传下一个", async () => {
    const gate = deferred<Record<string, never>>();
    const upload = vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockReturnValueOnce(gate.promise).mockResolvedValue({});
    const { result } = setup();
    let done!: Promise<void>;
    act(() => {
      done = result.current.install([file("a.apk"), file("b.apk")]);
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][1][0].name).toBe("a.apk");
    gate.resolve({});
    await act(() => done);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][1][0].name).toBe("b.apk");
  });

  it("一个失败不影响后面的，卡片显示错误", async () => {
    const upload = vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockRejectedValueOnce(new Error("安装失败：x")).mockResolvedValue({});
    const { result, patchTask } = setup();
    await act(() => result.current.install([file("a.apk"), file("b.apk")]));
    expect(upload).toHaveBeenCalledTimes(2);
    expect(patchTask).toHaveBeenCalledWith("task-1", { status: "error", error: "安装失败：x" });
  });

  it("取消上传时卡片标记已取消", async () => {
    vi.spyOn(api, "installApps").mockRejectedValue(new JobCanceled());
    const { result, patchTask } = setup();
    await act(() => result.current.install([file("a.apk")]));
    expect(patchTask).toHaveBeenLastCalledWith("task-1", { status: "canceled" });
  });

  it("卡片的取消按钮中止上传", async () => {
    let signal!: AbortSignal;
    vi.spyOn(api, "installApps").mockImplementation(async (_s, _f, _p, s) => {
      signal = s as AbortSignal;
      throw new JobCanceled();
    });
    const { result, startTask } = setup();
    await act(() => result.current.install([file("a.apk")]));
    const cancel = startTask.mock.calls[0][0].cancel as () => void;
    expect(signal.aborted).toBe(false);
    cancel();
    expect(signal.aborted).toBe(true);
  });

  it("不支持的文件被跳过并提示，其余照常安装", async () => {
    const upload = vi.spyOn(api, "installApps").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockResolvedValue({});
    const { result, flash } = setup();
    await act(() => result.current.install([file("a.txt"), file("b.apk"), file("c.zip")]));
    expect(flash).toHaveBeenCalledWith(tz("apps.install.unsupported", { names: "a.txt, c.zip" }));
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("全是不支持的文件时只提示，不上传", async () => {
    const upload = vi.spyOn(api, "installApps");
    const { result, flash, startTask } = setup();
    await act(() => result.current.install([file("a.txt")]));
    expect(flash).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(startTask).not.toHaveBeenCalled();
  });
});
