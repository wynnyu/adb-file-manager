import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as adb from "./adb.ts";
import * as cmds from "./fs-cmds.ts";
import type { JobHandle } from "./jobs.ts";
import { buildZip, compressZip, isPrecompressed } from "./zip.ts";

vi.mock("./adb.ts", async (orig) => ({ ...(await orig<typeof import("./adb.ts")>()), pull: vi.fn(), push: vi.fn() }));
vi.mock("./fs-cmds.ts", async (orig) => ({
  ...(await orig<typeof import("./fs-cmds.ts")>()),
  diskUsage: vi.fn(),
  countSkipped: vi.fn(),
  uniqueName: vi.fn(),
}));

/** 读 zip 的中央目录：条目名和压缩方式（0 为存储，8 为 deflate），不依赖系统的 unzip */
function readZip(file: string) {
  const buf = readFileSync(file);
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    entries.set(buf.toString("utf8", at + 46, at + 46 + nameLen), buf.readUInt16LE(at + 10));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("isPrecompressed", () => {
  it.each([
    ["a.JPG", true],
    ["video.mp4", true],
    ["x.apk", true],
    ["backup.tar.gz", true],
    ["a.txt", false],
    ["notes.json", false],
    ["jpg", false],
  ])("%s 为 %s", (name, expected) => {
    expect(isPrecompressed(name)).toBe(expected);
  });
});

describe("buildZip", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "adbfm-zip-"));
    const src = path.join(root, "src");
    mkdirSync(path.join(src, "空目录"), { recursive: true });
    mkdirSync(path.join(src, "sub dir"));
    writeFileSync(path.join(src, "readme.txt"), "text ".repeat(200));
    writeFileSync(path.join(src, ".hidden"), "x");
    writeFileSync(path.join(src, "sub dir", "中文.txt"), "你好");
    writeFileSync(path.join(src, "photo.jpg"), "jpeg ".repeat(200));
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("包含空目录、隐藏文件和中文名，条目名相对源目录", async () => {
    const out = path.join(root, "out.zip");
    await buildZip(path.join(root, "src"), out);
    const names = [...readZip(out).keys()].sort();
    expect(names).toEqual(["空目录/", ".hidden", "photo.jpg", "readme.txt", "sub dir/", "sub dir/中文.txt"].sort());
  });

  it("已压缩的格式存储，其他文件压缩", async () => {
    const out = path.join(root, "method.zip");
    await buildZip(path.join(root, "src"), out);
    const entries = readZip(out);
    expect(entries.get("photo.jpg")).toBe(0);
    expect(entries.get("readme.txt")).toBe(8);
  });

  it.skipIf(process.platform === "win32")("源目录里的符号链接不会让打包失败", async () => {
    const dir = path.join(root, "withlink");
    mkdirSync(dir);
    writeFileSync(path.join(dir, "f.txt"), "1");
    symlinkSync("f.txt", path.join(dir, "link"));
    const out = path.join(root, "link.zip");
    await expect(buildZip(dir, out)).resolves.toBeUndefined();
    expect(readZip(out).has("f.txt")).toBe(true);
  });

  it("按已处理的输入字节回调进度，结束时为 1", async () => {
    const out = path.join(root, "progress.zip");
    const seen: number[] = [];
    await buildZip(path.join(root, "src"), out, { onProgress: (f) => seen.push(f), total: 1000 + 1 + 6 + 1000 });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((f) => f >= 0 && f <= 1)).toBe(true);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });

  it("signal 已取消时以 AbortError 结束", async () => {
    const out = path.join(root, "aborted.zip");
    const controller = new AbortController();
    controller.abort();
    await expect(buildZip(path.join(root, "src"), out, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("打包过程中取消会结束，不会挂起", async () => {
    const big = path.join(root, "big");
    mkdirSync(big);
    for (let i = 0; i < 200; i++) writeFileSync(path.join(big, `f${i}.bin`), Buffer.alloc(64 * 1024, i));
    const controller = new AbortController();
    const done = buildZip(big, path.join(root, "big.zip"), { signal: controller.signal });
    setTimeout(() => controller.abort(), 5);
    await expect(done).rejects.toBeDefined();
  });
});

describe("compressZip", () => {
  const ctx: adb.Ctx = { serial: "S1", root: false };

  /** 记录阶段、进度和 cancelable 的假 JobHandle */
  function fakeJob() {
    const controller = new AbortController();
    const phases: { phase: string; cancelable: boolean }[] = [];
    const progress: number[] = [];
    const job: JobHandle = {
      signal: controller.signal,
      phase: (phase, opts) => phases.push({ phase, cancelable: opts?.cancelable ?? true }),
      progress: (f) => progress.push(f),
      log: () => {},
    };
    return { job, controller, phases, progress };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(cmds.diskUsage).mockResolvedValue(2048);
    vi.mocked(cmds.countSkipped).mockResolvedValue(2);
    vi.mocked(cmds.uniqueName).mockImplementation(async (_ctx, _base, name) => name);
    vi.mocked(adb.pull).mockImplementation(async (_ctx, remote, local) => {
      writeFileSync(path.join(local, path.basename(remote)), "hello ".repeat(100));
    });
  });

  it("依次经过 preparing、pulling、compressing、pushing，推送阶段不可取消", async () => {
    const { job, phases } = fakeJob();
    let pushed: { locals: string[]; signal?: AbortSignal } | undefined;
    vi.mocked(adb.push).mockImplementation(async (_ctx, locals, _dir, signal) => {
      pushed = { locals, signal };
      expect(existsSync(locals[0])).toBe(true);
    });
    const result = await compressZip(ctx, "/sdcard", ["a.txt"], "a.txt.zip", job);
    expect(phases).toEqual([
      { phase: "preparing", cancelable: true },
      { phase: "pulling", cancelable: true },
      { phase: "compressing", cancelable: true },
      { phase: "pushing", cancelable: false },
    ]);
    expect(result).toEqual({ path: "/sdcard/a.txt.zip", skipped: 2 });
    expect(path.basename(pushed?.locals[0] ?? "")).toBe("a.txt.zip");
    expect(pushed?.signal).toBeUndefined();
    expect(existsSync(pushed?.locals[0] ?? "")).toBe(false);
  });

  it("压缩阶段上报进度，空间检查的 diskUsage 带 signal", async () => {
    const { job, progress } = fakeJob();
    await compressZip(ctx, "/sdcard", ["a.txt"], "a.txt.zip", job);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBe(1);
    expect(cmds.diskUsage).toHaveBeenCalledWith(ctx, ["/sdcard/a.txt"], job.signal);
  });

  it("拉取中取消：删除临时目录，不推送", async () => {
    const { job, controller } = fakeJob();
    let local = "";
    vi.mocked(adb.pull).mockImplementation(async (_ctx, _remote, dir, signal) => {
      local = dir;
      controller.abort();
      signal?.throwIfAborted();
    });
    await expect(compressZip(ctx, "/sdcard", ["a.txt"], "a.txt.zip", job)).rejects.toBeDefined();
    expect(existsSync(path.dirname(local))).toBe(false);
    expect(adb.push).not.toHaveBeenCalled();
  });

  it("推送失败：删除临时目录并抛出错误", async () => {
    const { job } = fakeJob();
    let named = "";
    vi.mocked(adb.push).mockImplementation(async (_ctx, locals) => {
      named = locals[0];
      throw new adb.AdbError("push 失败");
    });
    await expect(compressZip(ctx, "/sdcard", ["a.txt"], "a.txt.zip", job)).rejects.toThrow("push 失败");
    expect(existsSync(path.dirname(named))).toBe(false);
  });
});
