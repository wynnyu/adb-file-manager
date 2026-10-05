import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdbError, assertAbs, type ByteRange, catCmd, LINK_MARK, parseLs, q } from "./adb.ts";

describe("assertAbs", () => {
  it("规范化路径", () => {
    expect(assertAbs("/sdcard/../data//local/")).toBe("/data/local/");
    expect(assertAbs("/sdcard/./DCIM")).toBe("/sdcard/DCIM");
  });

  it.each([["sdcard"], [""], ["/sdcard/\0x"], [undefined], [["/sdcard"]]])("拒绝 %j", (p) => {
    expect(() => assertAbs(p)).toThrow(AdbError);
  });
});

describe("q", () => {
  it("用单引号包住并转义其中的单引号", () => {
    expect(q("a b")).toBe("'a b'");
    expect(q("it's")).toBe(`'it'\\''s'`);
    expect(q("$(rm -rf /)")).toBe("'$(rm -rf /)'");
  });
});

describe("catCmd", () => {
  it("不分段时整个读取", () => {
    expect(catCmd("/sdcard/a b.mp4")).toBe("cat '/sdcard/a b.mp4' 2>/dev/null");
  });

  it("分段时用 dd 按字节跳到起点，不支持时退回 tail 和 head", () => {
    expect(catCmd("/sdcard/a.mp4", { start: 100, end: 199 })).toBe(
      "dd if='/sdcard/a.mp4' bs=65536 skip=100 count=100 iflag=skip_bytes,count_bytes 2>/dev/null || " +
        "tail -c +101 '/sdcard/a.mp4' 2>/dev/null | head -c 100",
    );
  });
});

// 在本机 sh 中执行 catCmd 生成的命令，检查读出的字节。设备上是 toybox，这里只能验证命令本身的写法
describe.skipIf(process.platform === "win32")("catCmd 在 shell 中执行", () => {
  const SIZE = 200_000;
  /** 每个字节都不同于相邻位置，读错偏移时能看出来 */
  const data = Buffer.from(Array.from({ length: SIZE }, (_, i) => (i * 31 + (i >> 8)) & 0xff));
  let dir: string;
  let file: string;
  /** 只放了一个总是失败的 dd，模拟不支持 skip_bytes 的旧版 toybox */
  let oldDdBin: string;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "adbfm-cat-"));
    // 文件名带空格和单引号，同时检查 q() 的转义
    file = path.join(dir, "a b'c.bin");
    writeFileSync(file, data);
    oldDdBin = path.join(dir, "bin");
    mkdirSync(oldDdBin);
    const dd = path.join(oldDdBin, "dd");
    writeFileSync(dd, '#!/bin/sh\necho "dd: unknown iflag" >&2\nexit 1\n');
    chmodSync(dd, 0o755);
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const run = (cmd: string, oldDd: boolean) =>
    execFileSync("sh", ["-c", cmd], {
      maxBuffer: SIZE * 2,
      env: { ...process.env, PATH: oldDd ? `${oldDdBin}:${process.env.PATH}` : process.env.PATH },
    });

  const ranges: [string, ByteRange][] = [
    ["开头", { start: 0, end: 9 }],
    ["单个字节", { start: 12_345, end: 12_345 }],
    ["跨越多个 dd 块", { start: 70_000, end: 150_000 }],
    ["到文件末尾", { start: SIZE - 10, end: SIZE - 1 }],
  ];

  it.each(ranges)("dd 不支持 skip_bytes 时退回 tail 和 head：%s", (_, range) => {
    expect(run(catCmd(file, range), true).equals(data.subarray(range.start, range.end + 1))).toBe(true);
  });

  it.each(ranges)("使用本机的 dd：%s", (_, range) => {
    expect(run(catCmd(file, range), false).equals(data.subarray(range.start, range.end + 1))).toBe(true);
  });

  it("不分段时读出整个文件", () => {
    expect(run(catCmd(file), false).equals(data)).toBe(true);
  });
});

describe("parseLs", () => {
  const lines = (...ls: string[]) => ls.join("\n");

  it("解析类型、大小和时间", () => {
    const out = lines(
      "directory|3452|1700000000|1700000001|/sdcard/DCIM",
      "regular file|12|1700000002|1700000003|/sdcard/a.txt",
      "regular empty file|0|1700000004|1700000005|/sdcard/empty",
      LINK_MARK,
      "",
    );
    expect(parseLs(out)).toEqual([
      {
        name: "DCIM",
        path: "/sdcard/DCIM",
        type: "dir",
        isDir: true,
        size: 3452,
        mtime: 1700000000,
        atime: 1700000001,
      },
      {
        name: "a.txt",
        path: "/sdcard/a.txt",
        type: "file",
        isDir: false,
        size: 12,
        mtime: 1700000002,
        atime: 1700000003,
      },
      {
        name: "empty",
        path: "/sdcard/empty",
        type: "file",
        isDir: false,
        size: 0,
        mtime: 1700000004,
        atime: 1700000005,
      },
    ]);
  });

  it("文件名里的 | 保留在名字中", () => {
    const [e] = parseLs(lines("regular file|1|0|0|/sdcard/a|b|c.txt", LINK_MARK));
    expect(e.name).toBe("a|b|c.txt");
  });

  it("只有 LINK_MARK 之后列出的符号链接才算目录", () => {
    const out = lines(
      "symbolic link|21|0|0|/sdcard//to-dir",
      "symbolic link|9|0|0|/sdcard//to-file",
      LINK_MARK,
      "/sdcard//to-dir",
    );
    expect(parseLs(out).map((e) => [e.path, e.type, e.isDir])).toEqual([
      ["/sdcard/to-dir", "link", true],
      ["/sdcard/to-file", "link", false],
    ]);
  });

  it("兼容 CRLF 换行", () => {
    const out = ["symbolic link|21|0|0|/sdcard/to-dir", LINK_MARK, "/sdcard/to-dir", ""].join("\r\n");
    expect(parseLs(out)).toMatchObject([{ path: "/sdcard/to-dir", isDir: true }]);
  });

  it("跳过空行和字段不全的行", () => {
    expect(parseLs(lines("", "garbage", "directory|1|2|/x", LINK_MARK))).toEqual([]);
  });
});
