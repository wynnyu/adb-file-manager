import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type Target } from "../api.ts";
import { arrange, type Sort } from "../entries.ts";
import { parentPath } from "../format.ts";
import { usePref } from "../prefs.ts";
import type { FileEntry, Listing } from "../types.ts";
import type { Selection } from "./useSelection.ts";

const HOME = "/sdcard";

/**
 * 当前目录：路径、内容、加载状态和筛选，以及当前目录以外还要显示的目录的缓存。
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
  const [path, setPath] = usePref("afm.path", HOME);
  /** 异步操作完成时用它取最新的目录，闭包里的 path 可能已经过时 */
  const pathRef = useRef(path);
  pathRef.current = path;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  /** entries 属于哪个目录；切换目录、还没加载完时为 null */
  const [entriesDir, setEntriesDir] = useState<string | null>(null);
  /** 刷新序号：每次刷新或增删改后 +1，分栏视图的上层各栏据此重新加载 */
  const [rev, setRev] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  /** 进入目录后要选中的条目（分栏视图里点上层栏的文件）；true 表示选中第一项 */
  const pendingFocus = useRef<string | true | null>(null);
  /** 进入目录时先用缓存显示了这个目录，加载完别清掉期间的选择 */
  const seeded = useRef<string | null>(null);
  /** load 里算“第一项”要用当前的排序和隐藏文件设置，又不想让 load 跟着它们变 */
  const display = useRef({ sort, showHidden });
  display.current = { sort, showHidden };
  const loadSeq = useRef(0);

  const load = useCallback(
    async (p: string, keepSelection = false) => {
      if (!target) return;
      const seq = ++loadSeq.current;
      setLoading(true);
      try {
        const list = await api.ls(target, p);
        if (seq !== loadSeq.current) return;
        setEntries(list);
        setEntriesDir(p);
        setListError(null);
        const want = pendingFocus.current;
        pendingFocus.current = null;
        // 先拿缓存顶上的目录已经按缓存选好了，用户可能也已经接着操作，别再动选择
        const keep = keepSelection || seeded.current === p;
        seeded.current = null;
        const focus = want === true ? arrange(list, display.current.sort, display.current.showHidden)[0]?.path : want;
        if (focus && list.some((e) => e.path === focus)) selectOnly(focus);
        else if (!keep) clear();
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setEntries([]);
        setEntriesDir(null);
        setListError((e as Error).message);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [target, selectOnly, clear],
  );

  useEffect(() => {
    if (online) void load(path);
  }, [online, path, load]);

  // ---------- 目录缓存 ----------
  // 当前目录以外还要显示的目录（分栏视图的上层各栏和下一栏、列表视图展开的文件夹）都存在这里。
  // 进入缓存里有的目录时先拿缓存顶上，界面不用等 ls 回来
  const [dirs, setDirs] = useState(() => new Map<string, Listing>());
  const dirsRef = useRef(dirs);
  dirsRef.current = dirs;
  const revRef = useRef(rev);
  revRef.current = rev;
  const dirInflight = useRef(new Set<string>());
  /** 换设备时 +1，丢掉之前发出去还没回来的请求 */
  const dirGen = useRef(0);

  const putDir = useCallback(
    (dir: string, listing: Listing) =>
      setDirs((m) => ((m.get(dir)?.rev ?? -1) > listing.rev ? m : new Map(m).set(dir, listing))),
    [],
  );

  // 必须排在 usePrefetchDirs 的 effect 之前：换设备时先作废旧请求，预取才会用新的 dirGen 重新发起
  // biome-ignore lint/correctness/useExhaustiveDependencies: target 是触发条件，换了设备就清空
  useEffect(() => {
    dirGen.current++;
    dirInflight.current.clear();
    setDirs(new Map());
  }, [target]);

  // 当前目录加载好了也记下来，往下走一层时它成了上一栏，不用重新加载
  useEffect(() => {
    if (entriesDir) putDir(entriesDir, { rev: revRef.current, entries });
  }, [entriesDir, entries, putDir]);

  const cache = useMemo(() => ({ dirsRef, inflight: dirInflight, gen: dirGen, put: putDir }), [putDir]);

  /** focus：进入后选中这一项，true 为第一项 */
  const navigate = useCallback(
    (p: string, focus?: string | true) => {
      setFilter("");
      if (p === path) {
        if (focus === true) focus = arrange(entries, display.current.sort, display.current.showHidden)[0]?.path;
        if (focus) return selectOnly(focus);
        // 点的是当前目录：path 不变不会触发加载 effect，直接刷新，别清空列表
        return void load(p);
      }
      const known = dirsRef.current.get(p)?.entries;
      if (known) {
        // 缓存里有：立刻显示并选好，后台照常重新加载
        if (focus === true) focus = arrange(known, display.current.sort, display.current.showHidden)[0]?.path;
        selectOnly(focus ?? null);
        pendingFocus.current = null;
        seeded.current = p;
        setEntries(known);
        setEntriesDir(p);
      } else {
        pendingFocus.current = focus ?? null;
        seeded.current = null;
        setEntries([]);
        setEntriesDir(null);
      }
      setListError(null);
      setPath(p);
    },
    [path, load, entries, selectOnly, setPath],
  );

  /** 增删改之后：刷新当前目录，并让分栏视图的上层各栏也重新加载 */
  const reload = useCallback(
    (keepSelection = false) => {
      setRev((r) => r + 1);
      return load(pathRef.current, keepSelection);
    },
    [load],
  );

  /**
   * moved 是被改名 / 移走（to 为新路径）或删掉（to 为 null）的条目。
   * 当前目录在其中某项里面时跟过去（删掉了就退到它的上一级），否则原地刷新
   */
  const afterChange = useCallback(
    async (moved: [from: string, to: string | null][] = [], keepSelection = false) => {
      const cur = pathRef.current;
      const hit = moved.find(([from]) => cur === from || cur.startsWith(from + "/"));
      if (!hit) return reload(keepSelection);
      const [from, to] = hit;
      setRev((r) => r + 1);
      setEntries([]);
      setEntriesDir(null);
      setPath(to === null ? parentPath(from) : to + cur.slice(from.length));
    },
    [reload, setPath],
  );

  const visible = useMemo(() => arrange(entries, sort, showHidden, filter), [entries, filter, showHidden, sort]);

  return {
    path,
    entries,
    entriesDir,
    visible,
    rev,
    loading,
    listError,
    filter,
    setFilter,
    dirs,
    cache,
    navigate,
    reload,
    afterChange,
  };
}

export type Directory = ReturnType<typeof useDirectory>;

/** 把 wanted 里缓存没有或已过期（增删改、刷新后 rev 变了）的目录拉下来 */
export function usePrefetchDirs(target: Target | null, rev: number, cache: Directory["cache"], wanted: string[]) {
  const wantedKey = wanted.join("\n");

  useEffect(() => {
    if (!target) return;
    const { dirsRef, inflight, gen, put } = cache;
    const g = gen.current;
    for (const dir of wantedKey ? wantedKey.split("\n") : []) {
      const key = `${dir}@${rev}`;
      if (dirsRef.current.get(dir)?.rev === rev || inflight.current.has(key)) continue;
      inflight.current.add(key);
      const done = (l: Listing) => g === gen.current && put(dir, l);
      api
        .ls(target, dir)
        .then(
          (list) => done({ rev, entries: list }),
          (e: Error) => done({ rev, error: e.message }),
        )
        .finally(() => inflight.current.delete(key));
    }
  }, [wantedKey, rev, target, cache]);
}
