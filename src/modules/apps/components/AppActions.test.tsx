import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../../test/utils.tsx";
import type { AppEntry } from "../../../types.ts";
import { AppActions } from "./AppActions.tsx";

const entry = (patch: Partial<AppEntry> = {}): AppEntry => ({
  pkg: "com.example.app",
  path: "/data/app/x/base.apk",
  system: false,
  state: "enabled",
  ...patch,
});

function setup(app: AppEntry, updatedSystem = false) {
  const ops = { run: vi.fn(), extract: vi.fn() };
  render(<AppActions entry={app} updatedSystem={updatedSystem} ops={ops} />, { wrapper: providers() });
  const group = screen.getByRole("group", { name: tz("apps.action.label") });
  const labels = () =>
    within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
  return { ops, labels, group };
}

const L = (key: Parameters<typeof tz>[0]) => tz(key);

describe("AppActions", () => {
  it("已启用的用户应用：强行停止、停用、清除数据、卸载、提取 APK", () => {
    const { labels } = setup(entry());
    expect(labels()).toEqual([
      L("apps.action.stop"),
      L("apps.action.disable"),
      L("apps.action.clear"),
      L("apps.action.uninstall"),
      L("apps.action.extract"),
    ]);
  });

  it("系统应用的卸载按钮为“为当前用户卸载”", () => {
    const { labels } = setup(entry({ system: true }));
    expect(labels()).toContain(L("apps.action.uninstallUser"));
    expect(labels()).not.toContain(L("apps.action.uninstall"));
  });

  it("更新过的系统应用多一个“卸载更新”，位于卸载之后", () => {
    const { labels } = setup(entry({ system: true }), true);
    const list = labels();
    expect(list.indexOf(L("apps.action.uninstallUpdates"))).toBe(list.indexOf(L("apps.action.uninstallUser")) + 1);
  });

  it("没有更新过的应用不显示“卸载更新”", () => {
    expect(setup(entry({ system: true })).labels()).not.toContain(L("apps.action.uninstallUpdates"));
  });

  it("已停用的应用：启用、清除数据、卸载、提取 APK，没有强行停止和停用", () => {
    const { labels } = setup(entry({ state: "disabled" }));
    expect(labels()).toEqual([
      L("apps.action.enable"),
      L("apps.action.clear"),
      L("apps.action.uninstall"),
      L("apps.action.extract"),
    ]);
  });

  it("已卸载的系统应用只能恢复和提取 APK", () => {
    const { labels } = setup(entry({ system: true, state: "uninstalled" }), true);
    expect(labels()).toEqual([L("apps.action.restore"), L("apps.action.extract")]);
  });

  it.each([
    ["apps.action.stop", "stop"],
    ["apps.action.disable", "disable"],
    ["apps.action.clear", "clear"],
    ["apps.action.uninstall", "uninstall"],
  ] as const)("点“%s”以 %s 调用 run", (label, op) => {
    const app = entry();
    const { ops } = setup(app);
    fireEvent.click(screen.getByRole("button", { name: L(label) }));
    expect(ops.run).toHaveBeenCalledWith(op, app);
  });

  it("点提取 APK 调用 extract", () => {
    const app = entry();
    const { ops } = setup(app);
    fireEvent.click(screen.getByRole("button", { name: L("apps.action.extract") }));
    expect(ops.extract).toHaveBeenCalledWith(app);
    expect(ops.run).not.toHaveBeenCalled();
  });
});
