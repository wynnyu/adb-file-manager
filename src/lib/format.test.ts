import { describe, expect, it } from "vitest";
import { basename, formatMode, formatOctal, parseOctal } from "./format.ts";

describe("formatMode", () => {
  it.each([
    [0o755, "rwxr-xr-x"],
    [0o644, "rw-r--r--"],
    [0o000, "---------"],
    [0o777, "rwxrwxrwx"],
    [0o4755, "rwsr-xr-x"],
    [0o4644, "rwSr--r--"],
    [0o2775, "rwxrwsr-x"],
    [0o2664, "rw-rwSr--"],
    [0o1777, "rwxrwxrwt"],
    [0o1776, "rwxrwxrwT"],
  ])("%o 写作 %s", (mode, text) => {
    expect(formatMode(mode)).toBe(text);
  });
});

describe("formatOctal", () => {
  it("没有特殊位时 3 位，有时 4 位", () => {
    expect(formatOctal(0o755)).toBe("755");
    expect(formatOctal(0o7)).toBe("007");
    expect(formatOctal(0o2775)).toBe("2775");
    expect(formatOctal(0o1777)).toBe("1777");
  });
});

describe("parseOctal", () => {
  it.each([
    ["755", 0o755],
    ["0644", 0o644],
    ["4755", 0o4755],
  ])("接受 %s", (text, mode) => {
    expect(parseOctal(text)).toBe(mode);
  });

  it.each([["75"], ["12345"], ["789"], [""], ["rwx"], ["-755"]])("拒绝 %j", (text) => {
    expect(parseOctal(text)).toBeNull();
  });
});

describe("basename", () => {
  it("取最后一段", () => {
    expect(basename("/sdcard/DCIM/a.jpg")).toBe("a.jpg");
    expect(basename("/sdcard")).toBe("sdcard");
  });
});
