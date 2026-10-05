import { fireEvent, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { file, folder } from "../test/utils.tsx";
import type { FileEntry, Listing } from "../types.ts";
import { type ShortcutContext, useShortcuts } from "./useShortcuts.ts";

const dir = folder("/sdcard/DCIM");
const txt = file("/sdcard/a.txt");

function context(patch: Partial<ShortcutContext> = {}): ShortcutContext {
  return {
    blocked: false,
    path: "/sdcard",
    view: "list",
    selectable: [dir, txt],
    selectedEntries: [],
    expanded: new Set(),
    dirs: new Map(),
    sort: { key: "name", asc: true },
    showHidden: false,
    canPaste: false,
    clear: vi.fn(),
    selectOnly: vi.fn(),
    selectAll: vi.fn(),
    step: vi.fn(),
    toggleHidden: vi.fn(),
    toggleExpand: vi.fn(),
    toClip: vi.fn(),
    paste: vi.fn(async () => {}),
    navigate: vi.fn(),
    open: vi.fn(),
    askRename: vi.fn(),
    askDelete: vi.fn(),
    ...patch,
  };
}

function setup(patch: Partial<ShortcutContext> = {}) {
  const ctx = context(patch);
  const hook = renderHook((c: ShortcutContext) => useShortcuts(c), { initialProps: ctx });
  return { ctx, ...hook };
}

/** 按键发在 body 上冒泡到 window，同真实页面；返回 false 表示默认行为被阻止 */
const press = (init: KeyboardEventInit, target: Element = document.body) => fireEvent.keyDown(target, init);

describe("useShortcuts", () => {
  it("Esc 清空选择", () => {
    const { ctx } = setup();
    press({ key: "Escape" });
    expect(ctx.clear).toHaveBeenCalled();
  });

  it("对话框或菜单打开时不响应", () => {
    const { ctx } = setup({ blocked: true });
    press({ key: "Escape" });
    press({ key: "a", ctrlKey: true });
    expect(ctx.clear).not.toHaveBeenCalled();
    expect(ctx.selectAll).not.toHaveBeenCalled();
  });

  it("在输入框里打字时不响应", () => {
    const { ctx } = setup({ selectedEntries: [txt] });
    const input = document.createElement("input");
    document.body.append(input);
    press({ key: "Backspace" }, input);
    press({ key: "a", ctrlKey: true }, input);
    expect(ctx.navigate).not.toHaveBeenCalled();
    expect(ctx.selectAll).not.toHaveBeenCalled();
    input.remove();
  });

  it("Cmd+A 全选，Cmd+Shift+. 切换隐藏文件", () => {
    const { ctx } = setup();
    expect(press({ key: "a", metaKey: true })).toBe(false);
    expect(ctx.selectAll).toHaveBeenCalled();
    press({ key: ">", code: "Period", metaKey: true, shiftKey: true });
    expect(ctx.toggleHidden).toHaveBeenCalled();
  });

  it("Cmd+C / Cmd+X 把选中的条目放进剪贴板，没有选择时交给浏览器", () => {
    const { ctx, rerender } = setup();
    expect(press({ key: "c", ctrlKey: true })).toBe(true);
    expect(ctx.toClip).not.toHaveBeenCalled();

    rerender({ ...ctx, selectedEntries: [txt] });
    expect(press({ key: "c", ctrlKey: true })).toBe(false);
    expect(ctx.toClip).toHaveBeenLastCalledWith("copy", [txt]);
    press({ key: "x", ctrlKey: true });
    expect(ctx.toClip).toHaveBeenLastCalledWith("cut", [txt]);
  });

  it("Cmd+V 在可以粘贴时粘贴到当前目录", () => {
    const { ctx, rerender } = setup();
    press({ key: "v", metaKey: true });
    expect(ctx.paste).not.toHaveBeenCalled();
    rerender({ ...ctx, canPaste: true });
    press({ key: "v", metaKey: true });
    expect(ctx.paste).toHaveBeenCalledWith("/sdcard");
  });

  it("上下方向键移动选择", () => {
    const { ctx } = setup();
    press({ key: "ArrowDown" });
    press({ key: "ArrowUp" });
    expect(vi.mocked(ctx.step).mock.calls).toEqual([[1], [-1]]);
  });

  it("画廊视图里左右方向键也移动选择", () => {
    const { ctx } = setup({ view: "gallery" });
    press({ key: "ArrowRight" });
    press({ key: "ArrowLeft" });
    expect(vi.mocked(ctx.step).mock.calls).toEqual([[1], [-1]]);
  });

  describe("列表视图的左右方向键", () => {
    it("右方向键展开选中的文件夹", () => {
      const { ctx } = setup({ selectedEntries: [dir] });
      press({ key: "ArrowRight" });
      expect(ctx.toggleExpand).toHaveBeenCalledWith(dir, true);
    });

    it("左方向键收起已展开的文件夹", () => {
      const { ctx } = setup({ selectedEntries: [dir], expanded: new Set([dir.path]) });
      press({ key: "ArrowLeft" });
      expect(ctx.toggleExpand).toHaveBeenCalledWith(dir, false);
    });

    it("左方向键在展开出来的子项上时跳回所在的文件夹", () => {
      const child = file("/sdcard/DCIM/x.jpg");
      const { ctx } = setup({ selectedEntries: [child], expanded: new Set([dir.path]) });
      press({ key: "ArrowLeft" });
      expect(ctx.selectOnly).toHaveBeenCalledWith("/sdcard/DCIM");
    });

    it("选中多项时不响应", () => {
      const { ctx } = setup({ selectedEntries: [dir, txt] });
      expect(press({ key: "ArrowRight" })).toBe(true);
      expect(ctx.toggleExpand).not.toHaveBeenCalled();
    });
  });

  describe("分栏视图的左右方向键", () => {
    it("左方向键回到上一栏并选中当前目录", () => {
      const { ctx } = setup({ view: "columns", path: "/sdcard/DCIM" });
      press({ key: "ArrowLeft" });
      expect(ctx.navigate).toHaveBeenCalledWith("/sdcard", "/sdcard/DCIM");
    });

    it("左方向键在根目录时不动", () => {
      const { ctx } = setup({ view: "columns", path: "/" });
      press({ key: "ArrowLeft" });
      expect(ctx.navigate).not.toHaveBeenCalled();
    });

    it("右方向键进入选中的文件夹并选中第一项", () => {
      const { ctx } = setup({ view: "columns", selectedEntries: [dir] });
      press({ key: "ArrowRight" });
      expect(ctx.navigate).toHaveBeenCalledWith(dir.path, true);
    });

    it.each<[string, Listing]>([
      ["空文件夹", { entries: [] }],
      ["只有隐藏文件", { entries: [file("/sdcard/DCIM/.nomedia")] }],
      ["打不开的文件夹", { error: "无读取权限" }],
    ])("右方向键进不去%s", (_, listing) => {
      const { ctx } = setup({ view: "columns", selectedEntries: [dir], dirs: new Map([[dir.path, listing]]) });
      press({ key: "ArrowRight" });
      expect(ctx.navigate).not.toHaveBeenCalled();
    });

    it("选中的是文件时按右方向键不动", () => {
      const { ctx } = setup({ view: "columns", selectedEntries: [txt] });
      press({ key: "ArrowRight" });
      expect(ctx.navigate).not.toHaveBeenCalled();
    });
  });

  it("Delete 和 Cmd+Backspace 删除选中的条目", () => {
    const sel: FileEntry[] = [dir, txt];
    const { ctx } = setup({ selectedEntries: sel });
    press({ key: "Delete" });
    press({ key: "Backspace", metaKey: true });
    expect(vi.mocked(ctx.askDelete).mock.calls).toEqual([[sel], [sel]]);
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it("回车打开、F2 重命名，只对单个选中项生效", () => {
    const { ctx, rerender } = setup({ selectedEntries: [txt] });
    press({ key: "Enter" });
    press({ key: "F2" });
    expect(ctx.open).toHaveBeenCalledWith(txt);
    expect(ctx.askRename).toHaveBeenCalledWith(txt);

    rerender({ ...ctx, selectedEntries: [dir, txt] });
    press({ key: "Enter" });
    expect(ctx.open).toHaveBeenCalledTimes(1);
  });

  it("Backspace 和 Alt+上方向键回到上一级，用的是最新的路径", () => {
    const { ctx, rerender } = setup();
    press({ key: "Backspace" });
    expect(ctx.navigate).toHaveBeenLastCalledWith("/");
    rerender({ ...ctx, path: "/sdcard/DCIM/Camera" });
    press({ key: "ArrowUp", altKey: true });
    expect(ctx.navigate).toHaveBeenLastCalledWith("/sdcard/DCIM");
    expect(ctx.step).not.toHaveBeenCalled();
  });

  it("在根目录按 Backspace 不动", () => {
    const { ctx } = setup({ path: "/" });
    press({ key: "Backspace" });
    expect(ctx.navigate).not.toHaveBeenCalled();
  });

  it("卸载后不再响应", () => {
    const { ctx, unmount } = setup();
    unmount();
    press({ key: "Escape" });
    expect(ctx.clear).not.toHaveBeenCalled();
  });
});
