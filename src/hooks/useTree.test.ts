import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sort } from "../lib/index.ts";
import { api, type Target } from "../lib/index.ts";
import { deferred, file, folder, newQueryClient, providers } from "../test/utils.tsx";
import type { FileEntry, TreeRow } from "../types.ts";
import { useTree } from "./useTree.ts";

const T: Target = { serial: "A", root: false };
const SORT: Sort = { key: "name", asc: true };
const dcim = folder("/sdcard/DCIM");
const music = folder("/sdcard/Music");
const txt = file("/sdcard/a.txt");
const VISIBLE = [dcim, music, txt];

const fs: Record<string, FileEntry[]> = {
  "/sdcard/DCIM": [file("/sdcard/DCIM/z.jpg"), folder("/sdcard/DCIM/Camera"), file("/sdcard/DCIM/.thumbs")],
  "/sdcard/DCIM/Camera": [file("/sdcard/DCIM/Camera/1.jpg")],
};

beforeEach(() => {
  vi.spyOn(api, "ls").mockImplementation(async (_t, p) => {
    if (!fs[p]) throw new Error("无读取权限");
    return fs[p];
  });
});

interface Props {
  path: string;
  active: boolean;
  target: Target;
}

function setup(initial: Partial<Props> = {}) {
  return renderHook((p: Props) => useTree({ visible: VISIBLE, sort: SORT, showHidden: false, online: true, ...p }), {
    initialProps: { path: "/sdcard", active: true, target: T, ...initial },
    wrapper: providers(newQueryClient()),
  });
}

/** 把行写成“缩进 + 名称”，错误提示写成“缩进 + ! + 内容” */
const outline = (rows: TreeRow[]) =>
  rows.map((r) => "  ".repeat(r.depth) + ("entry" in r ? r.entry.name : `!${r.note}`));

describe("useTree", () => {
  it("没有展开时每个条目一行", () => {
    const { result } = setup();
    expect(outline(result.current.rows)).toEqual(["DCIM", "Music", "a.txt"]);
  });

  it("展开的文件夹下面紧跟它排好序的内容，加载期间算作 pending", async () => {
    const { result } = setup();
    act(() => result.current.toggleExpand(dcim));
    expect(result.current.expanded.has(dcim.path)).toBe(true);
    expect(result.current.pending.has(dcim.path)).toBe(true);

    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(outline(result.current.rows)).toEqual(["DCIM", "  Camera", "  z.jpg", "Music", "a.txt"]);
  });

  it("可以逐层展开", async () => {
    const { result } = setup();
    act(() => result.current.toggleExpand(dcim));
    act(() => result.current.toggleExpand(folder("/sdcard/DCIM/Camera")));
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(outline(result.current.rows)).toEqual(["DCIM", "  Camera", "    1.jpg", "  z.jpg", "Music", "a.txt"]);
  });

  it("读取失败时在文件夹下面显示错误", async () => {
    const { result } = setup();
    act(() => result.current.toggleExpand(music));
    await waitFor(() => expect(result.current.pending.size).toBe(0));
    expect(outline(result.current.rows)).toEqual(["DCIM", "Music", "  !无读取权限", "a.txt"]);
  });

  it("toggleExpand 第二个参数指定展开或收起", async () => {
    const { result } = setup();
    act(() => result.current.toggleExpand(dcim, false));
    expect(result.current.expanded.size).toBe(0);
    act(() => result.current.toggleExpand(dcim, true));
    act(() => result.current.toggleExpand(dcim, true));
    expect(result.current.expanded.has(dcim.path)).toBe(true);
    act(() => result.current.toggleExpand(dcim));
    expect(result.current.expanded.size).toBe(0);
  });

  it("不在列表视图时不加载展开的文件夹", () => {
    const { result } = setup({ active: false });
    act(() => result.current.toggleExpand(dcim));
    expect(api.ls).not.toHaveBeenCalled();
  });

  it("换目录或设备时全部收起", async () => {
    const pending = deferred<FileEntry[]>();
    vi.mocked(api.ls).mockReturnValue(pending.promise);
    const { result, rerender } = setup();
    act(() => result.current.toggleExpand(dcim));
    rerender({ path: "/sdcard/Download", active: true, target: T });
    expect(result.current.expanded.size).toBe(0);

    act(() => result.current.toggleExpand(dcim));
    rerender({ path: "/sdcard/Download", active: true, target: { serial: "B", root: false } });
    expect(result.current.expanded.size).toBe(0);
  });
});
