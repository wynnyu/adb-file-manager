import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { dirBytes, watchGrowth } from "./tmp.ts";

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "afm-tmp-test-"));
  mkdirSync(path.join(root, "a/b"), { recursive: true });
  writeFileSync(path.join(root, "x.bin"), Buffer.alloc(100));
  writeFileSync(path.join(root, "a/y.bin"), Buffer.alloc(50));
  writeFileSync(path.join(root, "a/b/z.bin"), Buffer.alloc(25));
  symlinkSync(path.join(root, "x.bin"), path.join(root, "link"));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

describe("dirBytes", () => {
  it("递归累加文件大小，不计符号链接", async () => {
    expect(await dirBytes(root)).toBe(175);
  });

  it("目录不存在时为 0", async () => {
    expect(await dirBytes(path.join(root, "missing"))).toBe(0);
  });
});

describe("watchGrowth", () => {
  it("每 500 毫秒按目录大小回调进度，上限 0.99", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const seen: number[] = [];
    const stop = watchGrowth(root, 350, (f) => seen.push(f));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(seen).toEqual([0.5]));
    stop();
    const tiny: number[] = [];
    const stopTiny = watchGrowth(root, 100, (f) => tiny.push(f));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(tiny).toEqual([0.99]));
    stopTiny();
  });

  it("停止后不再回调；总量未知时不回调", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const seen = vi.fn();
    watchGrowth(root, 0, seen);
    const stopped = watchGrowth(root, 350, seen);
    stopped();
    await vi.advanceTimersByTimeAsync(1500);
    expect(seen).not.toHaveBeenCalled();
  });
});
