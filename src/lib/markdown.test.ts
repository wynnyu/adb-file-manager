import { describe, expect, it } from "vitest";
import { headingSlug, type LinkTarget, resolveLink, slugger } from "./markdown.ts";

const dir = "/sdcard/docs";

describe("resolveLink", () => {
  it.each<[string, LinkTarget]>([
    ["a.png", { kind: "device", path: "/sdcard/docs/a.png" }],
    ["./img/a.png", { kind: "device", path: "/sdcard/docs/img/a.png" }],
    ["../x.md", { kind: "device", path: "/sdcard/x.md" }],
    ["../../../../x.md", { kind: "device", path: "/x.md" }],
    ["/system/a.png", { kind: "device", path: "/system/a.png" }],
    ["a%20b.png", { kind: "device", path: "/sdcard/docs/a b.png" }],
    ["a.png?raw=true#top", { kind: "device", path: "/sdcard/docs/a.png" }],
    ["100%.png", { kind: "device", path: "/sdcard/docs/100%.png" }],
    ["https://example.com/a?b=1", { kind: "external", href: "https://example.com/a?b=1" }],
    ["mailto:a@b.c", { kind: "external", href: "mailto:a@b.c" }],
    ["#%E6%A0%87%E9%A2%98", { kind: "anchor", id: "标题" }],
    ["#intro", { kind: "anchor", id: "intro" }],
    ["?x=1#intro", { kind: "anchor", id: "intro" }],
  ])("%s", (href, expected) => {
    expect(resolveLink(dir, href)).toEqual(expected);
  });
});

describe("headingSlug", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["What's new? (v1.2)", "whats-new-v12"],
    ["安装 与 使用", "安装-与-使用"],
    ["snake_case and kebab-case", "snake_case-and-kebab-case"],
    ["  Trim  ", "trim"],
  ])("%s 转为 %s", (text, expected) => {
    expect(headingSlug(text)).toBe(expected);
  });
});

describe("slugger", () => {
  it("重复的标题依次追加 -1、-2", () => {
    const slug = slugger();
    expect([slug("Usage"), slug("Usage"), slug("Usage"), slug("Other")]).toEqual([
      "usage",
      "usage-1",
      "usage-2",
      "other",
    ]);
  });

  it("每个文档使用独立的计数", () => {
    expect(slugger()("A")).toBe("a");
    expect(slugger()("A")).toBe("a");
  });
});
