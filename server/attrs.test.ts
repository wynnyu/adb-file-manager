import { describe, expect, it } from "vitest";
import { AdbError } from "./adb.ts";
import { parsePartition, parseStat, parseUsage, statCmd, usageCmd } from "./attrs.ts";
import { parseModeInput, parseOwnerInput } from "./fs-cmds.ts";

const DF = "/dev/fuse 120000000 40000000 80000000 34% /storage/emulated";
const MOUNTS = [
  "/dev/block/dm-9 /data ext4 rw 0 0",
  "/dev/fuse /storage/emulated fuse rw,nosuid 0 0",
  "/dev/fuse /storage/emulated sdcardfs rw 0 0",
  "/dev/fuse /mnt/my\\040disk exfat rw 0 0",
].join("\n");
const TAIL = `\n__ADBFM_MOUNTS__\n${DF}\n__ADBFM_SPLIT__\n${MOUNTS}\n`;

describe("parseStat", () => {
  it("解析完整格式", () => {
    const s = parseStat(
      `regular file|1024|1700000000|1700000100|660|1023|1023|media_rw|media_rw|42|1|u:object_r:sdcardfs:s0${TAIL}`,
      "/storage/emulated/0/a.txt",
    );
    expect(s).toMatchObject({
      name: "a.txt",
      type: "file",
      size: 1024,
      mtime: 1700000000,
      ctime: 1700000100,
      mode: 0o660,
      uid: 1023,
      gid: 1023,
      user: "media_rw",
      group: "media_rw",
      inode: 42,
      links: 1,
      context: "u:object_r:sdcardfs:s0",
    });
    expect(s.link).toBeUndefined();
  });

  it("老设备只有基本字段时其余留空", () => {
    const s = parseStat(`directory|4096|1|2|2775|0|1015${TAIL}`, "/data/media");
    expect(s).toMatchObject({ type: "dir", mode: 0o2775, uid: 0, gid: 1015 });
    expect(s.user).toBeUndefined();
    expect(s.inode).toBeUndefined();
    expect(s.context).toBeUndefined();
  });

  it("符号链接带目标信息，相对目标按所在目录解析", () => {
    const out = `symbolic link|8|1|2|777|0|0|root|root|7|1|u:object_r:rootfs:s0\n__ADBFM_LINK__\n../real\ndirectory|4096${TAIL}`;
    expect(parseStat(out, "/data/link").link).toEqual({
      target: "../real",
      resolved: "/real",
      broken: false,
      targetType: "dir",
      targetSize: 4096,
    });
  });

  it("断开的符号链接标记 broken", () => {
    const out = `symbolic link|8|1|2|777|0|0\n__ADBFM_LINK__\n/nowhere\n__ADBFM_BROKEN__${TAIL}`;
    expect(parseStat(out, "/data/link").link).toEqual({ target: "/nowhere", resolved: "/nowhere", broken: true });
  });

  it("不存在抛 404，无权限抛 403", () => {
    expect(() => parseStat("__ADBFM_NOFILE__\n__ADBFM_MOUNTS__\n", "/x")).toThrow(
      expect.objectContaining({ status: 404 }),
    );
    expect(() => parseStat("__ADBFM_NOPERM__\n__ADBFM_MOUNTS__\n", "/x")).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("带分区信息", () => {
    const s = parseStat(`directory|4096|1|2|755|0|0${TAIL}`, "/storage/emulated/0");
    expect(s.partition).toEqual({
      mount: "/storage/emulated",
      device: "/dev/fuse",
      fsType: "sdcardfs",
      total: 120000000 * 1024,
      free: 80000000 * 1024,
    });
  });
});

describe("parsePartition", () => {
  it("挂载点含转义空格时仍能找到类型", () => {
    const out = `/dev/fuse 100 10 90 10% /mnt/my disk\n__ADBFM_SPLIT__\n${MOUNTS}`;
    expect(parsePartition(out)).toMatchObject({ mount: "/mnt/my disk", fsType: "exfat" });
  });

  it.each([[""], ["df: not found\n__ADBFM_SPLIT__\n"], ["/sdcard: 12G total, 3G used\n__ADBFM_SPLIT__\n"]])(
    "无法解析时返回 undefined：%j",
    (out) => {
      expect(parsePartition(out)).toBeUndefined();
    },
  );
});

describe("parseUsage", () => {
  it("汇总大小和数量，目录数不含自身", () => {
    expect(parseUsage("3\n__ADBFM_SPLIT__\n100\n200\n50\n")).toEqual({ size: 350, files: 3, dirs: 2, partial: false });
  });

  it("出现错误行时标记 partial", () => {
    const out = "2\n__ADBFM_SPLIT__\n10\nfind: '/data/x': Permission denied\n";
    expect(parseUsage(out)).toEqual({ size: 10, files: 1, dirs: 1, partial: true });
  });

  it("空目录", () => {
    expect(parseUsage("1\n__ADBFM_SPLIT__\n")).toEqual({ size: 0, files: 0, dirs: 0, partial: false });
  });
});

describe("命令拼接", () => {
  it("路径经过转义", () => {
    expect(statCmd("/sdcard/it's")).toContain(`'/sdcard/it'\\''s'`);
    expect(usageCmd("/sdcard/a b")).toContain("'/sdcard/a b/'");
  });

  it("统计根目录时不重复斜杠", () => {
    expect(usageCmd("/")).toContain("find '/' ");
  });
});

describe("parseModeInput", () => {
  it.each([["755"], ["0644"], ["4755"]])("接受 %s", (m) => {
    expect(parseModeInput(m)).toBe(m);
  });

  it.each([["75"], ["12345"], ["789"], ["u+x"], ["755; rm -rf /"], [755], [undefined]])("拒绝 %j", (m) => {
    expect(() => parseModeInput(m)).toThrow(AdbError);
  });
});

describe("parseOwnerInput", () => {
  it.each([["u0_a123"], ["root"], ["1023"], ["media_rw"], ["a.b-c"]])("接受 %s", (v) => {
    expect(parseOwnerInput(v)).toBe(v);
  });

  it.each([[undefined], [null], [""]])("%j 视为未指定", (v) => {
    expect(parseOwnerInput(v)).toBeUndefined();
  });

  it.each([["-R"], ["a b"], ["a;b"], ["$(id)"], ["a:b"], [1000]])("拒绝 %j", (v) => {
    expect(() => parseOwnerInput(v)).toThrow(AdbError);
  });
});
