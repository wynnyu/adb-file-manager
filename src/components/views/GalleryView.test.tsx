import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api.ts";
import { file, folder, providers, tz } from "../../test/utils.tsx";
import { GalleryView } from "./GalleryView.tsx";

const target = { serial: "R5CT", root: false };

const dcim = folder("/sdcard/DCIM", { mtime: 1_700_000_000 });
const txt = file("/sdcard/a.txt", { size: 2048, mtime: 1_700_000_000 });
const png = file("/sdcard/b.png", { size: 10, mtime: 1_700_000_000 });
const ENTRIES = [dcim, txt, png];

type Props = ComponentProps<typeof GalleryView>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    target,
    entries: ENTRIES,
    loading: false,
    error: null,
    selected: new Set([txt.path]),
    cut: new Set(),
    focused: null,
    onSelect: vi.fn(),
    onFocus: vi.fn(),
    onOpen: vi.fn(),
    onContextMenu: vi.fn(),
    onDownload: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...patch,
  };
  render(<GalleryView {...props} />, { wrapper: providers() });
  return props;
}

/** 缩略图条里的一项 */
const thumb = (path: string) => document.querySelector<HTMLElement>(`[data-entry="${CSS.escape(path)}"]`)!;
const strip = () => thumb(ENTRIES[0].path).parentElement!;
/** 右边的信息面板 */
const info = () => document.querySelector<HTMLElement>("aside");
/** 舞台上的大预览：信息面板左边那一栏的第一块里 */
const stage = () => info()!.previousElementSibling!.firstElementChild!.firstElementChild as HTMLElement;

describe("GalleryView", () => {
  it("每个条目在缩略图条里占一格", () => {
    show();
    expect([...strip().children].map((c) => (c as HTMLElement).title)).toEqual(["DCIM", "a.txt", "b.png"]);
  });

  it("单击缩略图选择，双击打开，右键打开菜单", () => {
    const p = show();
    fireEvent.click(thumb(png.path));
    expect(p.onSelect).toHaveBeenCalledWith(png, expect.anything());
    fireEvent.doubleClick(thumb(png.path));
    expect(p.onOpen).toHaveBeenCalledWith(png);
    fireEvent.contextMenu(thumb(dcim.path));
    expect(p.onContextMenu).toHaveBeenCalledWith(expect.anything(), dcim);
  });

  it("舞台上显示选中项，双击打开，右键打开菜单", () => {
    const p = show();
    expect(within(stage()).getByText("a.txt")).toBeTruthy();
    fireEvent.doubleClick(stage());
    expect(p.onOpen).toHaveBeenCalledWith(txt);
    fireEvent.contextMenu(stage());
    expect(p.onContextMenu).toHaveBeenCalledWith(expect.anything(), txt);
  });

  it("多选时舞台上显示最近点选的那一项", () => {
    show({ selected: new Set([txt.path, png.path]), focused: png.path });
    expect(within(info()!).getByText("b.png")).toBeTruthy();
  });

  it("最近点选的项不在选择里时，退回到选择里的第一项", () => {
    show({ selected: new Set([txt.path, png.path]), focused: dcim.path });
    expect(within(info()!).getByText("a.txt")).toBeTruthy();
  });

  it("没有选中任何项时选中第一项", () => {
    const p = show({ selected: new Set() });
    expect(p.onFocus).toHaveBeenCalledWith(dcim);
    expect(info()).toBeNull();
  });

  it("加载中不自动选中", () => {
    const p = show({ selected: new Set(), loading: true });
    expect(p.onFocus).not.toHaveBeenCalled();
  });

  it("信息面板列出时间、大小和位置，操作按钮作用于舞台上的项", () => {
    const p = show();
    const panel = within(info()!);
    expect(panel.getByText(tz("gallery.mtime"))).toBeTruthy();
    expect(panel.getByText(tz("gallery.atime"))).toBeTruthy();
    expect(panel.getByText(tz("gallery.bytes", { n: (2048).toLocaleString() }))).toBeTruthy();
    expect(panel.getByText("/sdcard/a.txt")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: tz("files.download") }));
    fireEvent.click(panel.getByRole("button", { name: tz("files.rename") }));
    fireEvent.click(panel.getByRole("button", { name: tz("files.delete") }));
    expect(p.onDownload).toHaveBeenCalledWith(txt);
    expect(p.onRename).toHaveBeenCalledWith(txt);
    expect(p.onDelete).toHaveBeenCalledWith(txt);
  });

  it.each([
    ["文件夹", dcim],
    ["不足 1 KB 的文件", png],
  ])("%s不显示字节数", (_, entry) => {
    show({ selected: new Set([entry.path]) });
    expect(within(info()!).queryByText(tz("preview.size"))).toBeNull();
  });

  it("图片缩略图加载成功后显示，失败时退回文件图标", () => {
    show({ selected: new Set([png.path]) });
    const img = stage().querySelector("img")!;
    expect(img.getAttribute("src")).toBe(api.previewUrl(target, png.path));
    expect(img.className).toContain("opacity-0");
    fireEvent.load(img);
    expect(img.className).not.toContain("opacity-0");
    fireEvent.error(img);
    expect(stage().querySelector("img")).toBeNull();
  });

  it("缩略图条里的图片延迟加载", () => {
    show();
    expect(thumb(png.path).querySelector("img")!.getAttribute("loading")).toBe("lazy");
    expect(thumb(txt.path).querySelector("img")).toBeNull();
  });

  it("竖向滚轮横向翻动缩略图条", () => {
    show();
    const el = strip();
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 1000 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(el, "scrollLeft", { configurable: true, writable: true, value: 0 });
    // fireEvent 返回 false 表示默认行为被阻止
    expect(fireEvent.wheel(el, { deltaY: 120 })).toBe(false);
    expect(el.scrollLeft).toBe(120);
    // 横向为主的滚动交给浏览器
    expect(fireEvent.wheel(el, { deltaX: 50, deltaY: 10 })).toBe(true);
    expect(el.scrollLeft).toBe(120);
  });

  it("缩略图条放得下时滚轮不翻动", () => {
    show();
    const el = strip();
    Object.defineProperty(el, "scrollWidth", { configurable: true, value: 300 });
    Object.defineProperty(el, "clientWidth", { configurable: true, value: 300 });
    expect(fireEvent.wheel(el, { deltaY: 120 })).toBe(true);
  });

  it("读取失败时显示错误", () => {
    show({ error: "无读取权限：/data", entries: [] });
    expect(screen.getByText("无读取权限：/data")).toBeTruthy();
  });

  it("空文件夹显示提示", () => {
    show({ entries: [], selected: new Set() });
    expect(screen.getByText(tz("files.empty"))).toBeTruthy();
  });

  it("加载中且没有内容时不显示空文件夹提示", () => {
    show({ entries: [], selected: new Set(), loading: true });
    expect(screen.queryByText(tz("files.empty"))).toBeNull();
  });
});
