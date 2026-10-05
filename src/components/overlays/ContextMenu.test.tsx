import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, type MenuItem } from "./ContextMenu.tsx";

function show(items: MenuItem[]) {
  const onClose = vi.fn();
  render(<ContextMenu menu={{ x: 10, y: 10, items }} onClose={onClose} />);
  return { onClose, menu: screen.getByRole("menu") };
}

const basic = () => {
  const fns = { open: vi.fn(), paste: vi.fn(), remove: vi.fn() };
  const items: MenuItem[] = [
    { label: "打开", shortcut: ["enter"], onSelect: fns.open },
    "sep",
    { label: "粘贴", shortcut: ["mod", "V"], disabled: true, onSelect: fns.paste },
    { label: "删除", danger: true, onSelect: fns.remove },
  ];
  return { items, ...fns };
};

const item = (name: string | RegExp) => screen.getByRole<HTMLButtonElement>("menuitem", { name });

describe("ContextMenu", () => {
  it("列出菜单项和快捷键提示，非 Mac 上修饰键写成 Ctrl+", () => {
    show(basic().items);
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
    expect(item(/^粘贴/).textContent).toBe("粘贴Ctrl+V");
    expect(item(/^粘贴/).disabled).toBe(true);
  });

  it("点击菜单项先关闭菜单再执行", () => {
    const { items, open } = basic();
    const { onClose } = show(items);
    fireEvent.click(item(/^打开/));
    expect(onClose).toHaveBeenCalled();
    expect(open).toHaveBeenCalled();
    expect(onClose.mock.invocationCallOrder[0]).toBeLessThan(open.mock.invocationCallOrder[0]);
  });

  it("打开后聚焦菜单，上下方向键在可用项之间循环移动", () => {
    const { menu } = show(basic().items);
    expect(document.activeElement).toBe(menu);
    const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k });
    key("ArrowDown");
    expect(document.activeElement).toBe(item(/^打开/));
    key("ArrowDown");
    expect(document.activeElement).toBe(item("删除"));
    key("ArrowDown");
    expect(document.activeElement).toBe(item(/^打开/));
    key("ArrowUp");
    expect(document.activeElement).toBe(item("删除"));
    key("Home");
    expect(document.activeElement).toBe(item(/^打开/));
    key("End");
    expect(document.activeElement).toBe(item("删除"));
  });

  it("Esc 关闭菜单，不再传给外层（避免同时清空选择）", () => {
    const outer = vi.fn();
    window.addEventListener("keydown", outer);
    const { onClose } = show(basic().items);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener("keydown", outer);
  });

  it("在菜单外按下鼠标、滚动、窗口失焦或缩放时关闭", () => {
    const { onClose, menu } = show(basic().items);
    fireEvent.mouseDown(menu);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    fireEvent.scroll(document);
    fireEvent.blur(window);
    fireEvent(window, new Event("resize"));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("开关项用 menuitemcheckbox 并标明状态", () => {
    show([
      { label: "列表", checked: true, onSelect: () => {} },
      { label: "图标", checked: false, onSelect: () => {} },
    ]);
    const boxes = screen.getAllByRole("menuitemcheckbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false"]);
  });

  it("菜单项上的右键交给该项处理", () => {
    const onContextMenu = vi.fn();
    show([{ label: "书签", onSelect: () => {}, onContextMenu }]);
    fireEvent.contextMenu(item("书签"));
    expect(onContextMenu).toHaveBeenCalled();
  });
});
