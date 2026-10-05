import { describe, expect, it } from "vitest";
import { decodeText, parseRange } from "./preview.ts";

describe("parseRange", () => {
  it.each([
    ["bytes=0-99", { start: 0, end: 99 }],
    ["bytes=100-", { start: 100, end: 999 }],
    ["bytes=-200", { start: 800, end: 999 }],
    ["bytes=900-5000", { start: 900, end: 999 }],
    ["bytes=-5000", { start: 0, end: 999 }],
    [" bytes=0-0 ", { start: 0, end: 0 }],
  ])("%s 解析为 %j", (header, range) => {
    expect(parseRange(header, 1000)).toEqual(range);
  });

  it.each([["bytes=1000-"], ["bytes=1000-1200"], ["bytes=-0"]])("%s 超出文件，返回 unsatisfiable", (header) => {
    expect(parseRange(header, 1000)).toBe("unsatisfiable");
  });

  it("空文件的任何范围都无法满足", () => {
    expect(parseRange("bytes=0-", 0)).toBe("unsatisfiable");
    expect(parseRange("bytes=-10", 0)).toBe("unsatisfiable");
  });

  it.each([
    [undefined],
    [""],
    ["bytes=-"],
    ["bytes=5-2"],
    ["bytes=0-10,20-30"],
    ["items=0-10"],
    ["bytes=a-b"],
    ["bytes=99999999999999999999-"],
  ])("%j 按完整内容响应", (header) => {
    expect(parseRange(header, 1000)).toBeNull();
  });
});

describe("decodeText", () => {
  const utf8 = (s: string) => Buffer.from(s, "utf8");

  it("解码 UTF-8 文本", () => {
    expect(decodeText(utf8("ro.build=1\n中文"), 100)).toEqual({
      kind: "text",
      text: "ro.build=1\n中文",
      truncated: false,
      limit: 100,
    });
  });

  it("空文件为空文本", () => {
    expect(decodeText(Buffer.alloc(0), 100)).toEqual({ kind: "text", text: "", truncated: false, limit: 100 });
  });

  it("去掉 UTF-8 BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8("abc")]);
    expect(decodeText(buf, 100)).toMatchObject({ kind: "text", text: "abc" });
  });

  it("开头含 NUL 判为二进制", () => {
    expect(decodeText(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), 100)).toEqual({ kind: "binary" });
  });

  it("不是合法 UTF-8 判为二进制", () => {
    // GBK 编码的“中文”
    expect(decodeText(Buffer.from([0xd6, 0xd0, 0xce, 0xc4]), 100)).toEqual({ kind: "binary" });
  });

  it("超过 limit 时截断，并去掉末尾被切开的半个汉字", () => {
    // “中”占 3 个字节，limit 为 5 时第二个字只剩 2 个字节
    expect(decodeText(utf8("中文字"), 5)).toEqual({ kind: "text", text: "中", truncated: true, limit: 5 });
  });

  it("截断位置正好在字符边界上时保留完整内容", () => {
    expect(decodeText(utf8("中文字"), 6)).toEqual({ kind: "text", text: "中文", truncated: true, limit: 6 });
  });
});
