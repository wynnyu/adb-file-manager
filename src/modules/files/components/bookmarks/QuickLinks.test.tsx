import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItem, MenuState } from "../../../../components/overlays/index.ts";
import { providers, tz } from "../../../../test/utils.tsx";
import { type Bookmark, PRESETS, presetFields } from "../../lib/index.ts";
import { QuickLinks } from "./QuickLinks.tsx";

/** 7 个内置书签，名称为空，显示当前语言的默认名称 */
const PRESET_BOOKMARKS: Bookmark[] = PRESETS.map((p) => ({ id: p.preset, ...presetFields(p) }));
const work: Bookmark = { id: "w", name: "工作", path: "/sdcard/Work", icon: "briefcase", color: "green" };

type Props = ComponentProps<typeof QuickLinks>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    path: "/sdcard",
    bookmarks: [PRESET_BOOKMARKS[0], PRESET_BOOKMARKS[1], work],
    onNavigate: vi.fn(),
    onAddBookmark: vi.fn(),
    onBookmarkMenu: vi.fn(),
    onMenu: vi.fn(),
    ...patch,
  };
  render(<QuickLinks {...props} />, { wrapper: providers() });
  return props;
}

/** 可见的书签按钮；标尺层里的同名项不是按钮 */
const chip = (name: string) => screen.getByRole("button", { name });
const moreButton = () => screen.queryByRole("button", { name: tz("bookmark.more") });

type Item = Exclude<MenuItem, "sep">;
const lastMenu = (onMenu: Props["onMenu"]) => vi.mocked(onMenu).mock.lastCall![0] as MenuState;

beforeEach(() => {
  // jsdom 没有 ResizeObserver；尺寸由各个用例自己设定
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuickLinks", () => {
  it("内置书签显示当前语言的默认名称，自建书签显示自己的名称", () => {
    show();
    expect(chip(tz("quick.internal")).title).toBe("/sdcard");
    expect(chip(tz("quick.downloads")).title).toBe("/sdcard/Download");
    expect(chip("工作").title).toBe("/sdcard/Work");
  });

  it("点击跳转到书签路径，右键打开书签菜单", () => {
    const p = show();
    fireEvent.click(chip("工作"));
    expect(p.onNavigate).toHaveBeenCalledWith("/sdcard/Work");
    fireEvent.contextMenu(chip(tz("quick.downloads")));
    expect(p.onBookmarkMenu).toHaveBeenCalledWith(expect.anything(), PRESET_BOOKMARKS[1]);
  });

  it("新建书签按钮调用 onAddBookmark", () => {
    const p = show({ bookmarks: [] });
    fireEvent.click(screen.getByRole("button", { name: tz("bookmark.new") }));
    expect(p.onAddBookmark).toHaveBeenCalled();
  });

  it("放得下时不显示更多", () => {
    show();
    expect(moreButton()).toBeNull();
  });

  describe("超过两行时", () => {
    beforeEach(() => {
      // 每项宽 100，容器宽 350：一行放 3 项（100 + 108 + 108 = 316）
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(350);
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
        width: 100,
        height: 36,
        top: 0,
        left: 0,
        right: 100,
        bottom: 36,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    });

    it("其余的书签收进更多，书签、更多和新建书签合起来占满两行", () => {
      show({ bookmarks: PRESET_BOOKMARKS });
      // 4 个书签 + 更多 + 新建书签 = 6 项，正好两行
      for (const p of PRESETS.slice(0, 4)) expect(chip(tz(p.label))).toBeTruthy();
      for (const p of PRESETS.slice(4)) expect(screen.queryByRole("button", { name: tz(p.label) })).toBeNull();
      expect(moreButton()).toBeTruthy();
    });

    it("更多菜单列出收起的书签，选择后跳转，右键打开书签菜单", () => {
      const p = show({ bookmarks: PRESET_BOOKMARKS });
      fireEvent.click(moreButton()!);
      const items = lastMenu(p.onMenu).items as Item[];
      expect(items.map((i) => i.label)).toEqual(PRESETS.slice(4).map((x) => tz(x.label)));
      // 当前目录不在菜单里，不显示对勾列
      expect(items.every((i) => i.checked === undefined)).toBe(true);

      items[1].onSelect();
      expect(p.onNavigate).toHaveBeenCalledWith("/sdcard/Music");
      const ev = {} as Parameters<NonNullable<Item["onContextMenu"]>>[0];
      items[2].onContextMenu!(ev);
      expect(p.onBookmarkMenu).toHaveBeenCalledWith(ev, PRESET_BOOKMARKS[6]);
    });

    it("当前目录在更多菜单里时勾选它", () => {
      const p = show({ path: "/sdcard/Music", bookmarks: PRESET_BOOKMARKS });
      fireEvent.click(moreButton()!);
      const items = lastMenu(p.onMenu).items as Item[];
      expect(items.map((i) => i.checked)).toEqual([false, true, false]);
    });
  });
});
