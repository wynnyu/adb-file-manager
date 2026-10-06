import { type ExecFileException, execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AdbError,
  AUTH_RETRY_DELAY,
  type AuthWatch,
  assertAbs,
  type ByteRange,
  catCmd,
  execError,
  extractCmd,
  LINK_MARK,
  packCmd,
  parseDu,
  parseLs,
  pickAuthRetries,
  q,
} from "./adb.ts";

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

describe("execError", () => {
  const failure = (props: Partial<ExecFileException>) =>
    Object.assign(new Error("Command failed"), props) as ExecFileException;

  it.each([
    ["超时被终止", failure({ killed: true, signal: "SIGTERM" }), "", 30_000, 504, "30 秒内未完成"],
    [
      "signal 取消不算超时",
      failure({ killed: true, signal: "SIGTERM", name: "AbortError" }),
      "",
      30_000,
      500,
      "Command failed",
    ],
    ["未设超时时被终止不算超时", failure({ killed: true, signal: "SIGTERM" }), "", 0, 500, "Command failed"],
    ["普通失败提取错误行", failure({ code: 1 }), "info\nadb: error: device offline\n", 30_000, 500, "device offline"],
  ])("%s", (_name, err, output, timeout, status, text) => {
    const e = execError(err, output, timeout);
    expect(e).toBeInstanceOf(AdbError);
    expect(e.status).toBe(status);
    expect(e.message).toContain(text);
  });
});

describe("extractCmd", () => {
  it("路径、条目名和暂存目录都经过转义", () => {
    const cmd = extractCmd("/sdcard/it's.zip", "zip", "a'b", "w'rap", "/sdcard/.adbfm-extract-x");
    expect(cmd).toContain(`unzip -o -q '/sdcard/it'\\''s.zip' -d '/sdcard/.adbfm-extract-x'`);
    expect(cmd).toContain(`mv '/sdcard/.adbfm-extract-x/a'\\''b' "$t"`);
    expect(cmd).toContain(`rm -rf '/sdcard/.adbfm-extract-x'`);
  });

  it("没有唯一顶层项目时把暂存目录改名为压缩包名", () => {
    const cmd = extractCmd("/sdcard/a b.tar.gz", "tgz", null, "a b", "/sdcard/.adbfm-extract-x");
    expect(cmd).toContain(`tar -xozf '/sdcard/a b.tar.gz' -C '/sdcard/.adbfm-extract-x'`);
    expect(cmd).toContain(`mv '/sdcard/.adbfm-extract-x' "$t"`);
    expect(cmd).toContain(`b='a b'`);
  });

  it.each([
    ["tar", "tar -xof"],
    ["tgz", "tar -xozf"],
    ["tbz", "tar -xojf"],
  ] as const)("%s 格式使用 %s", (format, expected) => {
    expect(extractCmd("/sdcard/a", format, null, "a", "/sdcard/.s")).toContain(expected);
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

describe("pickAuthRetries", () => {
  const un = [{ serial: "A", state: "unauthorized" }];
  const ok = [{ serial: "A", state: "device" }];

  it("首次出现只记录，不重试", () => {
    const state = new Map<string, AuthWatch>();
    expect(pickAuthRetries(un, 1000, state)).toEqual([]);
    expect(state.get("A")).toEqual({ since: 1000, retried: false });
  });

  it.each([
    [AUTH_RETRY_DELAY - 1, []],
    [AUTH_RETRY_DELAY, ["A"]],
  ])("持续 %i 毫秒后的结果为 %j", (elapsed, expected) => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: false }]]);
    expect(pickAuthRetries(un, elapsed, state)).toEqual(expected);
  });

  it("超时后只重试一次", () => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: false }]]);
    expect(pickAuthRetries(un, AUTH_RETRY_DELAY, state)).toEqual(["A"]);
    expect(pickAuthRetries(un, AUTH_RETRY_DELAY * 3, state)).toEqual([]);
  });

  it.each([
    ["状态恢复", ok],
    ["设备消失", []],
  ])("%s后清除记录，再次待授权时重新计时", (_name, next) => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: true }]]);
    pickAuthRetries(next, 100_000, state);
    expect(state.has("A")).toBe(false);
    expect(pickAuthRetries(un, 200_000, state)).toEqual([]);
    expect(pickAuthRetries(un, 200_000 + AUTH_RETRY_DELAY, state)).toEqual(["A"]);
  });
});

