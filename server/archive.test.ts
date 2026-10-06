import { describe, expect, it } from "vitest";
import type { ArchiveEntry } from "../shared/types.d.ts";
import { AdbError } from "./adb.ts";
import {
  archiveFormat,
  assertSafeEntries,
  extractName,
  packBase,
  packName,
  parseTarList,
  parseZipList,
  topLevelSingle,
} from "./archive.ts";

const lines = (...ls: string[]) => ls.join("\n");
const entry = (path: string, extra: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  path,
  isDir: false,
  size: 0,
  ...extra,
});

describe("archiveFormat", () => {
  it.each([
    ["a.zip", "zip"],
    ["App.APK", "zip"],
    ["a.apks", "zip"],
    ["a.xapk", "zip"],
    ["lib.jar", "zip"],
    ["lib.aar", "zip"],
    ["a.tar", "tar"],
    ["a.tar.gz", "tgz"],
    ["a.TGZ", "tgz"],
    ["a.tar.bz2", "tbz"],
    ["a.tbz2", "tbz"],
    ["a.tbz", "tbz"],
    ["a.7z", null],
    ["a.rar", null],
    ["a.tar.xz", null],
    ["a.gz", null],
    ["zip", null],
  ])("%s 的格式为 %s", (name, format) => {
    expect(archiveFormat(name)).toBe(format);
  });
});

describe("extractName", () => {
  it.each([
    ["photos.zip", "photos"],
    ["backup.tar.gz", "backup"],
    ["backup.tar.bz2", "backup"],
    ["a.b.tgz", "a.b"],
    ["App.APK", "App"],
    [".zip", ".zip"],
  ])("%s 解压到 %s", (name, expected) => {
    expect(extractName(name)).toBe(expected);
  });
});

describe("parseZipList", () => {
  const out = lines(
    "Archive:  /sdcard/a.apk",
    " Length   Method    Size  Cmpr    Date    Time   CRC-32   Name",
    "--------  ------  ------- ---- ---------- ----- --------  ----",
    "       0  Stored        0   0% 2009-01-01 00:00 00000000  res/",
    "     744  Defl:N      410  45% 2009-01-01 00:00 1cfb89e7  res/a b.xml",
    "    1308  Defl:N      416  68% 2024-05-06 13:45 f79f3979  中文/文件.txt",
    "--------          -------  ---                            -------",
    "    2052               826  60%                            3 files",
  );

  it("解析条目，名称以 / 结尾的是目录，跳过表头、分隔线和汇总", () => {
    expect(parseZipList(out)).toEqual([
      { path: "res", isDir: true, size: 0, date: "2009-01-01 00:00" },
      { path: "res/a b.xml", isDir: false, size: 744, date: "2009-01-01 00:00" },
      { path: "中文/文件.txt", isDir: false, size: 1308, date: "2024-05-06 13:45" },
    ]);
  });

  it("兼容 CRLF 换行", () => {
    expect(parseZipList(out.replace(/\n/g, "\r\n")).map((e) => e.path)).toEqual([
      "res",
      "res/a b.xml",
      "中文/文件.txt",
    ]);
  });

  it("没有条目时为空", () => {
    expect(parseZipList("unzip: couldn't open a.zip: Invalid file\n")).toEqual([]);
  });
});

describe("parseTarList", () => {
  const row = (mode: string, owner: string, size: number, name: string) =>
    `${mode} ${owner} ${String(size).padStart(9)}  2026-10-06 22:31 ${name}`;

  it.each([
    [
      "空格文件名",
      row("-rw-rw-rw-", "shell/shell", 3, "pkg/hello world.txt"),
      { path: "pkg/hello world.txt", size: 3 },
    ],
    ["./ 前缀", row("-rw-r--r--", "root/root", 2, "./a/1.txt"), { path: "a/1.txt", size: 2 }],
    ["目录", row("drwxr-xr-x", "shell/shell", 0, "pkg/sub/"), { path: "pkg/sub", isDir: true }],
    [
      "符号链接",
      row("lrwxrwxrwx", "shell/shell", 0, "pkg/lnk -> top.txt"),
      { path: "pkg/lnk", isDir: false, link: "top.txt" },
    ],
    ["硬链接", row("hrw-r--r--", "shell/shell", 0, "pkg/copy link to pkg/top.txt"), { path: "pkg/copy", isDir: false }],
    ["数字 uid", row("-rw-r--r--", "1000/1000", 12, "x.bin"), { path: "x.bin", size: 12 }],
  ])("%s", (_name, line, expected) => {
    const [e] = parseTarList(line);
    expect(e).toMatchObject(expected);
    expect(e.date).toBe("2026-10-06 22:31");
    if (!("link" in expected)) expect(e).not.toHaveProperty("link");
  });

  it("跳过根目录 ./ 和无法识别的行", () => {
    const out = lines(
      row("drwxr-xr-x", "0/0", 0, "./"),
      "tar: removing leading '/'",
      row("-rw-r--r--", "0/0", 1, "./a"),
    );
    expect(parseTarList(out).map((e) => e.path)).toEqual(["a"]);
  });
});

