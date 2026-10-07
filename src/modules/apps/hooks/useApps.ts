import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShell } from "../../../hooks/index.ts";
import { usePref } from "../../../lib/index.ts";
import type { AppEntry } from "../../../types.ts";
import { appsQuery, countApps, filterApps } from "../lib/index.ts";
import type { AppFilter } from "../types.ts";

const NONE: AppEntry[] = [];

/** 应用列表：查询、筛选、搜索和当前选中的应用 */
export function useApps() {
  const { serial, online } = useShell();
  const query = useQuery({ ...appsQuery(serial), enabled: online });
  const apps = query.data ?? NONE;

  const [filter, setFilter] = usePref<AppFilter>("afm.apps.filter", "user");
  const [search, setSearch] = useState("");
  const [pkg, setPkg] = useState<string | null>(null);

  // 换设备后之前选中的包名不一定存在
  // biome-ignore lint/correctness/useExhaustiveDependencies: serial 是触发条件，变了就要清空选择
  useEffect(() => setPkg(null), [serial]);

  const visible = useMemo(() => filterApps(apps, filter, search), [apps, filter, search]);
  const counts = useMemo(() => countApps(apps), [apps]);
  /** 选中的应用；它不在当前列表里（被卸载、刷新后消失）时视为未选中 */
  const selected = useMemo(() => apps.find((a) => a.pkg === pkg) ?? null, [apps, pkg]);
  const { refetch } = query;
  const reload = useCallback(() => void refetch(), [refetch]);

  return {
    serial,
    apps,
    visible,
    counts,
    filter,
    setFilter,
    search,
    setSearch,
    selected,
    select: setPkg,
    loading: query.isFetching,
    ready: query.isSuccess,
    error: query.error?.message ?? null,
    reload,
  };
}
