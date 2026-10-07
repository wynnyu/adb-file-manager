import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { formatDate } from "../../../../lib/index.ts";
import { file, folder, providers, tz } from "../../../../test/utils.tsx";
import { IconGrid } from "./IconGrid.tsx";

const dcim = folder("/sdcard/DCIM", { mtime: 1_700_000_000 });
const txt = file("/sdcard/a.txt", { size: 2048, mtime: 1_700_000_000 });

type Props = ComponentProps<typeof IconGrid>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    dir: "/sdcard",
    entries: [dcim, txt],
    loading: false,
    error: null,
    selected: new Set(),
    cut: new Set(),
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    ...patch,
  };
  render(<IconGrid {...props} />, { wrapper: providers() });
  return props;
}

/** 名称所在的那一格 */
const cell = (name: string) => screen.getByText(name).closest<HTMLElement>("[data-entry]")!;

describe("IconGrid", () => {
  it("每个条目一格，文件显示大小，文件夹不显示", () => {
    show();
    expect(cell("DCIM").dataset.entry).toBe("/sdcard/DCIM");
    expect(within(cell("a.txt")).getByText("2.0 KB")).toBeTruthy();
    expect(cell("DCIM").querySelector(".font-mono")).toBeNull();
  });

  it("悬停提示列出名称、种类、大小和修改时间", () => {
    show();
    const date = formatDate(txt.mtime, "zh", tz);
    expect(cell("a.txt").title).toBe(`a.txt\n${tz("kind.text")}\n2.0 KB\n${date}`);
    expect(cell("DCIM").title).toBe(`DCIM\n${tz("kind.folder")}\n${date}`);
  });

  it("单击选择，双击打开，右键打开菜单", () => {
    const p = show();
    fireEvent.click(cell("a.txt"));
    expect(p.onSelect).toHaveBeenCalledWith(txt, expect.anything());
    fireEvent.doubleClick(cell("DCIM"));
    expect(p.onOpen).toHaveBeenCalledWith(dcim);
    fireEvent.contextMenu(cell("a.txt"));
    expect(p.onContextMenu).toHaveBeenCalledWith(expect.anything(), txt);
  });

  it("选中项的文件名用主色底，剪切的项变淡", () => {
    show({ selected: new Set([txt.path]), cut: new Set([dcim.path]) });
    expect(screen.getByText("a.txt").className).toContain("bg-accent");
    expect(screen.getByText("DCIM").className).not.toContain("bg-accent");
    expect(cell("DCIM").className).toContain("opacity-50");
    expect(cell("a.txt").className).not.toContain("opacity-50");
  });

  it("读取失败时只显示错误", () => {
    show({ error: "无读取权限：/data" });
    expect(screen.getByText("无读取权限：/data")).toBeTruthy();
    expect(screen.queryByText("a.txt")).toBeNull();
  });

  it("空文件夹显示提示", () => {
    show({ entries: [] });
    expect(screen.getByText(tz("files.empty"))).toBeTruthy();
  });

  it("加载中且没有内容时显示加载动画，不显示空文件夹提示", () => {
    show({ entries: [], loading: true });
    expect(document.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText(tz("files.empty"))).toBeNull();
  });

  it("刷新时保留已有内容，不显示加载动画", () => {
    show({ loading: true });
    expect(screen.getByText("a.txt")).toBeTruthy();
    expect(document.querySelector(".animate-spin")).toBeNull();
  });
});
