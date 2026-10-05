import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api.ts";
import { file, folder, providers, tz } from "../../test/utils.tsx";
import type { Listing } from "../../types.ts";
import { ColumnView } from "./ColumnView.tsx";

const target = { serial: "R5CT", root: false };

const sdcard = folder("/sdcard");
const system = folder("/system");
const dcim = folder("/sdcard/DCIM");
const txt = file("/sdcard/a.txt", { size: 2048, mtime: 1_700_000_000 });
const png = file("/sdcard/b.png", { size: 10, mtime: 1_700_000_000 });
const camera = folder("/sdcard/DCIM/Camera");

type Props = ComponentProps<typeof ColumnView>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    target,
    path: "/sdcard",
    entries: [dcim, txt, png],
    dirs: new Map<string, Listing>([["/", { entries: [system, sdcard, folder("/.hidden")] }]]),
    loading: false,
    error: null,
    selected: new Set(),
    cut: new Set(),
    sort: { key: "name", asc: true },
    showHidden: false,
    onNavigate: vi.fn(),
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onDownload: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...patch,
  };
  render(<ColumnView {...props} />, { wrapper: providers() });
  return props;
}

/** 名称所在的那一行；同名时取第一个 */
const row = (name: string) => screen.getAllByText(name)[0].closest<HTMLElement>("[data-entry]")!;
/** 各栏的容器；栏没有语义角色，按固定宽度的类名找 */
const cols = () => [...document.querySelectorAll<HTMLElement>(".w-60")];
/** 每一栏里各条目的名称 */
const columns = () => cols().map((c) => [...c.querySelectorAll<HTMLElement>("[data-entry]")].map((r) => r.title));
/** 详情面板 */
const preview = () => document.querySelector<HTMLElement>("aside")!;

describe("ColumnView", () => {
  it("从根目录到当前目录一栏一栏排开，其他栏按排序隐藏点开头的条目", () => {
    show();
    expect(columns()).toEqual([
      ["sdcard", "system"],
      ["DCIM", "a.txt", "b.png"],
    ]);
  });

  it("路径经过的隐藏文件夹仍然显示", () => {
    show({ path: "/.hidden", entries: [] });
    expect(columns()[0]).toContain(".hidden");
  });

  it("当前栏里单击选择，双击文件打开、双击文件夹进入并选中第一项", () => {
    const p = show();
    fireEvent.click(row("a.txt"));
    expect(p.onSelect).toHaveBeenCalledWith(txt, expect.anything());
    fireEvent.doubleClick(row("a.txt"));
    expect(p.onOpen).toHaveBeenCalledWith(txt);
    fireEvent.doubleClick(row("DCIM"));
    expect(p.onNavigate).toHaveBeenCalledWith("/sdcard/DCIM", true);
  });

  it("点别的栏里的条目，把选择移到那一栏", () => {
    const p = show();
    fireEvent.click(row("system"));
    expect(p.onNavigate).toHaveBeenCalledWith("/", "/system");
    expect(p.onSelect).not.toHaveBeenCalled();
  });

  it("点别的栏的空白处回到那一栏，点当前栏的空白处不处理", () => {
    const p = show();
    const [root, current] = cols();
    fireEvent.click(current);
    expect(p.onNavigate).not.toHaveBeenCalled();
    fireEvent.click(root);
    expect(p.onNavigate).toHaveBeenCalledWith("/");
  });

  it("右键条目或空白处，菜单带上所在的栏", () => {
    const p = show();
    fireEvent.contextMenu(row("a.txt"));
    expect(p.onContextMenu).toHaveBeenLastCalledWith(expect.anything(), txt, "/sdcard");
    fireEvent.contextMenu(cols()[0]);
    expect(p.onContextMenu).toHaveBeenLastCalledWith(expect.anything(), null, "/");
  });

  it("选中文件夹时右边多一栏列出它的内容", () => {
    show({
      selected: new Set([dcim.path]),
      dirs: new Map<string, Listing>([
        ["/", { entries: [sdcard] }],
        ["/sdcard/DCIM", { entries: [camera] }],
      ]),
    });
    expect(columns()).toEqual([["sdcard"], ["DCIM", "a.txt", "b.png"], ["Camera"]]);
    expect(preview()).toBeNull();
  });

  it("还没加载的栏显示加载中，读取失败的栏显示错误，空文件夹显示提示", () => {
    show({
      selected: new Set([dcim.path]),
      dirs: new Map<string, Listing>([["/sdcard/DCIM", { error: "无读取权限" }]]),
    });
    const [root, , child] = cols();
    expect(root.querySelector(".animate-spin")).toBeTruthy();
    expect(within(child).getByText("无读取权限")).toBeTruthy();
  });

  it("当前目录为空时显示空文件夹", () => {
    show({ entries: [] });
    expect(screen.getByText(tz("files.empty"))).toBeTruthy();
  });

  it("当前目录读取失败时显示错误", () => {
    show({ error: "无读取权限：/sdcard" });
    expect(screen.getByText("无读取权限：/sdcard")).toBeTruthy();
    expect(screen.queryByText("a.txt")).toBeNull();
  });

  it("选中文件时显示详情，操作按钮作用于这个文件", () => {
    const p = show({ selected: new Set([txt.path]) });
    const info = within(preview());
    expect(info.getByText("a.txt")).toBeTruthy();
    expect(info.getByText("/sdcard/a.txt")).toBeTruthy();
    expect(info.getByText("2.0 KB")).toBeTruthy();
    expect(info.getByText("(2,048 B)")).toBeTruthy();
    fireEvent.click(info.getByRole("button", { name: tz("files.download") }));
    fireEvent.click(info.getByRole("button", { name: tz("files.rename") }));
    fireEvent.click(info.getByRole("button", { name: tz("files.delete") }));
    expect(p.onDownload).toHaveBeenCalledWith(txt);
    expect(p.onRename).toHaveBeenCalledWith(txt);
    expect(p.onDelete).toHaveBeenCalledWith(txt);
  });

  it("选中多项时不显示详情", () => {
    show({ selected: new Set([txt.path, png.path]) });
    expect(preview()).toBeNull();
  });

  it("图片加载成功后显示缩略图，失败时退回文件图标", () => {
    show({ selected: new Set([png.path]) });
    const img = preview().querySelector("img")!;
    expect(img.getAttribute("src")).toBe(api.previewUrl(target, png.path));
    expect(img.className).toContain("hidden");
    fireEvent.load(img);
    expect(img.className).not.toContain("hidden");
    fireEvent.error(img);
    expect(preview().querySelector("img")).toBeNull();
  });

  it("不能预览的文件不加载图片", () => {
    show({ selected: new Set([txt.path]) });
    expect(preview().querySelector("img")).toBeNull();
  });
});
