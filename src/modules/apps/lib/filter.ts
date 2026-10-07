import type { AppEntry } from "../../../types.ts";
import type { AppFilter } from "../types.ts";

const MATCHERS: Record<AppFilter, (app: AppEntry) => boolean> = {
  all: () => true,
  user: (a) => !a.system,
  system: (a) => a.system,
  disabled: (a) => a.state === "disabled",
  uninstalled: (a) => a.state === "uninstalled",
};

/** 按筛选项和搜索词过滤；搜索词只匹配包名，不区分大小写 */
export function filterApps(apps: AppEntry[], filter: AppFilter, search: string): AppEntry[] {
  const needle = search.trim().toLowerCase();
  const match = MATCHERS[filter];
  return apps.filter((a) => match(a) && (!needle || a.pkg.toLowerCase().includes(needle)));
}

/** 各筛选项对应的应用数量，不受搜索词影响 */
export function countApps(apps: AppEntry[]): Record<AppFilter, number> {
  const counts: Record<AppFilter, number> = { all: 0, user: 0, system: 0, disabled: 0, uninstalled: 0 };
  for (const filter of Object.keys(MATCHERS) as AppFilter[]) {
    counts[filter] = apps.filter(MATCHERS[filter]).length;
  }
  return counts;
}
