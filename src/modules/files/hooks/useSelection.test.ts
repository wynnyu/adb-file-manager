import { act, renderHook } from "@testing-library/react";
import type { MouseEvent } from "react";
import { describe, expect, it } from "vitest";
import { file, folder } from "../../../test/utils.tsx";
import type { FileEntry } from "../../../types.ts";
import { useSelection, useSelectionActions } from "./useSelection.ts";

const list = [folder("/d/A"), file("/d/b"), file("/d/c"), file("/d/d"), file("/d/e")];
const click = (mods: Partial<MouseEvent> = {}) => mods as MouseEvent;

function setup(selectable: FileEntry[] = list) {
  return renderHook(
    ({ selectable }) => {
      const selection = useSelection();
      return { ...selection, ...useSelectionActions(selection, selectable) };
    },
    { initialProps: { selectable } },
  );
}

const paths = (s: Set<string>) => [...s].sort();

describe("useSelection", () => {
  it("selectOnly 只选中一项并设为起点，传 null 时清空", () => {
    const { result } = setup();
    act(() => result.current.selectOnly("/d/b"));
    expect(paths(result.current.selected)).toEqual(["/d/b"]);
    expect(result.current.anchor.current).toBe("/d/b");
    act(() => result.current.selectOnly(null));
    expect(result.current.selected.size).toBe(0);
    expect(result.current.anchor.current).toBeNull();
  });

  it("clear 清空选择但保留起点", () => {
    const { result } = setup();
    act(() => result.current.selectOnly("/d/c"));
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
    expect(result.current.anchor.current).toBe("/d/c");
  });
});

describe("useSelectionActions", () => {
  it("单击只选中这一项", () => {
    const { result } = setup();
    act(() => result.current.onSelect(list[1], click()));
    act(() => result.current.onSelect(list[3], click()));
    expect(paths(result.current.selected)).toEqual(["/d/d"]);
  });

  it("Cmd / Ctrl 单击切换这一项", () => {
    const { result } = setup();
    act(() => result.current.onSelect(list[1], click()));
    act(() => result.current.onSelect(list[3], click({ metaKey: true })));
    expect(paths(result.current.selected)).toEqual(["/d/b", "/d/d"]);
    act(() => result.current.onSelect(list[1], click({ ctrlKey: true })));
    expect(paths(result.current.selected)).toEqual(["/d/d"]);
  });

  it("Shift 单击从起点连选到这一项，两个方向都可以", () => {
    const { result } = setup();
    act(() => result.current.onSelect(list[3], click()));
    act(() => result.current.onSelect(list[1], click({ shiftKey: true })));
    expect(paths(result.current.selected)).toEqual(["/d/b", "/d/c", "/d/d"]);
    // 起点不变，再往下连选
    act(() => result.current.onSelect(list[4], click({ shiftKey: true })));
    expect(paths(result.current.selected)).toEqual(["/d/d", "/d/e"]);
  });

  it("没有起点时 Shift 单击等同单击", () => {
    const { result } = setup();
    act(() => result.current.onSelect(list[2], click({ shiftKey: true })));
    expect(paths(result.current.selected)).toEqual(["/d/c"]);
    expect(result.current.anchor.current).toBe("/d/c");
  });

  it("onToggle 切换这一项并设为起点", () => {
    const { result } = setup();
    act(() => result.current.onToggle(list[0]));
    act(() => result.current.onToggle(list[2]));
    expect(paths(result.current.selected)).toEqual(["/d/A", "/d/c"]);
    act(() => result.current.onToggle(list[0]));
    expect(paths(result.current.selected)).toEqual(["/d/c"]);
    expect(result.current.anchor.current).toBe("/d/A");
  });

  it("selectAll 选中全部可选条目", () => {
    const { result } = setup();
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(list.length);
  });

  it("selectedEntries 按显示顺序排列，忽略不在可选列表里的路径", () => {
    const { result } = setup();
    act(() => result.current.setSelected(new Set(["/d/e", "/d/b", "/elsewhere"])));
    expect(result.current.selectedEntries.map((e) => e.path)).toEqual(["/d/b", "/d/e"]);
  });

  it("方向键：没有选择时向下选第一项、向上选最后一项", () => {
    const { result } = setup();
    act(() => result.current.step(1));
    expect(paths(result.current.selected)).toEqual(["/d/A"]);
    act(() => result.current.clear());
    act(() => result.current.step(-1));
    expect(paths(result.current.selected)).toEqual(["/d/e"]);
  });

  it("方向键从起点移动一项，到头后停住", () => {
    const { result } = setup();
    act(() => result.current.onSelect(list[3], click()));
    act(() => result.current.step(1));
    expect(paths(result.current.selected)).toEqual(["/d/e"]);
    act(() => result.current.step(1));
    expect(paths(result.current.selected)).toEqual(["/d/e"]);
    act(() => result.current.step(-1));
    expect(paths(result.current.selected)).toEqual(["/d/d"]);
  });

  it("可选列表为空时方向键不做任何事", () => {
    const { result } = setup([]);
    act(() => result.current.step(1));
    expect(result.current.selected.size).toBe(0);
  });
});
