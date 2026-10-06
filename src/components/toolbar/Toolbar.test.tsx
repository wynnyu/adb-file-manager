import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import type { MenuItem, MenuState } from "../overlays/index.ts";
import { Toolbar } from "./Toolbar.tsx";

type Props = ComponentProps<typeof Toolbar>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    path: "/sdcard/DCIM",
    loading: false,
    filter: "",
    onFilterChange: vi.fn(),
    view: "list",
    onViewChange: vi.fn(),
    onNavigate: vi.fn(),
    onRefresh: vi.fn(),
    onMkdir: vi.fn(),
    onUpload: vi.fn(),
    onMenu: vi.fn(),
    ...patch,
  };
  render(<Toolbar {...props} />, { wrapper: providers() });
  return props;
}

type Item = Exclude<MenuItem, "sep">;
/** onMenu 最后一次收到的菜单 */
const lastMenu = (onMenu: Props["onMenu"]) => vi.mocked(onMenu).mock.lastCall![0] as MenuState;
const clearButton = () => screen.queryByRole("button", { name: tz("toolbar.clearFilter") });

describe("Toolbar", () => {
  it("上一级回到父目录", () => {
    const p = show();
    fireEvent.click(screen.getByRole("button", { name: tz("toolbar.up") }));
    expect(p.onNavigate).toHaveBeenCalledWith("/sdcard");
  });

  it("在根目录时上一级不可用", () => {
    show({ path: "/" });
    expect((screen.getByRole("button", { name: tz("toolbar.up") }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("刷新和新建文件夹调用对应操作", () => {
    const p = show();
    fireEvent.click(screen.getByRole("button", { name: tz("toolbar.refresh") }));
    fireEvent.click(screen.getByRole("button", { name: tz("toolbar.newFolder") }));
    expect(p.onRefresh).toHaveBeenCalled();
    expect(p.onMkdir).toHaveBeenCalled();
  });

  it("输入筛选词时回传新的值", () => {
    const p = show();
    fireEvent.change(screen.getByPlaceholderText(tz("toolbar.filter")), { target: { value: "jpg" } });
    expect(p.onFilterChange).toHaveBeenCalledWith("jpg");
  });

  it("没有筛选词时不显示清除按钮", () => {
    show();
    expect(clearButton()).toBeNull();
  });

  it("有筛选词时显示清除按钮，点了清空", () => {
    const p = show({ filter: "jpg" });
    expect((screen.getByPlaceholderText(tz("toolbar.filter")) as HTMLInputElement).value).toBe("jpg");
    fireEvent.click(clearButton()!);
    expect(p.onFilterChange).toHaveBeenCalledWith("");
  });

  it("点主上传按钮上传文件", () => {
    const p = show();
    fireEvent.click(screen.getByRole("button", { name: tz("toolbar.uploadFiles") }));
    expect(p.onUpload).toHaveBeenCalledWith("files");
  });

  it("更多上传方式弹出菜单，可选上传文件或文件夹", () => {
    const p = show();
    fireEvent.click(screen.getByRole("button", { name: tz("toolbar.uploadMore") }));
    const menu = lastMenu(p.onMenu);
    expect(menu.align).toBe("end");
    const items = menu.items as Item[];
    expect(items.map((i) => i.label)).toEqual([tz("toolbar.uploadFiles"), tz("toolbar.uploadFolder")]);
    items[1].onSelect();
    expect(p.onUpload).toHaveBeenCalledWith("folder");
    items[0].onSelect();
    expect(p.onUpload).toHaveBeenCalledWith("files");
  });

  it("显示方式按钮切换视图，当前视图处于选中状态", () => {
    const p = show({ view: "icons" });
    const icons = screen.getByRole("radio", { name: tz("view.icons") });
    expect(icons.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: tz("view.gallery") }));
    expect(p.onViewChange).toHaveBeenCalledWith("gallery");
  });

  it("窄屏的显示方式菜单勾选当前视图", () => {
    const p = show({ view: "columns" });
    fireEvent.click(screen.getByRole("button", { name: tz("view.title") }));
    const items = lastMenu(p.onMenu).items as Item[];
    expect(items.filter((i) => i.checked).map((i) => i.label)).toEqual([tz("view.columns")]);
    items[0].onSelect();
    expect(p.onViewChange).toHaveBeenCalledWith("icons");
  });

  it("路径栏显示当前目录，点击其中一段跳转", () => {
    const p = show({ path: "/sdcard/DCIM/Camera" });
    fireEvent.click(screen.getByRole("button", { name: "DCIM" }));
    expect(p.onNavigate).toHaveBeenCalledWith("/sdcard/DCIM");
  });
});
