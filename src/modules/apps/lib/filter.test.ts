import { describe, expect, it } from "vitest";
import type { AppEntry } from "../../../types.ts";
import { countApps, filterApps } from "./filter.ts";

const app = (pkg: string, patch: Partial<AppEntry> = {}): AppEntry => ({
  pkg,
  path: `/data/app/${pkg}/base.apk`,
  system: false,
  state: "enabled",
  ...patch,
});

const APPS = [
  app("com.user.Notes"),
  app("com.user.off", { state: "disabled" }),
  app("com.android.settings", { system: true }),
  app("com.android.chrome", { system: true, state: "disabled" }),
  app("com.android.gone", { system: true, state: "uninstalled" }),
];

const names = (list: AppEntry[]) => list.map((a) => a.pkg);

describe("filterApps", () => {
  it.each([
    ["all", ["com.user.Notes", "com.user.off", "com.android.settings", "com.android.chrome", "com.android.gone"]],
    ["user", ["com.user.Notes", "com.user.off"]],
    ["system", ["com.android.settings", "com.android.chrome", "com.android.gone"]],
    ["disabled", ["com.user.off", "com.android.chrome"]],
    ["uninstalled", ["com.android.gone"]],
  ] as const)("筛选 %s", (filter, expected) => {
    expect(names(filterApps(APPS, filter, ""))).toEqual(expected);
  });

  it("搜索按包名子串匹配，不区分大小写", () => {
    expect(names(filterApps(APPS, "all", "NOTES"))).toEqual(["com.user.Notes"]);
    expect(names(filterApps(APPS, "all", "android."))).toHaveLength(3);
  });

  it("搜索和筛选同时生效，忽略首尾空白", () => {
    expect(names(filterApps(APPS, "system", " chrome "))).toEqual(["com.android.chrome"]);
    expect(filterApps(APPS, "user", "chrome")).toEqual([]);
  });
});

describe("countApps", () => {
  it("统计各筛选项的数量，用户加系统等于全部", () => {
    const counts = countApps(APPS);
    expect(counts).toEqual({ all: 5, user: 2, system: 3, disabled: 2, uninstalled: 1 });
    expect(counts.user + counts.system).toBe(counts.all);
  });

  it("空列表全为 0", () => {
    expect(countApps([])).toEqual({ all: 0, user: 0, system: 0, disabled: 0, uninstalled: 0 });
  });
});
