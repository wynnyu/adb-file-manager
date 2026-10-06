import { tags } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import { codeHighlight, codeHighlightCss, highlightLines, languageFor, languageForFence } from "./code.ts";

describe("languageFor", () => {
  it.each([
    ["build.prop", "ro.build.type=user", "Properties files"],
    ["a.kt", "fun main() {}", "Kotlin"],
    ["init.sh", "echo hi", "Shell"],
    ["AndroidManifest.xml", "<manifest/>", "XML"],
    ["settings.gradle", "include ':app'", "Groovy"],
    ["install", "#!/system/bin/sh\necho hi", "Shell"],
    ["tool", "#!/usr/bin/env python3\nprint(1)", "Python"],
  ])("%s 识别为 %s", (name, text, expected) => {
    expect(languageFor(name, text)?.name).toBe(expected);
  });

  it.each([
    ["x.log", "boot completed"],
    ["notes", "plain text"],
    ["data", "#!/usr/bin/perl"],
  ])("%s 没有对应语言时返回 null", (name, text) => {
    expect(languageFor(name, text)).toBeNull();
  });
});

describe("languageForFence", () => {
  it.each([
    ["js", "JavaScript"],
    ["ts", "TypeScript"],
    ["sh", "Shell"],
    ["kotlin", "Kotlin"],
    ["prop", "Properties files"],
    ["python {.line-numbers}", "Python"],
  ])("%s 识别为 %s", (info, expected) => {
    expect(languageForFence(info)?.name).toBe(expected);
  });

  it.each([[""], ["   "], ["no-such-language"]])("“%s” 没有对应语言时返回 null", (info) => {
    expect(languageForFence(info)).toBeNull();
  });
});

describe("highlightLines", () => {
  it("关键字的类名与源码视图一致，并按换行切分", async () => {
    const support = await languageForFence("js")?.load();
    if (!support) throw new Error("JavaScript 语言包加载失败");
    const lines = highlightLines("const a = 1;\nlet b;", support.language);
    expect(lines).toHaveLength(2);
    const keyword = codeHighlight.style([tags.keyword]);
    expect(keyword).toBeTruthy();
    expect(lines[0][0]).toEqual({ text: "const", cls: keyword });
    expect(lines.map((l) => l.map((x) => x.text).join(""))).toEqual(["const a = 1;", "let b;"]);
  });

  it("导出样式规则文本", () => {
    expect(codeHighlightCss).toContain("var(--color-mauve)");
  });
});
