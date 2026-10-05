import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import { Breadcrumbs } from "./Breadcrumbs.tsx";

function show(path = "/sdcard/DCIM/Camera") {
  const onNavigate = vi.fn();
  const view = render(<Breadcrumbs path={path} onNavigate={onNavigate} />, { wrapper: providers() });
  const edit = () => fireEvent.doubleClick(screen.getByTitle(tz("crumbs.edit")));
  const input = () => screen.getByRole<HTMLInputElement>("textbox");
  return { ...view, onNavigate, edit, input };
}

describe("Breadcrumbs", () => {
  it("每一级是一个按钮，点击跳到该级", () => {
    const { onNavigate } = show();
    const crumbs = screen.getAllByRole("button").map((b) => b.textContent);
    // 首尾是只有图标的根目录按钮和编辑按钮
    expect(crumbs).toEqual(["", "sdcard", "DCIM", "Camera", ""]);
    fireEvent.click(screen.getByRole("button", { name: "DCIM" }));
    expect(onNavigate).toHaveBeenLastCalledWith("/sdcard/DCIM");
    fireEvent.click(screen.getByRole("button", { name: tz("crumbs.root") }));
    expect(onNavigate).toHaveBeenLastCalledWith("/");
  });

  it("编辑按钮也能进入编辑，用 Esc 或回车结束后焦点回到编辑按钮", () => {
    const { onNavigate, input } = show();
    const editButton = () => screen.getByRole("button", { name: tz("crumbs.type") });
    fireEvent.click(editButton());
    expect(input().value).toBe("/sdcard/DCIM/Camera");
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.activeElement).toBe(editButton());

    fireEvent.click(editButton());
    fireEvent.change(input(), { target: { value: "/sdcard" } });
    fireEvent.submit(input());
    expect(onNavigate).toHaveBeenLastCalledWith("/sdcard");
    expect(document.activeElement).toBe(editButton());
  });

  it("双击进入编辑，输入的路径去掉末尾的 / 后跳转", () => {
    const { onNavigate, edit, input } = show();
    edit();
    expect(input().value).toBe("/sdcard/DCIM/Camera");
    fireEvent.change(input(), { target: { value: " /sdcard/Download/ " } });
    fireEvent.submit(input());
    expect(onNavigate).toHaveBeenCalledWith("/sdcard/Download");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("清空后提交跳到根目录", () => {
    const { onNavigate, edit, input } = show();
    edit();
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.submit(input());
    expect(onNavigate).toHaveBeenCalledWith("/");
  });

  it("不是绝对路径时不跳转", () => {
    const { onNavigate, edit, input } = show();
    edit();
    fireEvent.change(input(), { target: { value: "sdcard" } });
    fireEvent.submit(input());
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("Esc 或失去焦点时退出编辑，不跳转", () => {
    const { onNavigate, edit, input } = show();
    edit();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(screen.queryByRole("textbox")).toBeNull();
    edit();
    fireEvent.blur(input());
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("路径变化后编辑框里是新路径", () => {
    const { rerender, edit, input, onNavigate } = show();
    rerender(<Breadcrumbs path="/data/local/tmp" onNavigate={onNavigate} />);
    edit();
    expect(input().value).toBe("/data/local/tmp");
  });
});
