import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../i18n/index.tsx";
import { api } from "../../../lib/index.ts";
import { newQueryClient, tz } from "../../../test/utils.tsx";
import type { AppDetail as AppDetailData, AppEntry } from "../../../types.ts";
import { AppDetail } from "./AppDetail.tsx";

const entry: AppEntry = { pkg: "com.example.app", path: "/data/app/x/base.apk", system: false, state: "enabled" };

const detail: AppDetailData = {
  pkg: "com.example.app",
  versionName: "1.2.3",
  versionCode: 123,
  minSdk: 24,
  targetSdk: 33,
  firstInstall: "2023-01-01 10:00:00",
  lastUpdate: "2023-02-01 11:22:33",
  codePath: "/data/app/x",
  dataDir: "/data/user/0/com.example.app",
  abi: "arm64-v8a",
  uid: 10150,
  flags: ["HAS_CODE"],
  updatedSystem: false,
  permissions: [
    { name: "android.permission.INTERNET", runtime: false, granted: true },
    { name: "android.permission.CAMERA", runtime: true, granted: true },
    { name: "android.permission.READ_CONTACTS", runtime: true, granted: false },
    { name: "android.permission.CUSTOM_ONLY", runtime: false },
  ],
};

const ops = { run: vi.fn(), extract: vi.fn() };

function setup(onBack = vi.fn(), app: AppEntry = entry) {
  render(
    <QueryClientProvider client={newQueryClient()}>
      <I18nProvider>
        <AppDetail serial="A" entry={app} ops={ops} onBack={onBack} />
      </I18nProvider>
    </QueryClientProvider>,
  );
  return onBack;
}

describe("AppDetail", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    ops.run.mockClear();
    ops.extract.mockClear();
  });

  it("显示版本、SDK、时间和路径", async () => {
    const info = vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    setup();
    expect(await screen.findByText(tz("apps.detail.versionValue", { name: "1.2.3", code: 123 }))).toBeTruthy();
    expect(info).toHaveBeenCalledWith("A", "com.example.app");
    expect(screen.getByText("2023-01-01 10:00:00")).toBeTruthy();
    expect(screen.getByText("/data/user/0/com.example.app")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "com.example.app" })).toBeTruthy();
  });

  it("没有安装来源时显示未知，有时显示包名", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    setup();
    expect(await screen.findByText(tz("apps.detail.unknown"))).toBeTruthy();
  });

  it("显示安装来源的包名", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue({ ...detail, installer: "com.android.vending" });
    setup();
    expect(await screen.findByText("com.android.vending")).toBeTruthy();
    expect(screen.queryByText(tz("apps.detail.unknown"))).toBeNull();
  });

  it("权限按运行时、安装时和其他分组，并标出授予状态", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    setup();
    const group = async (title: string) =>
      (await screen.findByRole("heading", { name: new RegExp(title) })).closest("section") as HTMLElement;

    const runtime = await group(tz("apps.detail.permRuntime"));
    expect(within(runtime).getByText("android.permission.CAMERA").closest("li")?.textContent).toContain(
      tz("apps.detail.granted"),
    );
    expect(within(runtime).getByText("android.permission.READ_CONTACTS").closest("li")?.textContent).toContain(
      tz("apps.detail.denied"),
    );

    const install = await group(tz("apps.detail.permInstall"));
    expect(within(install).getByText("android.permission.INTERNET")).toBeTruthy();

    const other = await group(tz("apps.detail.permOther"));
    const item = within(other).getByText("android.permission.CUSTOM_ONLY").closest("li");
    expect(item?.textContent).not.toContain(tz("apps.detail.granted"));
    expect(item?.textContent).not.toContain(tz("apps.detail.denied"));
  });

  it("没有权限时给出提示", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue({ ...detail, permissions: [] });
    setup();
    expect(await screen.findByText(tz("apps.detail.noPermissions"))).toBeTruthy();
  });

  it("读取失败时显示错误", async () => {
    vi.spyOn(api, "appInfo").mockRejectedValue(new Error("设备上未找到应用"));
    setup();
    expect(await screen.findByText("设备上未找到应用")).toBeTruthy();
  });

  it("点返回按钮触发 onBack", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    const onBack = setup();
    fireEvent.click(screen.getByRole("button", { name: tz("apps.back") }));
    await waitFor(() => expect(onBack).toHaveBeenCalled());
  });

  it("点操作按钮时把应用交给 ops", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    setup();
    fireEvent.click(screen.getByRole("button", { name: tz("apps.action.disable") }));
    expect(ops.run).toHaveBeenCalledWith("disable", entry);
  });

  it("系统应用更新过时才显示“卸载更新”", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue({ ...detail, updatedSystem: true });
    setup(vi.fn(), { ...entry, system: true });
    expect(await screen.findByRole("button", { name: tz("apps.action.uninstallUpdates") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tz("apps.action.uninstallUser") })).toBeTruthy();
  });

  it("没有更新过时不显示“卸载更新”", async () => {
    vi.spyOn(api, "appInfo").mockResolvedValue(detail);
    setup(vi.fn(), { ...entry, system: true });
    await screen.findByText("2023-01-01 10:00:00");
    expect(screen.queryByRole("button", { name: tz("apps.action.uninstallUpdates") })).toBeNull();
  });
});
