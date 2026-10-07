import { describe, expect, it } from "vitest";
import type { ArchiveEntry } from "../../../types.ts";
import { archiveTree, flattenTree, treeStats } from "./archive.ts";
import { archiveFormat, isArchive } from "./kinds.ts";

const f = (path: string, size = 0, extra: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  path,
  isDir: false,
  size,
  ...extra,
});
const d = (path: string): ArchiveEntry => ({ path, isDir: true, size: 0 });

describe("archiveTree", () => {
  it("补齐压缩包没有单独列出的中间目录", () => {
    const tree = archiveTree([f("a/b/c.txt", 5)]);
    expect(tree.map((n) => n.path)).toEqual(["a"]);
    expect(tree[0]).toMatchObject({ name: "a", isDir: true });
    expect(tree[0].children[0]).toMatchObject({ name: "b", path: "a/b", isDir: true });
    expect(tree[0].children[0].children[0]).toMatchObject({ name: "c.txt", isDir: false, size: 5 });
  });

  it("单独列出的目录保留自己的信息，不重复", () => {
    const tree = archiveTree([f("a/x.txt"), d("a")]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
  });

  it("每层文件夹在前，按名称自然排序", () => {
    const tree = archiveTree([f("b.txt"), f("file10"), f("file2"), d("z"), d("A"), f("z/1.txt")]);
    expect(tree.map((n) => n.name)).toEqual(["A", "z", "b.txt", "file2", "file10"]);
  });

  it("有子项的条目一定是目录", () => {
    const [node] = archiveTree([f("a"), f("a/b")]);
    expect(node.isDir).toBe(true);
  });

  it("保留符号链接目标和日期", () => {
    const [node] = archiveTree([f("lnk", 0, { link: "x", date: "2024-01-01 10:00" })]);
    expect(node).toMatchObject({ link: "x", date: "2024-01-01 10:00" });
  });
});

describe("flattenTree", () => {
  const tree = archiveTree([f("a/1.txt", 1), f("a/sub/2.txt", 2), f("b.txt", 4)]);
  const view = (...open: string[]) => flattenTree(tree, new Set(open)).map((r) => [r.node.path, r.depth]);

  it("全部收起时只有顶层", () => {
    expect(view()).toEqual([
      ["a", 0],
      ["b.txt", 0],
    ]);
  });

  it("展开后按前序列出子项并带上层级", () => {
    expect(view("a", "a/sub")).toEqual([
      ["a", 0],
      ["a/sub", 1],
      ["a/sub/2.txt", 2],
      ["a/1.txt", 1],
      ["b.txt", 0],
    ]);
  });

  it("上层收起时，展开的子文件夹也不显示", () => {
    expect(view("a/sub")).toEqual([
      ["a", 0],
      ["b.txt", 0],
    ]);
  });
});

describe("treeStats", () => {
  it("统计整棵树的文件数、文件夹数和大小，与展开状态无关", () => {
    const tree = archiveTree([f("a/1.txt", 1), f("a/sub/2.txt", 2), f("b.txt", 4)]);
    expect(treeStats(tree)).toEqual({ files: 3, dirs: 2, size: 7 });
  });

  it("空树全为 0", () => {
    expect(treeStats([])).toEqual({ files: 0, dirs: 0, size: 0 });
  });
});

describe("archiveFormat", () => {
  it.each([
    ["a.zip", "zip"],
    ["a.APK", "zip"],
    ["a.tar", "tar"],
    ["a.tar.gz", "tgz"],
    ["a.tgz", "tgz"],
    ["a.tar.bz2", "tbz"],
    ["a.tbz", "tbz"],
    ["a.7z", null],
    ["a.rar", null],
    ["a.tar.xz", null],
    ["a.txt", null],
  ])("%s 的格式为 %s", (name, format) => {
    expect(archiveFormat(name)).toBe(format);
    expect(isArchive(name)).toBe(format !== null);
  });
});
