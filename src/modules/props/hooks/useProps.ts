import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShell } from "../../../hooks/index.ts";
import { usePref } from "../../../lib/index.ts";
import type { PropEntry } from "../../../types.ts";
import { countProps, filterProps, propsQuery } from "../lib/index.ts";
import type { PropGroup } from "../types.ts";

const NONE: PropEntry[] = [];

/** 属性列表：查询、分组、搜索和数量 */
export function useProps() {
  const { serial, target, online } = useShell();
  const query = useQuery({ ...propsQuery(target), enabled: online });
  const props = query.data?.props ?? NONE;

  const [group, setGroup] = usePref<PropGroup>("afm.props.group", "all");
  const [search, setSearch] = useState("");

  // 换设备后沿用上一台的搜索词会让列表看起来是空的
  // biome-ignore lint/correctness/useExhaustiveDependencies: serial 是触发条件，变了就要清空搜索
  useEffect(() => setSearch(""), [serial]);

  const visible = useMemo(() => filterProps(props, group, search), [props, group, search]);
  const counts = useMemo(() => countProps(props), [props]);
  const { refetch } = query;
  const reload = useCallback(() => void refetch(), [refetch]);

  return {
    serial,
    props,
    /** 设备上有 resetprop：root 模式下才检测，其余为 false */
    resetprop: query.data?.resetprop ?? false,
    visible,
    counts,
    group,
    setGroup,
    search,
    setSearch,
    loading: query.isFetching,
    ready: query.isSuccess,
    error: query.error?.message ?? null,
    reload,
  };
}
