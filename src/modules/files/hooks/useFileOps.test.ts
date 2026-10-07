import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DialogState } from "../../../components/overlays/index.ts";
import { api, JobCanceled, loadPref, type Target } from "../../../lib/index.ts";
import { file, folder, providers, tz } from "../../../test/utils.tsx";
import type { JobSnapshot, PullResult } from "../../../types.ts";
import type { Clip } from "../types.ts";
import { useFileOps } from "./useFileOps.ts";

type PromptDialog = Extract<DialogState, { kind: "prompt" }>;
type ConfirmDialog = Extract<DialogState, { kind: "confirm" }>;

const realDownload = api.download;
const running = <R>(patch: Partial<JobSnapshot<R>>): JobSnapshot<R> => ({
  id: "j1",
  state: "running",
  cancelable: true,
  ...patch,
});

const target: Target = { serial: "A", root: false };
const a = file("/sdcard/a.txt");
const b = file("/sdcard/b.txt");

function setup({ rootMode = false, online = true, clip = null as Clip | null, t = target as Target | null } = {}) {
  const deps = {
    setClip: vi.fn(),
    startTask: vi.fn(() => "job" as ReturnType<typeof crypto.randomUUID>),
    patchTask: vi.fn(),
    reload: vi.fn(async () => {}),
    afterChange: vi.fn(async () => {}),
    refreshStorage: vi.fn(),
    openDialog: vi.fn<(d: DialogState) => void>(),
  };
  const hook = renderHook(
    () =>
      useFileOps({
        target: t ? { ...t, root: rootMode } : null,
        online,
        rootMode,
        path: "/sdcard",
        clip,
        setClip: deps.setClip,
        tasks: { startTask: deps.startTask, patchTask: deps.patchTask },
        reload: deps.reload,
        afterChange: deps.afterChange,
        refreshStorage: deps.refreshStorage,
        openDialog: deps.openDialog,
      }),
    { wrapper: providers() },
  );
  const dialog = <D extends DialogState>() => deps.openDialog.mock.lastCall![0] as D;
  return { ...hook, ...deps, dialog };
}

const upItem = (path: string) => ({ file: new File(["x"], path.split("/").at(-1)!), path });

