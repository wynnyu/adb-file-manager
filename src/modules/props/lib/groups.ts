import type { PropEntry } from "../../../types.ts";
import type { PropGroup } from "../types.ts";

/** 有独立分组的键名第一段；init.svc.* 的第一段也是 init */
const NAMED: ReadonlySet<string> = new Set<Exclude<PropGroup, "all" | "other">>([
  "ro",
  "persist",
  "sys",
  "init",
  "vendor",
]);

/** 属性所属的分组：按键名第一段，没有独立分组的归 other */
export function groupOf(key: string): Exclude<PropGroup, "all"> {
  const head = key.split(".", 1)[0];
  return NAMED.has(head) ? (head as Exclude<PropGroup, "all" | "other">) : "other";
}

/** 按分组和搜索词过滤；搜索词同时匹配键名和值，不区分大小写 */
export function filterProps(props: PropEntry[], group: PropGroup, search: string): PropEntry[] {
  const needle = search.trim().toLowerCase();
  return props.filter(
    (p) =>
      (group === "all" || groupOf(p.key) === group) &&
      (!needle || p.key.toLowerCase().includes(needle) || p.value.toLowerCase().includes(needle)),
  );
}

/** 各分组的属性数量，不受搜索词影响 */
export function countProps(props: PropEntry[]): Record<PropGroup, number> {
  const counts: Record<PropGroup, number> = {
    all: props.length,
    ro: 0,
    persist: 0,
    sys: 0,
    init: 0,
    vendor: 0,
    other: 0,
  };
  for (const p of props) counts[groupOf(p.key)]++;
  return counts;
}
