import { describe, expect, it } from "vitest";
import { downloadName } from "./transfer.ts";

describe("downloadName", () => {
  it.each([
    ["单个文件用原名", ["/sdcard/DCIM/a.jpg"], true, "a.jpg"],
    ["单个目录以目录名打包", ["/sdcard/DCIM"], false, "DCIM.zip"],
    ["根目录命名为 root", ["/"], false, "root.zip"],
    ["多选以所在目录命名", ["/sdcard/DCIM/a.jpg", "/sdcard/DCIM/b.jpg"], false, "DCIM.zip"],
    ["多选位于根目录时命名为 files", ["/a", "/b"], false, "files.zip"],
  ])("%s", (_name, paths, single, expected) => {
    expect(downloadName(paths, single)).toBe(expected);
  });
});