describe("useFileOps", () => {
  beforeEach(() => {
    for (const k of [
      "upload",
      "download",
      "copy",
      "move",
      "extract",
      "compress",
      "remove",
      "rename",
      "mkdir",
    ] as const) {
      vi.spyOn(api, k).mockResolvedValue(undefined as never);
    }
  });

  describe("upload", () => {
    it("上传到当前目录：先显示进度，传到电脑后转为 push，完成后刷新", async () => {
      vi.mocked(api.upload).mockImplementation(async (_t, _d, _f, onProgress) => {
        onProgress(0.5);
        onProgress(1);
      });
      const { result, startTask, patchTask, reload, refreshStorage } = setup();
      const items = [upItem("photos/1.jpg"), upItem("photos/2.jpg")];
      await act(() => result.current.upload(items));

      expect(api.upload).toHaveBeenCalledWith(target, "/sdcard", items, expect.any(Function));
      // 同一个文件夹里的文件只算一项
      expect(startTask).toHaveBeenCalledWith({ kind: "upload", label: "photos", status: "uploading", progress: 0 });
      expect(patchTask.mock.calls).toEqual([
        ["job", { progress: 0.5 }],
        ["job", { status: "pushing", progress: undefined }],
        ["job", { status: "done" }],
      ]);
      expect(refreshStorage).toHaveBeenCalled();
      expect(reload).toHaveBeenCalledWith(true);
    });

    it("多项时名称为“某某等 n 项”，可以指定目标目录", async () => {
      const { result, startTask } = setup();
      await act(() => result.current.upload([upItem("a.txt"), upItem("b.txt")], "/sdcard/Download"));
      expect(api.upload).toHaveBeenCalledWith(target, "/sdcard/Download", expect.anything(), expect.any(Function));
      expect(startTask).toHaveBeenCalledWith(
        expect.objectContaining({ label: tz("common.itemsEtc", { name: "a.txt", n: 2, rest: 1 }) }),
      );
    });

    it("失败时把错误记在传输任务上并刷新（可能已推送一部分）", async () => {
      vi.mocked(api.upload).mockRejectedValue(new Error("空间不足"));
      const { result, patchTask, reload, refreshStorage } = setup();
      await act(() => result.current.upload([upItem("a.txt"), upItem("b.txt")]));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "空间不足" });
      expect(refreshStorage).toHaveBeenCalled();
      expect(reload).toHaveBeenCalledWith(true);
    });

    it("设备离线或没有文件时不上传", async () => {
      const offline = setup({ online: false }).result;
      await act(() => offline.current.upload([upItem("a.txt")]));
      const online = setup().result;
      await act(() => online.current.upload([]));
      expect(api.upload).not.toHaveBeenCalled();
    });
  });

  describe("download", () => {
    it("下载选中的条目并更新任务状态", async () => {
      const { result, startTask, patchTask } = setup();
      await act(() => result.current.download([a, b]));
      expect(api.download).toHaveBeenCalledWith(target, [a.path, b.path], expect.any(Object));
      expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ kind: "download", status: "pulling" }));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "done" });
    });

    it("失败时记下错误", async () => {
      vi.mocked(api.download).mockRejectedValue(new Error("下载已过期"));
      const { result, patchTask } = setup();
      await act(() => result.current.download([a]));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "下载已过期" });
    });

    it("被取消时记为已取消，而不是失败", async () => {
      vi.mocked(api.download).mockRejectedValue(new JobCanceled());
      const { result, patchTask } = setup();
      await act(() => result.current.download([a]));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "canceled" });
    });

    describe("经任务接口", () => {
      beforeEach(() => {
        vi.mocked(api.download).mockImplementation(realDownload);
        vi.spyOn(api, "pull").mockResolvedValue({ id: "j1" });
        vi.spyOn(api, "watchJob");
        vi.spyOn(api, "cancelJob").mockResolvedValue({ ok: true });
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      });

      it("阶段映射为状态，进度写进任务，完成后触发浏览器下载", async () => {
        vi.mocked(api.watchJob).mockImplementation(async (_id, onUpdate) => {
          onUpdate(running({ phase: "preparing" }));
          onUpdate(running({ phase: "pulling", progress: 0.4 }));
          return { token: "t", name: "DCIM.zip" } satisfies PullResult as never;
        });
        const { result, patchTask } = setup();
        await act(() => result.current.download([folder("/sdcard/DCIM")]));
        expect(api.pull).toHaveBeenCalledWith(target, ["/sdcard/DCIM"]);
        expect(patchTask.mock.calls).toEqual([
          ["job", { cancel: expect.any(Function) }],
          ["job", { status: "preparing", progress: undefined }],
          ["job", { status: "pulling", progress: 0.4 }],
          ["job", { status: "done" }],
        ]);
        expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
      });

      it("取消按钮调用 cancelJob，取消后任务为已取消，不触发下载", async () => {
        vi.mocked(api.watchJob).mockRejectedValue(new JobCanceled());
        const { result, patchTask } = setup();
        await act(() => result.current.download([folder("/sdcard/DCIM")]));
        const patch = patchTask.mock.calls[0][1] as { cancel: () => void };
        patch.cancel();
        expect(api.cancelJob).toHaveBeenCalledWith("j1");
        expect(patchTask).toHaveBeenLastCalledWith("job", { status: "canceled" });
        expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
      });

      it("阶段不可取消时去掉取消按钮", async () => {
        vi.mocked(api.watchJob).mockImplementation(async (_id, onUpdate) => {
          onUpdate(running({ phase: "pulling", cancelable: false }));
          return { token: "t", name: "a" } as never;
        });
        const { result, patchTask } = setup();
        await act(() => result.current.download([folder("/sdcard/DCIM")]));
        expect(patchTask).toHaveBeenCalledWith("job", { status: "pulling", progress: undefined, cancel: undefined });
      });

      it("任务失败时记下错误", async () => {
        vi.mocked(api.watchJob).mockRejectedValue(new Error("root 权限已失效"));
        const { result, patchTask } = setup();
        await act(() => result.current.download([folder("/sdcard/DCIM")]));
        expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "root 权限已失效" });
      });
    });
  });

  describe("paste", () => {
    it("拷贝：剪贴板保留，可以继续粘贴", async () => {
      const clip: Clip = { mode: "copy", entries: [a], serial: "A" };
      const { result, setClip, afterChange, refreshStorage } = setup({ clip });
      await act(() => result.current.paste("/sdcard/Download"));
      expect(api.copy).toHaveBeenCalledWith(target, [a.path], "/sdcard/Download");
      expect(setClip).not.toHaveBeenCalled();
      expect(refreshStorage).toHaveBeenCalled();
      expect(afterChange).toHaveBeenCalledWith([], true);
    });

    it("剪切：移动后清空剪贴板，并告知哪些路径移走了", async () => {
      const clip: Clip = { mode: "cut", entries: [folder("/sdcard/DCIM"), a], serial: "A" };
      const { result, setClip, afterChange, startTask } = setup({ clip });
      await act(() => result.current.paste("/sdcard/Backup"));
      expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ kind: "move", status: "moving" }));
      expect(api.move).toHaveBeenCalledWith(target, ["/sdcard/DCIM", a.path], "/sdcard/Backup");
      expect(setClip).toHaveBeenCalledWith(null);
      expect(afterChange).toHaveBeenCalledWith(
        [
          ["/sdcard/DCIM", "/sdcard/Backup/DCIM"],
          ["/sdcard/a.txt", "/sdcard/Backup/a.txt"],
        ],
        true,
      );
    });

    it("失败时记下错误并刷新（可能已完成一部分）", async () => {
      vi.mocked(api.copy).mockRejectedValue(new Error("目标已存在"));
      const clip: Clip = { mode: "copy", entries: [a, b], serial: "A" };
      const { result, patchTask, reload, afterChange } = setup({ clip });
      await act(() => result.current.paste("/sdcard/x"));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "目标已存在" });
      expect(reload).toHaveBeenCalledWith(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it("剪贴板来自另一台设备时不粘贴", async () => {
      const clip: Clip = { mode: "copy", entries: [a], serial: "B" };
      const { result } = setup({ clip });
      await act(() => result.current.paste("/sdcard"));
      expect(api.copy).not.toHaveBeenCalled();
    });
  });

  describe("extract", () => {
    const zip = file("/sdcard/a.zip");

    it("进度记在传输队列里，成功后刷新存储空间和目录", async () => {
      const { result, startTask, patchTask, refreshStorage, afterChange } = setup();
      await act(() => result.current.extract(zip));
      expect(api.extract).toHaveBeenCalledWith(target, zip.path);
      expect(startTask).toHaveBeenCalledWith({ kind: "extract", label: "a.zip", status: "extracting" });
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "done" });
      expect(refreshStorage).toHaveBeenCalled();
      expect(afterChange).toHaveBeenCalledWith([], true);
    });

    it("失败时记下错误，并刷新目录（可能已经解出一部分）", async () => {
      vi.mocked(api.extract).mockRejectedValue(new Error("压缩包含有指向目录之外的路径"));
      const { result, patchTask, reload, afterChange } = setup();
      await act(() => result.current.extract(zip));
      expect(patchTask).toHaveBeenLastCalledWith("job", {
        status: "error",
        error: "压缩包含有指向目录之外的路径",
      });
      expect(reload).toHaveBeenCalledWith(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it("没有设备时不解压", async () => {
      const { result } = setup({ t: null });
      await act(() => result.current.extract(zip));
      expect(api.extract).not.toHaveBeenCalled();
    });
  });

  describe("compress", () => {
    it("多项压缩：按所选路径调用，进度记在传输队列里，成功后刷新存储空间和目录", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "watchJob").mockResolvedValue({ path: "/sdcard/Archive.zip" });
      const { result, startTask, patchTask, refreshStorage, afterChange } = setup();
      await act(() => result.current.compress([a, b], "zip"));
      expect(api.compress).toHaveBeenCalledWith(target, [a.path, b.path], "zip");
      expect(startTask).toHaveBeenCalledWith({
        kind: "compress",
        label: tz("common.itemsEtc", { name: "a.txt", n: 2, rest: 1 }),
        status: "compressing",
      });
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "done" });
      expect(refreshStorage).toHaveBeenCalled();
      expect(afterChange).toHaveBeenCalledWith([], true);
    });

    it("单项以其名称作为标题，格式原样传给接口", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "watchJob").mockResolvedValue({ path: "/sdcard/a.txt.tar.gz" });
      const { result, startTask } = setup();
      await act(() => result.current.compress([a], "tgz"));
      expect(api.compress).toHaveBeenCalledWith(target, [a.path], "tgz");
      expect(startTask).toHaveBeenCalledWith({ kind: "compress", label: "a.txt", status: "compressing" });
    });

    it("zip 跳过了符号链接时，完成状态带上说明", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "watchJob").mockResolvedValue({ path: "/sdcard/d.zip", skipped: 3 });
      const { result, patchTask } = setup();
      await act(() => result.current.compress([folder("/sdcard/d")], "zip"));
      expect(patchTask).toHaveBeenLastCalledWith("job", {
        status: "done",
        note: tz("task.skipped", { n: 3 }),
      });
    });

    it("失败时记下错误并刷新目录", async () => {
      vi.mocked(api.compress).mockRejectedValue(new Error("电脑上的临时空间不足"));
      const { result, patchTask, reload, afterChange } = setup();
      await act(() => result.current.compress([a], "zip"));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "电脑上的临时空间不足" });
      expect(reload).toHaveBeenCalledWith(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it("进度和阶段写进任务，取消按钮调用 cancelJob", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "cancelJob").mockResolvedValue({ ok: true });
      vi.spyOn(api, "watchJob").mockImplementation(async (_id, onUpdate) => {
        onUpdate(running({ phase: "compressing", progress: 0.25 }));
        onUpdate(running({ phase: "pushing", cancelable: false }));
        return { path: "/sdcard/a.txt.zip" } as never;
      });
      const { result, patchTask } = setup();
      await act(() => result.current.compress([a], "zip"));
      expect(patchTask.mock.calls.slice(0, 3)).toEqual([
        ["job", { cancel: expect.any(Function) }],
        ["job", { status: "compressing", progress: 0.25 }],
        ["job", { status: "pushing", progress: undefined, cancel: undefined }],
      ]);
      (patchTask.mock.calls[0][1] as { cancel: () => void }).cancel();
      expect(api.cancelJob).toHaveBeenCalledWith("j1");
    });

    it("被取消时记为已取消并刷新目录，不刷新存储空间", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "watchJob").mockRejectedValue(new JobCanceled());
      const { result, patchTask, reload, refreshStorage, afterChange } = setup();
      await act(() => result.current.compress([a], "zip"));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "canceled" });
      expect(reload).toHaveBeenCalledWith(true);
      expect(refreshStorage).not.toHaveBeenCalled();
      expect(afterChange).not.toHaveBeenCalled();
    });

    it("任务因 root 失效而失败时记下错误", async () => {
      vi.mocked(api.compress).mockResolvedValue({ id: "j1" });
      vi.spyOn(api, "watchJob").mockRejectedValue(new Error("root 权限已失效"));
      const { result, patchTask } = setup();
      await act(() => result.current.compress([a], "zip"));
      expect(patchTask).toHaveBeenLastCalledWith("job", { status: "error", error: "root 权限已失效" });
    });

    it("没有设备或没有选中项时不压缩", async () => {
      const none = setup({ t: null });
      await act(() => none.result.current.compress([a], "zip"));
      const empty = setup();
      await act(() => empty.result.current.compress([], "zip"));
      expect(api.compress).not.toHaveBeenCalled();
    });
  });

  describe("askDelete", () => {
    it("普通删除：确认后删除并告知删掉的路径", async () => {
      const { result, dialog, afterChange, refreshStorage } = setup();
      act(() => result.current.askDelete([a]));
      const d = dialog<ConfirmDialog>();
      expect(d).toMatchObject({ kind: "confirm", tone: "danger", title: tz("delete.title", { name: "a.txt", n: 1 }) });
      expect(d.countdown).toBeUndefined();

      await act(() => d.onSubmit(false));
      expect(api.remove).toHaveBeenCalledWith(target, [a.path]);
      expect(refreshStorage).toHaveBeenCalled();
      expect(afterChange).toHaveBeenCalledWith([[a.path, null]]);
    });

    it("失败时刷新（可能已删掉一部分），错误交给对话框显示", async () => {
      vi.mocked(api.remove).mockRejectedValue(new Error("权限不足"));
      const { result, dialog, afterChange, reload, refreshStorage } = setup();
      act(() => result.current.askDelete([a, b]));
      await expect(dialog<ConfirmDialog>().onSubmit(false)).rejects.toThrow("权限不足");
      expect(refreshStorage).toHaveBeenCalled();
      expect(reload).toHaveBeenCalledWith(true);
      expect(afterChange).not.toHaveBeenCalled();
    });

    it("多项时标题写明数量", () => {
      const { result, dialog } = setup();
      act(() => result.current.askDelete([a, b]));
      expect(dialog().title).toBe(tz("delete.titleMany", { name: "a.txt", n: 2 }));
    });

    it("root 模式下删除内部存储里的内容不额外警告", () => {
      const { result, dialog } = setup({ rootMode: true });
      act(() => result.current.askDelete([a]));
      expect(dialog().title).toBe(tz("delete.title", { name: "a.txt", n: 1 }));
    });

    it("root 模式下删除系统路径：倒计时确认，可勾选不再提示", async () => {
      const sys = file("/data/system/x.db");
      const { result, dialog, openDialog } = setup({ rootMode: true });
      act(() => result.current.askDelete([sys, a]));
      const d = dialog<ConfirmDialog>();
      expect(d).toMatchObject({
        title: tz("delete.titleRootMany", { name: "x.db", n: 2 }),
        countdown: 3,
        checkbox: tz("delete.root.noWarn"),
        message: { kind: "rootDelete", paths: [sys.path] },
      });

      await act(() => d.onSubmit(true));
      expect(api.remove).toHaveBeenCalledWith({ serial: "A", root: true }, [sys.path, a.path]);
      expect(loadPref("afm.rootDeleteNoWarn", false)).toBe(true);

      // 不再提示：换成普通确认框，标题仍写明以 root 权限删除
      act(() => result.current.askDelete([sys]));
      expect(openDialog).toHaveBeenCalledTimes(2);
      expect(dialog<ConfirmDialog>().countdown).toBeUndefined();
      expect(dialog().title).toBe(tz("delete.titleRoot", { name: "x.db", n: 1 }));
    });

    it("没有选中条目时不弹框", () => {
      const { result, openDialog } = setup();
      act(() => result.current.askDelete([]));
      expect(openDialog).not.toHaveBeenCalled();
    });
  });

  describe("askRename", () => {
    it("重命名后告知新旧路径", async () => {
      const { result, dialog, afterChange } = setup();
      act(() => result.current.askRename(a));
      const d = dialog<PromptDialog>();
      expect(d).toMatchObject({ kind: "prompt", initial: "a.txt", title: tz("rename.title") });
      await act(() => d.onSubmit("c.txt"));
      expect(api.rename).toHaveBeenCalledWith(target, a.path, "/sdcard/c.txt");
      expect(afterChange).toHaveBeenCalledWith([[a.path, "/sdcard/c.txt"]]);
    });

    it("名称不变时什么也不做，名称含 / 时报错", async () => {
      const { result, dialog } = setup();
      act(() => result.current.askRename(a));
      const d = dialog<PromptDialog>();
      await d.onSubmit("a.txt");
      await expect(d.onSubmit("x/y")).rejects.toThrow(tz("name.noSlash"));
      expect(api.rename).not.toHaveBeenCalled();
    });
  });

  describe("askMkdir", () => {
    it("默认在当前目录新建，完成后刷新并保留选择", async () => {
      const { result, dialog, reload } = setup();
      act(() => result.current.askMkdir());
      const d = dialog<PromptDialog>();
      expect(d.initial).toBe(tz("mkdir.initial"));
      await act(() => d.onSubmit("新建文件夹"));
      expect(api.mkdir).toHaveBeenCalledWith(target, "/sdcard/新建文件夹");
      expect(reload).toHaveBeenCalledWith(true);
    });

    it("可以指定父目录", async () => {
      const { result, dialog } = setup();
      act(() => result.current.askMkdir("/"));
      await act(() => dialog<PromptDialog>().onSubmit("tmp"));
      expect(api.mkdir).toHaveBeenCalledWith(target, "/tmp");
    });

    it("名称含 / 时报错", async () => {
      const { result, dialog } = setup();
      act(() => result.current.askMkdir());
      await expect(dialog<PromptDialog>().onSubmit("a/b")).rejects.toThrow(tz("name.noSlash"));
    });
  });

  it("没有设备时不弹任何对话框", () => {
    const { result, openDialog } = setup({ t: null });
    act(() => {
      result.current.askDelete([a]);
      result.current.askRename(a);
      result.current.askMkdir();
    });
    expect(openDialog).not.toHaveBeenCalled();
  });
});
