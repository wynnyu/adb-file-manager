import { describe, expect, it } from "vitest";
import { languageFor } from "./code.ts";

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
