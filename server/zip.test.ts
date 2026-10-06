import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildZip, isPrecompressed } from "./zip.ts";

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
});
