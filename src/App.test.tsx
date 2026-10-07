import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import { api } from "./lib/index.ts";
import { file, newQueryClient, tz } from "./test/utils.tsx";
import type { Device } from "./types.ts";

function setup() {
  render(
    <QueryClientProvider client={newQueryClient()}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const phone: Device = { serial: "A", state: "device", model: "Pixel", name: "A" };

describe("App", () => {
  beforeEach(() => {
    // jsdom 没有 ResizeObserver，常用目录栏要用它测量宽度
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    // jsdom 没有 matchMedia，主题选择器要读系统深浅色
    vi.stubGlobal("matchMedia", (query: string) => ({
      media: query,
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("没有设备时显示连接提示，标题是产品名", async () => {
    vi.spyOn(api, "devices").mockResolvedValue([]);
    setup();
    expect(await screen.findByText(tz("nodevice.connect"))).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: tz("app.name") })).toBeTruthy();
  });

  it("有在线设备时显示文件页的工具栏", async () => {
    vi.spyOn(api, "devices").mockResolvedValue([phone]);
    vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
    const ls = vi.spyOn(api, "ls").mockResolvedValue([file("/sdcard/a.txt")]);
    setup();
    expect(await screen.findByRole("button", { name: tz("toolbar.refresh") })).toBeTruthy();
    await waitFor(() => expect(ls).toHaveBeenCalled());
    expect(await screen.findByText("a.txt")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: tz("app.name") })).toBeTruthy();
    // 只有一个模块时不显示模块导航
    expect(screen.queryByRole("navigation", { name: tz("nav.label") })).toBeNull();
  });
});
