import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCENTS, FLAVORS } from "../../lib/theme.ts";
import { providers, tz } from "../../test/utils.tsx";
import { ThemePicker } from "./ThemePicker.tsx";

/** jsdom 没有 matchMedia：系统深浅色和减少动态效果由用例控制，深浅色变化时通知监听者 */
const media = { light: false, reduced: false, listeners: new Set<() => void>() };

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => {
    const light = query.includes("light");
    return {
      media: query,
      matches: light ? media.light : query.includes("reduce") ? media.reduced : false,
      addEventListener: (_: string, l: () => void) => light && media.listeners.add(l),
      removeEventListener: (_: string, l: () => void) => media.listeners.delete(l),
    };
  });
}

function systemChange(light: boolean) {
  media.light = light;
  act(() => {
    for (const l of media.listeners) l();
  });
}

const root = document.documentElement;

beforeEach(() => {
  media.light = false;
  media.reduced = false;
  media.listeners.clear();
  stubMatchMedia();
  // 首帧前的内联脚本写好的主题
  root.dataset.flavor = "mocha";
  root.dataset.accent = "mauve";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete root.dataset.flavor;
  delete root.dataset.accent;
  root.classList.remove("theme-switching");
  root.removeAttribute("style");
  delete (document as Partial<Document>).startViewTransition;
});

function show() {
  const utils = render(<ThemePicker />, { wrapper: providers() });
  const toggle = () => fireEvent.click(screen.getByRole("button", { name: tz("theme.title") }));
  return { ...utils, toggle };
}

const flavorButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const accentButton = (name: string) => screen.getByRole("button", { name });
const pressed = (el: HTMLElement) => el.getAttribute("aria-pressed");
const stored = (key: string) => localStorage.getItem(key);

describe("ThemePicker", () => {
  it("展开后列出全部口味和主色，当前项处于按下状态", () => {
    const { toggle } = show();
    const button = screen.getByRole("button", { name: tz("theme.title") });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    toggle();
    expect(button.getAttribute("aria-expanded")).toBe("true");

    for (const f of FLAVORS) {
      expect(flavorButton(f.name).textContent).toContain(tz(`theme.${f.id}`));
      expect(pressed(flavorButton(f.name))).toBe(f.id === "mocha" ? "true" : "false");
    }
    for (const a of ACCENTS) expect(pressed(accentButton(a.name))).toBe(a.id === "mauve" ? "true" : "false");
  });

  it("选择口味：写到 <html> 上并保存", () => {
    const { toggle } = show();
    toggle();
    fireEvent.click(flavorButton("Latte"));
    expect(root.dataset.flavor).toBe("latte");
    expect(root.dataset.accent).toBe("mauve");
    expect(stored("afm.flavor")).toBe(JSON.stringify("latte"));
    expect(stored("afm.accent")).toBeNull();
    expect(pressed(flavorButton("Latte"))).toBe("true");
    expect(pressed(flavorButton("Mocha"))).toBe("false");
  });

  it("选择主色：写到 <html> 上并保存，面板保持展开", () => {
    const { toggle } = show();
    toggle();
    fireEvent.click(accentButton("Peach"));
    expect(root.dataset.accent).toBe("peach");
    expect(stored("afm.accent")).toBe(JSON.stringify("peach"));
    expect(stored("afm.flavor")).toBeNull();
    expect(pressed(accentButton("Peach"))).toBe("true");
    expect(accentButton("Blue")).toBeTruthy();
  });

  it("点当前的口味或主色不做任何事", () => {
    const { toggle } = show();
    toggle();
    fireEvent.click(flavorButton("Mocha"));
    fireEvent.click(accentButton("Mauve"));
    expect(stored("afm.flavor")).toBeNull();
    expect(stored("afm.accent")).toBeNull();
  });

  it("<html> 上没有主题时，口味跟随系统，主色默认 Mauve", () => {
    delete root.dataset.flavor;
    delete root.dataset.accent;
    media.light = true;
    const { toggle } = show();
    toggle();
    expect(pressed(flavorButton("Latte"))).toBe("true");
    expect(pressed(accentButton("Mauve"))).toBe("true");
  });

  it("没有手动选过口味时跟随系统深浅色变化", () => {
    const { toggle } = show();
    systemChange(true);
    expect(root.dataset.flavor).toBe("latte");
    toggle();
    expect(pressed(flavorButton("Latte"))).toBe("true");
    systemChange(false);
    expect(root.dataset.flavor).toBe("mocha");
  });

  it("手动选过口味后不再跟随系统", () => {
    const { toggle } = show();
    toggle();
    fireEvent.click(flavorButton("Frappé"));
    systemChange(true);
    expect(root.dataset.flavor).toBe("frappe");
  });

  it("卸载后不再监听系统深浅色", () => {
    const { unmount } = show();
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it("支持 View Transition 时从点击处扩散切换", async () => {
    let finish!: () => void;
    const start = vi.fn((cb: () => void) => {
      cb();
      return { finished: new Promise<void>((r) => (finish = r)) };
    });
    Object.assign(document, { startViewTransition: start });
    const { toggle } = show();
    toggle();
    fireEvent.click(accentButton("Green"), { clientX: 30, clientY: 40, detail: 1 });
    expect(start).toHaveBeenCalledTimes(1);
    expect(root.dataset.accent).toBe("green");
    expect(root.style.getPropertyValue("--reveal-x")).toBe("30px");
    expect(root.style.getPropertyValue("--reveal-y")).toBe("40px");
    expect(root.classList.contains("theme-switching")).toBe(true);
    finish();
    await waitFor(() => expect(root.classList.contains("theme-switching")).toBe(false));
  });

  it("开了减少动态效果时直接切换", () => {
    media.reduced = true;
    const start = vi.fn();
    Object.assign(document, { startViewTransition: start });
    const { toggle } = show();
    toggle();
    fireEvent.click(accentButton("Green"));
    expect(start).not.toHaveBeenCalled();
    expect(root.dataset.accent).toBe("green");
  });

  it("按 Esc 收起", async () => {
    const { toggle } = show();
    toggle();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mauve" })).toBeNull());
  });

  it("点击面板内部不收起，点击外面收起", async () => {
    const { toggle } = show();
    toggle();
    fireEvent.mouseDown(accentButton("Mauve"));
    expect(accentButton("Mauve")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Mauve" })).toBeNull());
  });
});
