import { existsSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRef, JobSnapshot, PullResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { createApp } from "./app.ts";
import * as cmds from "./fs-cmds.ts";
import { msg } from "./i18n.ts";
import { jobSnapshot } from "./jobs.ts";
import { downloadName } from "./transfer.ts";

vi.mock("./adb.ts", async (orig) => ({ ...(await orig<typeof import("./adb.ts")>()), pull: vi.fn() }));
vi.mock("./fs-cmds.ts", async (orig) => ({
  ...(await orig<typeof import("./fs-cmds.ts")>()),
  isDir: vi.fn(),
  fileSize: vi.fn(),
  diskUsage: vi.fn(),
}));

describe("downloadName", () => {
  it.each([
    ["单个文件用原名", ["/sdcard/DCIM/a.jpg"], true, "a.jpg"],
    ["单个目录以目录名打包", ["/sdcard/DCIM"], false, "DCIM.zip"],
    ["根目录命名为 root", ["/"], false, "root.zip"],
    ["多选以所在目录命名", ["/sdcard/DCIM/a.jpg", "/sdcard/DCIM/b.jpg"], false, "DCIM.zip"],
    ["多选位于根目录时命名为 files", ["/a", "/b"], false, "files.zip"],
  ])("%s", (_name, paths, single, expected) => {
    expect(downloadName(paths, single)).toBe(expected);
  });
});

describe("POST /api/files/pull", () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cmds.diskUsage).mockResolvedValue(1000);
  });

  const start = (paths: string[]) =>
    fetch(`${base}/api/files/pull`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lang": "zh" },
      body: JSON.stringify({ serial: "S1", paths }),
    });

  const settled = async (id: string) => {
    while (jobSnapshot(id)?.state === "running") await new Promise((r) => setTimeout(r, 1));
    return jobSnapshot(id) as JobSnapshot<PullResult>;
  };

  it("单个文件：校验后任务立即完成，结果为 token 和文件名，不拉取", async () => {
    vi.mocked(cmds.isDir).mockResolvedValue(false);
    vi.mocked(cmds.fileSize).mockResolvedValue(10);
    const res = await start(["/sdcard/a.txt"]);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as JobRef;
    const snap = await settled(id);
    expect(snap).toMatchObject({ state: "done", result: { name: "a.txt" } });
    expect(snap.result?.token).toEqual(expect.any(String));
    expect(adb.pull).not.toHaveBeenCalled();
    expect(cmds.diskUsage).not.toHaveBeenCalled();
  });

  it("文件不存在时仍同步返回 404", async () => {
    vi.mocked(cmds.isDir).mockResolvedValue(false);
    vi.mocked(cmds.fileSize).mockRejectedValue(new adb.AdbError(msg("noFile", { path: "/sdcard/a.txt" }), 404));
    const res = await start(["/sdcard/a.txt"]);
    expect(res.status).toBe(404);
  });

  it("目录：先统计大小再拉取，完成后结果为 token 和 zip 名", async () => {
    vi.mocked(cmds.isDir).mockResolvedValue(true);
    const phases: (string | undefined)[] = [];
    let id = "";
    vi.mocked(adb.pull).mockImplementation(async () => {
      phases.push(jobSnapshot(id)?.phase);
    });
    const res = await start(["/sdcard/DCIM"]);
    id = ((await res.json()) as JobRef).id;
    const snap = await settled(id);
    expect(phases).toEqual(["pulling"]);
    expect(cmds.diskUsage).toHaveBeenCalledWith(expect.anything(), ["/sdcard/DCIM"], expect.any(AbortSignal));
    expect(snap).toMatchObject({ state: "done", result: { name: "DCIM.zip" } });
  });

  it("拉取失败：任务为 error，临时目录被删除", async () => {
    vi.mocked(cmds.isDir).mockResolvedValue(true);
    let dir = "";
    vi.mocked(adb.pull).mockImplementation(async (_ctx, _remote, local) => {
      dir = local;
      throw new adb.AdbError("pull 失败");
    });
    const { id } = (await (await start(["/sdcard/DCIM"])).json()) as JobRef;
    expect(await settled(id)).toMatchObject({ state: "error", error: "pull 失败" });
    expect(dir).not.toBe("");
    expect(existsSync(dir)).toBe(false);
  });

  it("拉取中取消：任务为 canceled，临时目录被删除", async () => {
    vi.mocked(cmds.isDir).mockResolvedValue(true);
    let dir = "";
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    vi.mocked(adb.pull).mockImplementation(async (_ctx, _remote, local, signal) => {
      dir = local;
      markStarted();
      await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new adb.AdbError("aborted"))));
    });
    const { id } = (await (await start(["/sdcard/DCIM"])).json()) as JobRef;
    await started;
    expect(existsSync(dir)).toBe(true);
    await fetch(`${base}/api/jobs/${id}/cancel`, { method: "POST" });
    expect(await settled(id)).toMatchObject({ state: "canceled" });
    expect(existsSync(dir)).toBe(false);
  });
});