describe("packCmd", () => {
  const stage = "/sdcard/.adbfm-pack-x";

  it("路径、名称和暂存文件都经过转义，名称前有 -- 防止被当成选项", () => {
    const cmd = packCmd("/sdcard/it's", ["-rf", "a b"], "tgz", "x.tar.gz", stage, false);
    expect(cmd).toContain(`tar -czf '${stage}' -C '/sdcard/it'\\''s' -- '-rf' 'a b'`);
  });

  it.each([
    ["tar", "tar -cf"],
    ["tgz", "tar -czf"],
    ["tbz", "tar -cjf"],
  ] as const)("%s 格式使用 %s", (format, expected) => {
    expect(packCmd("/sdcard", ["a"], format, "a", stage, false)).toContain(expected);
  });

  it("成功后移到不重名的位置，失败时删除暂存文件并返回 tar 的退出码", () => {
    const cmd = packCmd("/sdcard", ["a"], "zip", "a.zip", stage, false);
    expect(cmd).toContain(`mv '${stage}' "$t"`);
    expect(cmd).toContain(`rm -f '${stage}'`);
    expect(cmd.endsWith(`exit $r`)).toBe(true);
    expect(cmd.indexOf("tar -c")).toBeLessThan(cmd.indexOf(`mv '${stage}'`));
  });

  it("复合扩展名放在最后，重名时是“名字 2.tar.gz”", () => {
    const cmd = packCmd("/sdcard", ["a"], "tgz", "photos.tar.gz", stage, false);
    expect(cmd).toContain(`b='photos'; e='.tar.gz'`);
  });

  it("只有 root 时才改属主", () => {
    expect(packCmd("/sdcard", ["a"], "tgz", "a.tar.gz", stage, false)).not.toContain("chown");
    expect(packCmd("/data/x", ["a"], "tgz", "a.tar.gz", stage, true)).toContain(
      `chown "$(stat -c %u:%g '/data/x')" "$t"`,
    );
  });
});

describe("parseDu", () => {
  it("把各项的 KB 相加并换算为字节，忽略没有数字开头的行", () => {
    expect(parseDu("12\t/sdcard/a\n8\t/sdcard/b c\n")).toBe(20 * 1024);
    expect(parseDu("du: /x: Permission denied\n4\t/y\n")).toBe(4 * 1024);
    expect(parseDu("")).toBe(0);
  });
});

// 在本机 sh 中执行 packCmd 生成的命令，检查暂存、重名编号和失败清理。设备上是 toybox，这里只验证命令的流程
describe.skipIf(process.platform === "win32")("packCmd 在 shell 中执行", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), "adbfm-pack-"));
    mkdirSync(path.join(root, "src"));
    writeFileSync(path.join(root, "src", "a b.txt"), "hello");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const run = (names: string[], format: "tar" | "tgz", name: string) =>
    execFileSync("sh", ["-c", packCmd(root, names, format, name, path.join(root, ".stage"), false)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const ls = (...args: string[]) =>
    execFileSync("ls", ["-A", ...args, root], { encoding: "utf8" })
      .trim()
      .split("\n");

  it("生成压缩包并输出路径，暂存文件不留下，重名时编号而不覆盖", () => {
    expect(run(["src"], "tgz", "src.tar.gz").trim()).toBe(`__ADBFM_PATH__${root}/src.tar.gz`);
    expect(run(["src"], "tgz", "src.tar.gz").trim()).toBe(`__ADBFM_PATH__${root}/src 2.tar.gz`);
    expect(run(["src"], "tgz", "src.tar.gz").trim()).toBe(`__ADBFM_PATH__${root}/src 3.tar.gz`);
    expect(ls()).toEqual(["src", "src 2.tar.gz", "src 3.tar.gz", "src.tar.gz"]);
    const list = execFileSync("tar", ["-tzf", path.join(root, "src.tar.gz")], { encoding: "utf8" });
    expect(list).toContain("src/a b.txt");
  });

  it("源不存在时失败，退出码非 0，且不留下暂存文件和压缩包", () => {
    const before = ls();
    expect(() => run(["missing"], "tar", "missing.tar")).toThrow();
    expect(ls()).toEqual(before);
  });
});
