import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { file, folder, providers, tz } from "../../../../test/utils.tsx";
import type { TreeRow } from "../../types.ts";
import { FileList } from "./FileList.tsx";

const dcim = folder("/sdcard/DCIM", { mtime: 1_700_000_000 });
const txt = file("/sdcard/a.txt", { size: 2048, mtime: 1_700_000_000 });
const ROWS: TreeRow[] = [
  { entry: dcim, depth: 0 },
  { entry: txt, depth: 0 },
];

type Props = ComponentProps<typeof FileList>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    dir: "/sdcard",
    rows: ROWS,
    expanded: new Set(),
    pending: new Set(),
    onToggleExpand: vi.fn(),
    loading: false,
    error: null,
    selected: new Set(),
    cut: new Set(),
    sort: { key: "name", asc: true },
    onSort: vi.fn(),
    onSelect: vi.fn(),
    onToggle: vi.fn(),
    onOpen: vi.fn(),
    onDownload: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onContextMenu: vi.fn(),
    ...patch,
  };
  render(<FileList {...props} />, { wrapper: providers() });
  return props;
}

/** 名称所在的那一行 */
const row = (name: string) => screen.getByText(name).closest<HTMLElement>("[data-entry]")!;

describe("FileList", () => {
  it("每个条目一行，文件夹的大小显示为 --", () => {
    show();
    expect(row("DCIM").dataset.entry).toBe("/sdcard/DCIM");
    expect(within(row("DCIM")).getAllByText("--").length).toBeGreaterThan(0);
    expect(within(row("a.txt")).getByText("2.0 KB")).toBeTruthy();
  });

  it("单击选择，双击打开，右键打开菜单", () => {
    const p = show();
    fireEvent.click(row("a.txt"));
    expect(p.onSelect).toHaveBeenCalledWith(txt, expect.anything());
    fireEvent.doubleClick(row("a.txt"));
    expect(p.onOpen).toHaveBeenCalledWith(txt);
    fireEvent.contextMenu(row("DCIM"));
    expect(p.onContextMenu).toHaveBeenCalledWith(expect.anything(), dcim);
  });

  it("点图标切换选中，不影响其他已选项", () => {
    const p = show();
    fireEvent.click(within(row("a.txt")).getByRole("button", { name: tz("files.select") }));
    expect(p.onToggle).toHaveBeenCalledWith(txt);
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("展开三角只展开收起，不改变选择", () => {
    const p = show({ expanded: new Set([dcim.path]) });
    const toggle = within(row("DCIM")).getByRole("button", { name: tz("files.collapse") });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    fireEvent.doubleClick(toggle);
    expect(p.onToggleExpand).toHaveBeenCalledWith(dcim);
    expect(p.onSelect).not.toHaveBeenCalled();
    expect(p.onOpen).not.toHaveBeenCalled();
    // 文件没有展开三角
    expect(within(row("a.txt")).queryByRole("button", { name: tz("files.expand") })).toBeNull();
  });

  it("行内快捷操作作用于这一行，不触发选择", () => {
    const p = show();
    const r = within(row("a.txt"));
    fireEvent.click(r.getByRole("button", { name: tz("files.download") }));
    fireEvent.click(r.getByRole("button", { name: tz("files.rename") }));
    fireEvent.click(r.getByRole("button", { name: tz("files.delete") }));
    expect(p.onDownload).toHaveBeenCalledWith(txt);
    expect(p.onRename).toHaveBeenCalledWith(txt);
    expect(p.onDelete).toHaveBeenCalledWith(txt);
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("点表头按该列排序", () => {
    const p = show();
    fireEvent.click(screen.getByRole("button", { name: tz("files.size") }));
    expect(p.onSort).toHaveBeenCalledWith("size");
  });

  it("展开的子项按层级缩进，读取失败的文件夹下面显示错误", () => {
    show({
      rows: [
        { entry: dcim, depth: 0 },
        { note: "无读取权限", key: "x", depth: 1 },
        { entry: file("/sdcard/DCIM/Camera/1.jpg"), depth: 2 },
      ],
    });
    expect(screen.getByText("无读取权限")).toBeTruthy();
    const indent = (name: string) => row(name).querySelector<HTMLElement>("div")!.style.paddingLeft;
    expect(indent("DCIM")).toBe("0rem");
    expect(indent("1.jpg")).toBe("3rem");
  });

  it("不在根目录时第一行是返回上一级", () => {
    const onUp = vi.fn();
    show({ onUp });
    fireEvent.click(screen.getByRole("button", { name: tz("files.goUp") }));
    expect(onUp).toHaveBeenCalled();
  });

  it("读取失败时只显示错误", () => {
    show({ error: "无读取权限：/data" });
    expect(screen.getByText("无读取权限：/data")).toBeTruthy();
    expect(screen.queryByText("a.txt")).toBeNull();
  });

  it("空文件夹显示提示，加载中不显示", () => {
    show({ rows: [] });
    expect(screen.getByText(tz("files.empty"))).toBeTruthy();
  });

  it("加载中且没有内容时不显示空文件夹提示", () => {
    show({ rows: [], loading: true });
    expect(screen.queryByText(tz("files.empty"))).toBeNull();
  });
});
