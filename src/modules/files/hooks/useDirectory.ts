import { type UseQueryResult, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Target } from "../../../lib/index.ts";
import { parentPath, usePref } from "../../../lib/index.ts";
import type { FileEntry } from "../../../types.ts";
import { arrange, lsDeviceKey, lsQuery, type Sort } from "../lib/index.ts";
import type { Listing } from "../types.ts";
import type { Selection } from "./useSelection.ts";

const HOME = "/sdcard";
const NONE: FileEntry[] = [];

/**
 * 当前目录：路径、内容、加载状态和筛选。目录内容和其他各栏、展开的文件夹共用一份查询缓存，
 * 进入缓存里有的目录时先拿缓存顶上，界面不用等 ls 回来。
 * 进入目录和加载完成时会按需改动选择（选中指定项，或刷新后保留原有选择）
 */
export function useDirectory({
  target,
  online,
  sort,
  showHidden,
  selection,
}: {
  target: Target | null;
  online: boolean;
  sort: Sort;
  showHidden: boolean;
  selection: Pick<Selection, "selectOnly" | "clear">;
}) {
  const { selectOnly, clear } = selection;
  const queryClient = useQueryClient();
  const [path, setPath] = usePref("afm.path", HOME);
  /** 异步操作完成时用它取最新的目录，闭包里的 path 可能已经过时 */
  const pathRef = useRef(path);
  pathRef.current = path;
  const [filter, setFilter] = useState("");
  /** load 里算“第一项”要用当前的排序和隐藏文件设置，又不想让 load 跟着它们变 */
  const display = useRef({ sort, showHidden });
  display.current = { sort, showHidden };
  /** 只有最后一次 load 能改动选择 */
  const loadSeq = useRef(0);

  const query = useQuery({
    ...lsQuery(target, path),
    enabled: online,
    // 切换 root 模式时目录不变，新的列表回来之前接着显示原来的
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[3] === path ? prev : undefined),
  });
  const ready = query.isSuccess;
  const entries = query.isSuccess ? query.data : NONE;
  const listError = query.error?.message ?? null;

  // 换了设备、切换了 root 模式或重新连上：清空选择，之前发出的加载也不再改动选择
  // biome-ignore lint/correctness/useExhaustiveDependencies: target 和 online 是触发条件，变了就要重置
  useEffect(() => {
    loadSeq.current++;
    clear();
  }, [target, online, clear]);

  /**
   * 重新拉取 p，完成后改动选择：focus 是要选中的条目（true 为第一项），
   * 没有 focus 时按 keep 保留或清空选择。正在进行的同一目录的请求作废，保证拿到的是最新内容
   */
  const load = useCallback(
    async (p: string, { focus, keep = false }: { focus?: string | true; keep?: boolean } = {}) => {
      if (!target) return;
      const seq = ++loadSeq.current;
      const q = lsQuery(target, p);
      try {
        await queryClient.cancelQueries({ queryKey: q.queryKey, exact: true });
        const list = await queryClient.fetchQuery({ ...q, staleTime: 0 });
        if (seq !== loadSeq.current) return;
        const want = focus === true ? arrange(list, display.current.sort, display.current.showHidden)[0]?.path : focus;
        if (want && list.some((e) => e.path === want)) selectOnly(want);
        else if (!keep) clear();
      } catch {
        // 错误由 useQuery 返回，界面上显示
      }
    },
    [target, queryClient, selectOnly, clear],
  );

  /**
   * 增删改之后更新这台设备上的缓存：gone（改名、移走或删掉的路径）和它们下面的目录已经不在了，直接丢掉；
   * 其余的全部过期，正在显示的重新加载。skip 由调用方按 target 当前的 root 模式自己加载，
   * 另一种模式下的 skip 照样过期：长时间的传输期间可能切换了 root 模式，这时界面上显示的正是那一份
   */
  const invalidate = useCallback(
    (gone: string[], skip: string) => {
      if (!target) return;
      const queryKey = lsDeviceKey(target.serial);
      const dir = (q: { queryKey: readonly unknown[] }) => q.queryKey[3] as string;
      queryClient.removeQueries({
        queryKey,
        predicate: (q) => gone.some((g) => dir(q) === g || dir(q).startsWith(g + "/")),
      });
      void queryClient.invalidateQueries({
        queryKey,
        predicate: (q) => !(dir(q) === skip && q.queryKey[2] === target.root),
      });
    },
    [target, queryClient],
  );

  /** focus：进入后选中这一项，true 为第一项 */
  const navigate = useCallback(
    (p: string, focus?: string | true) => {
      setFilter("");
      if (p === path) {
        if (focus === true) focus = arrange(entries, display.current.sort, display.current.showHidden)[0]?.path;
        if (focus) return selectOnly(focus);
        // 点的是当前目录：直接刷新，别清空列表
        return void load(p);
      }
      setPath(p);
      const cached = queryClient.getQueryState(lsQuery(target, p).queryKey);
      const known = cached?.status === "success" ? cached.data : undefined;
      if (!known) return void load(p, { focus });
      // 缓存里有：立刻显示并选好，后台照常重新加载，加载完不再动选择
      if (focus === true) focus = arrange(known, display.current.sort, display.current.showHidden)[0]?.path;
      selectOnly(focus ?? null);
      void load(p, { keep: true });
    },
    [path, entries, target, queryClient, load, selectOnly, setPath],
  );

  /** 增删改之后：刷新当前目录，缓存的其他目录（分栏视图的上层各栏、展开的文件夹）也跟着重新加载 */
  const reload = useCallback(
    (keepSelection = false) => {
      const p = pathRef.current;
      invalidate([], p);
      return load(p, { keep: keepSelection });
    },
    [invalidate, load],
  );

  /**
   * moved 是被改名 / 移走（to 为新路径）或删掉（to 为 null）的条目。
   * 当前目录在其中某项里面时跟过去（删掉了就退到它的上一级），否则原地刷新
   */
  const afterChange = useCallback(
    async (moved: [from: string, to: string | null][] = [], keepSelection = false) => {
      const cur = pathRef.current;
      const gone = moved.map(([from]) => from);
      const hit = moved.find(([from]) => cur === from || cur.startsWith(from + "/"));
      if (!hit) {
        invalidate(gone, cur);
        return load(cur, { keep: keepSelection });
      }
      const [from, to] = hit;
      const next = to === null ? parentPath(from) : to + cur.slice(from.length);
      // 要去的目录也丢掉缓存，加载完之前不显示过期的内容
      invalidate(gone, next);
      queryClient.removeQueries({ queryKey: lsQuery(target, next).queryKey, exact: true });
      setPath(next);
      void load(next);
    },
    [target, queryClient, invalidate, load, setPath],
  );

  const visible = useMemo(() => arrange(entries, sort, showHidden, filter), [entries, filter, showHidden, sort]);

  return {
    path,
    entries,
    ready,
    visible,
    loading: query.isFetching,
    listError,
    filter,
    setFilter,
    navigate,
    reload,
    afterChange,
  };
}

export type Directory = ReturnType<typeof useDirectory>;

/**
 * 当前目录以外还要显示的目录（分栏视图的上层各栏和下一栏、列表视图展开的文件夹）。
 * 缓存里有就直接用，只在增删改、刷新让缓存过期之后才重新加载；还在加载的目录不在返回的表里
 */
export function useListings(target: Target | null, online: boolean, paths: string[]) {
  const key = paths.join("\n");
  const combine = useCallback(
    (results: UseQueryResult<FileEntry[]>[]) => {
      const out = new Map<string, Listing>();
      const list = key ? key.split("\n") : [];
      results.forEach((r, i) => {
        if (r.isError) out.set(list[i], { error: r.error.message });
        else if (r.isSuccess) out.set(list[i], { entries: r.data });
      });
      return out;
    },
    [key],
  );
  return useQueries({
    queries: paths.map((p) => ({ ...lsQuery(target, p), enabled: online, staleTime: Infinity })),
    combine,
  });
}
