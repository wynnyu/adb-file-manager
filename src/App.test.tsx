import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import { I18nProvider } from "./i18n/index.tsx";
import { api } from "./lib/index.ts";
import { file, newQueryClient, tz } from "./test/utils.tsx";
import type { AppDetail, AppEntry, Device } from "./types.ts";

function setup() {
  render(
    <QueryClientProvider client={newQueryClient()}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

const phone: Device = { serial: "A", transport: "adb", mode: "system", model: "Pixel", name: "A" };

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
    // 当前模块和应用筛选都存在 localStorage 里，不清掉会影响后面的用例
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("没有设备时显示连接提示，标题是产品名", async () => {
    vi.spyOn(api, "devices").mockResolvedValue({ devices: [] });
    setup();
    expect(await screen.findByText(tz("nodevice.connect"))).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: tz("app.name") })).toBeTruthy();
  });

  it("有在线设备时显示文件页的工具栏", async () => {
    vi.spyOn(api, "devices").mockResolvedValue({ devices: [phone] });
    vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
    const ls = vi.spyOn(api, "ls").mockResolvedValue([file("/sdcard/a.txt")]);
    setup();
    expect(await screen.findByRole("button", { name: tz("toolbar.refresh") })).toBeTruthy();
    await waitFor(() => expect(ls).toHaveBeenCalled());
    expect(await screen.findByText("a.txt")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: tz("app.name") })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: tz("nav.label") })).toBeTruthy();
  });

  it("设备模式不在当前模块的 modes 内时 online 为 false，显示当前模式", async () => {
    vi.spyOn(api, "devices").mockResolvedValue({
      devices: [{ ...phone, transport: "fastboot", mode: "bootloader" }],
    });
    const ls = vi.spyOn(api, "ls").mockResolvedValue([]);
    setup();
    expect(await screen.findByText(tz("nodevice.wrongMode", { mode: tz("device.mode.bootloader") }))).toBeTruthy();
    expect(screen.queryByRole("button", { name: tz("toolbar.refresh") })).toBeNull();
    expect(ls).not.toHaveBeenCalled();
  });

  describe("应用模块", () => {
    const app = (pkg: string, patch: Partial<AppEntry> = {}): AppEntry => ({
      pkg,
      path: `/data/app/${pkg}/base.apk`,
      system: false,
      state: "enabled",
      ...patch,
    });
    const detail: AppDetail = {
      pkg: "com.user.notes",
      versionName: "2.0",
      versionCode: 20,
      flags: [],
      updatedSystem: false,
      permissions: [],
    };

    async function openApps() {
      vi.spyOn(api, "devices").mockResolvedValue({ devices: [phone] });
      vi.spyOn(api, "storage").mockResolvedValue({ total: 100, free: 40 });
      vi.spyOn(api, "ls").mockResolvedValue([]);
      const apps = vi
        .spyOn(api, "apps")
        .mockResolvedValue([
          app("com.user.notes"),
          app("com.android.settings", { system: true }),
          app("com.android.gone", { system: true, state: "uninstalled" }),
        ]);
      setup();
      const nav = await screen.findByRole("navigation", { name: tz("nav.label") });
      fireEvent.click(within(nav).getByRole("button", { name: tz("nav.apps") }));
      return apps;
    }

    it("点导航切到应用页，请求并列出用户应用", async () => {
      const apps = await openApps();
      expect(await screen.findByRole("button", { name: /com\.user\.notes/ })).toBeTruthy();
      expect(apps).toHaveBeenCalledWith("A");
      // 默认筛选为用户
      expect(screen.queryByRole("button", { name: /com\.android\.settings/ })).toBeNull();
    });

    it("切换筛选和搜索后列表随之变化", async () => {
      await openApps();
      await screen.findByRole("button", { name: /com\.user\.notes/ });
      fireEvent.click(screen.getByRole("radio", { name: new RegExp(tz("apps.filter.system")) }));
      expect(await screen.findByRole("button", { name: /com\.android\.settings/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /com\.user\.notes/ })).toBeNull();

      fireEvent.click(screen.getByRole("radio", { name: new RegExp(tz("apps.filter.uninstalled")) }));
      expect(await screen.findByRole("button", { name: /com\.android\.gone/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /com\.android\.settings/ })).toBeNull();

      fireEvent.click(screen.getByRole("radio", { name: new RegExp(tz("apps.filter.all")) }));
      fireEvent.change(screen.getByPlaceholderText(tz("apps.search")), { target: { value: "SETTINGS" } });
      expect(await screen.findByRole("button", { name: /com\.android\.settings/ })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /com\.android\.gone/ })).toBeNull();
    });

    it("点一行后右侧显示详情", async () => {
      await openApps();
      const info = vi.spyOn(api, "appInfo").mockResolvedValue(detail);
      fireEvent.click(await screen.findByRole("button", { name: /com\.user\.notes/ }));
      expect(await screen.findByText(tz("apps.detail.versionValue", { name: "2.0", code: 20 }))).toBeTruthy();
      expect(info).toHaveBeenCalledWith("A", "com.user.notes");
      expect(screen.getByRole("button", { name: /com\.user\.notes/ }).getAttribute("aria-pressed")).toBe("true");
    });
  });
});