describe("assertSafeEntries", () => {
  it("正常的条目通过", () => {
    expect(() =>
      assertSafeEntries([
        entry("a", { isDir: true }),
        entry("a/b.txt"),
        entry("a/lnk", { link: "b.txt" }),
        entry("..a/b.."),
      ]),
    ).not.toThrow();
  });

  it.each([
    ["绝对路径", [entry("/etc/passwd")]],
    ["以 .. 开头", [entry("../evil")]],
    ["中间含 ..", [entry("a/../../evil")]],
    ["位于符号链接之下", [entry("lnk", { link: "/data" }), entry("lnk/evil")]],
    ["位于深层符号链接之下", [entry("a/lnk", { link: ".." }), entry("a/lnk/x/y")]],
  ])("拒绝%s", (_name, entries) => {
    expect(() => assertSafeEntries(entries)).toThrow(AdbError);
  });

  it("以 400 状态拒绝", () => {
    try {
      assertSafeEntries([entry("../x")]);
      expect.unreachable();
    } catch (e) {
      expect((e as AdbError).status).toBe(400);
    }
  });
});

describe("topLevelSingle", () => {
  it.each([
    ["唯一的顶层文件夹", [entry("pkg", { isDir: true }), entry("pkg/a.txt")], "pkg"],
    ["没有单独列出顶层文件夹", [entry("pkg/a.txt"), entry("pkg/b/c.txt")], "pkg"],
    ["唯一的顶层文件", [entry("a.txt")], "a.txt"],
    ["多个顶层项目", [entry("a/1.txt"), entry("root.txt")], null],
    ["空压缩包", [], null],
  ])("%s", (_name, entries, expected) => {
    expect(topLevelSingle(entries)).toBe(expected);
  });
});

describe("packBase", () => {
  it("单项以其父目录为基准", () => {
    expect(packBase(["/sdcard/DCIM/Camera"])).toEqual({ base: "/sdcard/DCIM", names: ["Camera"] });
  });

  it("同目录多项以该目录为基准，忽略路径末尾的斜杠", () => {
    expect(packBase(["/sdcard/a.txt", "/sdcard/b/"])).toEqual({ base: "/sdcard", names: ["a.txt", "b"] });
  });

  it("跨目录时取公共父目录，包内路径保留相对层级", () => {
    expect(packBase(["/sdcard/x/a.txt", "/sdcard/y/z/b.txt"])).toEqual({
      base: "/sdcard",
      names: ["x/a.txt", "y/z/b.txt"],
    });
  });

  it("按路径段比较，/sdcard/ab 与 /sdcard/a 的公共父目录是 /sdcard", () => {
    expect(packBase(["/sdcard/ab/f", "/sdcard/a/f"]).base).toBe("/sdcard");
  });

  it("去掉重复项和被其他所选项包含的项", () => {
    expect(packBase(["/sdcard/a", "/sdcard/a/b.txt", "/sdcard/a", "/sdcard/c"])).toEqual({
      base: "/sdcard",
      names: ["a", "c"],
    });
  });

  it("名字相同但路径不同的项不算包含", () => {
    expect(packBase(["/sdcard/a", "/sdcard/a.txt"]).names).toEqual(["a", "a.txt"]);
  });

  it("所选项直接位于根目录下时基准是根目录", () => {
    expect(packBase(["/data"])).toEqual({ base: "/", names: ["data"] });
  });

  it("根目录被拒绝", () => {
    expect(() => packBase(["/"])).toThrow(AdbError);
    expect(() => packBase(["/sdcard/a", "/"])).toThrow(AdbError);
  });
});

describe("packName", () => {
  it.each([
    [["a.jpg"], "zip", "a.jpg.zip"],
    [["Download"], "tgz", "Download.tar.gz"],
    [["x/y"], "zip", "y.zip"],
    [["a", "b"], "zip", "Archive.zip"],
    [["a", "b"], "tgz", "Archive.tar.gz"],
    [["a"], "tbz", "a.tar.bz2"],
    [["a"], "tar", "a.tar"],
  ] as const)("%j 压缩为 %s 时命名为 %s", (names, format, expected) => {
    expect(packName([...names], format)).toBe(expected);
  });
});
