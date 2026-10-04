import {
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Link,
  Pencil,
  RotateCw,
  Scissors,
  Search,
  Shield,
  ShieldAlert,
  Skull,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type DragEvent,
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, onRootLost, type Target } from "./api.ts";
import {
  type Bookmark,
  bookmarkName,
  loadBookmarks,
  newBookmarkId,
  nextBookmarkColor,
  normalizePath,
  PRESETS,
  presetFields,
  saveBookmarks,
  storedName,
} from "./bookmarks.ts";
import { Breadcrumbs } from "./components/Breadcrumbs.tsx";
import { ColumnView } from "./components/ColumnView.tsx";
import { ContextMenu, type MenuItem, type MenuState } from "./components/ContextMenu.tsx";
import { DeviceSelect } from "./components/DeviceSelect.tsx";
import { Dialog, type DialogState } from "./components/Dialog.tsx";
import { FileList } from "./components/FileList.tsx";
import { GalleryView } from "./components/GalleryView.tsx";
import { IconGrid } from "./components/IconGrid.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { NoDevice } from "./components/NoDevice.tsx";
import { QuickLinks } from "./components/QuickLinks.tsx";
import { ThemePicker } from "./components/ThemePicker.tsx";
import { TransferQueue } from "./components/TransferQueue.tsx";
import { UsageTip } from "./components/UsageTip.tsx";
import { IconButton, PillButton, spring } from "./components/ui.tsx";
import { VIEWS, ViewSwitch } from "./components/ViewSwitch.tsx";
import { collectDropped, fromInput, type UploadItem } from "./drop.ts";
import { arrange, MOD, type Sort, type SortKey } from "./entries.ts";
import { formatSize, joinPath, parentPath } from "./format.ts";
import { useI18n, useT } from "./i18n/index.tsx";
import { loadPref, savePref } from "./prefs.ts";
import type { Clip, Device, FileEntry, Listing, Transfer, TreeRow, ViewMode } from "./types.ts";

const HOME = "/sdcard";

/** 内部存储、SD 卡和 /data/local/tmp 里的内容普通 shell 用户就能删，root 模式下删除这些不额外警告 */
const SHELL_WRITABLE = [
  /^\/sdcard\/./,
  /^\/mnt\/sdcard\/./,
  /^\/storage\/(emulated\/\d+|self\/primary|[0-9A-F]{4}-[0-9A-F]{4})\/./i,
  /^\/data\/local\/tmp\/./,
];
const needsRoot = (p: string) => !SHELL_WRITABLE.some((re) => re.test(p));

export default function App() {
  const { t, rich } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [serial, setSerial] = useState<string | null>(null);
  const [path, setPath] = useState(() => loadPref("afm.path", HOME));
  /** 异步操作完成时用它取最新的目录，闭包里的 path 可能已经过时 */
  const pathRef = useRef(path);
  pathRef.current = path;
  const [entries, setEntries] = useState<FileEntry[]>([]);
  /** entries 属于哪个目录；切换目录、还没加载完时为 null */
  const [entriesDir, setEntriesDir] = useState<string | null>(null);
  /** 刷新序号：每次刷新或增删改后 +1，分栏视图的上层各栏据此重新加载 */
  const [rev, setRev] = useState(0);
  const [view, setView] = useState<ViewMode>(() => loadPref("afm.view", "list"));
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  /** 进入目录后要选中的条目（分栏视图里点上层栏的文件）；true 表示选中第一项 */
  const pendingFocus = useRef<string | true | null>(null);
  /** 进入目录时先用缓存显示了这个目录，加载完别清掉期间的选择 */
  const seeded = useRef<string | null>(null);
  const [sort, setSort] = useState<Sort>(() => loadPref("afm.sort", { key: "name", asc: true }));
  const [showHidden, setShowHidden] = useState(() => loadPref("afm.hidden", false));
  /** load 里算“第一项”要用当前的排序和隐藏文件设置，又不想让 load 跟着它们变 */
  const display = useRef({ sort, showHidden });
  display.current = { sort, showHidden };
  const [filter, setFilter] = useState("");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: "error" | "info" } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const [rootMode, setRootMode] = useState(() => loadPref("afm.rootRemember", false));
  const rootVerified = useRef<string | null>(null);
  const [storage, setStorage] = useState<{ total: number; free: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  /** 右键“上传到这里”的目标目录；为 null 时上传到当前目录 */
  const uploadDest = useRef<string | null>(null);
  const loadSeq = useRef(0);

  const device = devices.find((d) => d.serial === serial);
  const target = useMemo<Target | null>(() => (serial ? { serial, root: rootMode } : null), [serial, rootMode]);
  const online = device?.state === "device";

  // ---------- 设备轮询 ----------
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const list = await api.devices();
        if (!alive) return;
        setAdbError(null);
        setDevices(list);
        setSerial((cur) => {
          if (cur && list.some((d) => d.serial === cur)) return cur;
          return (list.find((d) => d.state === "device") ?? list[0])?.serial ?? cur;
        });
      } catch (e) {
        if (alive) setAdbError((e as Error).message);
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // ---------- 目录加载 ----------
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
        if (focus && list.some((e) => e.path === focus)) {
          anchor.current = focus;
          setSelected(new Set([focus]));
        } else if (!keep) setSelected(new Set());
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setEntries([]);
        setEntriesDir(null);
        setListError((e as Error).message);
      } finally {
        if (seq === loadSeq.current) setLoading(false);
      }
    },
    [target],
  );

  useEffect(() => {
    if (online) void load(path);
  }, [online, path, load]);

  const refreshStorage = useCallback(() => {
    if (serial && online) api.storage(serial).then(setStorage, () => setStorage(null));
  }, [serial, online]);

  useEffect(() => {
    if (online) refreshStorage();
    else setStorage(null);
  }, [online, refreshStorage]);

  useEffect(() => savePref("afm.path", path), [path]);
  useEffect(() => saveBookmarks(bookmarks), [bookmarks]);
  useEffect(() => savePref("afm.sort", sort), [sort]);
  useEffect(() => savePref("afm.hidden", showHidden), [showHidden]);
  useEffect(() => savePref("afm.view", view), [view]);

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

  /** focus：进入后选中这一项，true 为第一项 */
  const navigate = useCallback(
    (p: string, focus?: string | true) => {
      setFilter("");
      if (p === path) {
        if (focus === true) focus = arrange(entries, display.current.sort, display.current.showHidden)[0]?.path;
        if (focus) {
          anchor.current = focus;
          setSelected(new Set([focus]));
          return;
        }
        // 点的是当前目录：path 不变不会触发加载 effect，直接刷新，别清空列表
        return void load(p);
      }
      const known = dirsRef.current.get(p)?.entries;
      if (known) {
        // 缓存里有：立刻显示并选好，后台照常重新加载
        if (focus === true) focus = arrange(known, display.current.sort, display.current.showHidden)[0]?.path;
        anchor.current = focus ?? null;
        setSelected(new Set(focus ? [focus] : []));
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
    [path, load, entries],
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
    [reload],
  );

  const visible = useMemo(() => arrange(entries, sort, showHidden, filter), [entries, filter, showHidden, sort]);

  // ---------- 列表视图的展开三角 ----------
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // 换了目录或设备就全部收起
  // biome-ignore lint/correctness/useExhaustiveDependencies: path 和 target 是触发条件，变了就要重置
  useEffect(() => setExpanded(new Set()), [path, target]);

  const toggleExpand = useCallback((entry: FileEntry, open?: boolean) => {
    setExpanded((s) => {
      if (open === s.has(entry.path)) return s;
      const n = new Set(s);
      if (!n.delete(entry.path)) n.add(entry.path);
      return n;
    });
  }, []);

  /** 列表视图逐行展开后的样子：文件夹下面紧跟它的内容 */
  const rows = useMemo(() => {
    const out: TreeRow[] = [];
    const walk = (list: FileEntry[], depth: number) => {
      for (const entry of list) {
        out.push({ entry, depth });
        if (!entry.isDir || !expanded.has(entry.path)) continue;
        const sub = dirs.get(entry.path);
        if (sub?.error) out.push({ note: sub.error, key: `${entry.path}\0error`, depth: depth + 1 });
        else if (sub?.entries) walk(arrange(sub.entries, sort, showHidden), depth + 1);
      }
    };
    walk(visible, 0);
    return out;
  }, [visible, expanded, dirs, sort, showHidden]);

  const pending = useMemo(() => new Set([...expanded].filter((d) => !dirs.has(d))), [expanded, dirs]);

  /** 能选中、能用方向键走到的条目：列表视图包括展开的子项 */
  const selectable = useMemo(
    () => (view === "list" ? rows.flatMap((r) => ("entry" in r ? [r.entry] : [])) : visible),
    [view, rows, visible],
  );

  // ---------- 提示 & 传输队列 ----------
  const flash = useCallback((msg: string, tone: "error" | "info" = "error") => {
    const next = { msg, tone };
    setToast(next);
    setTimeout(() => setToast((t) => (t === next ? null : t)), tone === "info" ? 2500 : 4000);
  }, []);

  useEffect(() => {
    if (!rootMode || !online || !serial || rootVerified.current === serial) return;
    api.rootCheck(serial).then(
      () => (rootVerified.current = serial),
      (e: Error) => {
        rootVerified.current = null;
        setRootMode(false);
        flash(t("root.exited", { reason: e.message }));
      },
    );
  }, [rootMode, online, serial, flash, t]);

  const patchTransfer = useCallback((id: string, patch: Partial<Transfer>) => {
    setTransfers((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.status === "done") {
      setTimeout(() => setTransfers((list) => list.filter((t) => t.id !== id)), 4000);
    }
  }, []);

  const startTransfer = useCallback((t: Omit<Transfer, "id">) => {
    const id = crypto.randomUUID();
    setTransfers((list) => [...list, { ...t, id }]);
    return id;
  }, []);

  // ---------- 操作 ----------
  const upload = useCallback(
    async (items: UploadItem[], dest = path) => {
      if (!target || !online || !items.length) return;
      const tops = new Set(items.map((i) => i.path.split("/")[0]));
      const label =
        tops.size === 1
          ? [...tops][0]
          : t("common.itemsEtc", { name: [...tops][0], n: tops.size, rest: tops.size - 1 });
      const id = startTransfer({ kind: "upload", label, status: "uploading", progress: 0 });
      try {
        await api.upload(target, dest, items, (p) =>
          patchTransfer(id, p >= 1 ? { status: "pushing", progress: undefined } : { progress: p }),
        );
        patchTransfer(id, { status: "done" });
        refreshStorage();
        void reload(true);
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
      }
    },
    [target, online, path, reload, startTransfer, patchTransfer, refreshStorage, t],
  );

  const download = useCallback(
    async (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const label =
        targets.length === 1
          ? targets[0].name
          : t("common.itemsEtc", { name: targets[0].name, n: targets.length, rest: targets.length - 1 });
      const id = startTransfer({ kind: "download", label, status: "pulling" });
      try {
        await api.download(
          target,
          targets.map((t) => t.path),
        );
        patchTransfer(id, { status: "done" });
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
      }
    },
    [target, startTransfer, patchTransfer, t],
  );

  const askDelete = useCallback(
    (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const single = targets.length === 1;
      const doDelete = async () => {
        await api.remove(
          target,
          targets.map((t) => t.path),
        );
        refreshStorage();
        await afterChange(targets.map((t) => [t.path, null]));
      };
      const params = { name: targets[0].name, n: targets.length };
      // 只有内部存储、SD 卡以外的路径才真正用到 root，这时才警告
      const rooted = rootMode ? targets.filter((t) => needsRoot(t.path)) : [];
      if (rooted.length && !loadPref("afm.rootDeleteNoWarn", false)) {
        setDialog({
          kind: "confirm",
          tone: "danger",
          icon: <Skull className="size-7" />,
          title: t(single ? "delete.titleRoot" : "delete.titleRootMany", params),
          countdown: 3,
          confirm: t("delete.root.confirm"),
          checkbox: t("delete.root.noWarn"),
          message: (
            <div className="flex flex-col items-center gap-3">
              <p>{rich("delete.root.message", { b: (s) => <b className="text-red">{s}</b> })}</p>
              <ul className="flex w-full flex-col gap-1">
                {rooted.slice(0, 4).map((t) => (
                  <li key={t.path} className="truncate rounded-full bg-red/10 px-4 py-1.5 font-mono text-xs text-red">
                    {t.path}
                  </li>
                ))}
                {rooted.length > 4 && (
                  <li className="text-xs text-muted">{t("common.moreItems", { n: rooted.length - 4 })}</li>
                )}
              </ul>
            </div>
          ),
          onSubmit: async (noWarn) => {
            if (noWarn) savePref("afm.rootDeleteNoWarn", true);
            await doDelete();
          },
        });
        return;
      }
      setDialog({
        kind: "confirm",
        tone: "danger",
        icon: <Trash2 className="size-7" />,
        title: t(
          single
            ? rooted.length
              ? "delete.titleRoot"
              : "delete.title"
            : rooted.length
              ? "delete.titleRootMany"
              : "delete.titleMany",
          params,
        ),
        message: t("delete.message"),
        confirm: t("common.delete"),
        onSubmit: doDelete,
      });
    },
    [target, rootMode, afterChange, refreshStorage, t, rich],
  );

  // ---------- root 模式 ----------
  const askEnableRoot = useCallback(() => {
    if (!serial) return;
    setDialog({
      kind: "confirm",
      tone: "warn",
      icon: <ShieldAlert className="size-7" />,
      title: t("root.enable.title"),
      message: (
        <p>
          {rich("root.enable.message", {
            code: (s) => <code className="rounded-full bg-crust px-2 py-0.5 font-mono text-peach">{s}</code>,
          })}
        </p>
      ),
      checkbox: t("root.enable.remember"),
      confirm: t("root.enable.confirm"),
      onSubmit: async (remember) => {
        await api.rootCheck(serial);
        rootVerified.current = serial;
        savePref("afm.rootRemember", remember);
        setRootMode(true);
      },
    });
  }, [serial, t, rich]);

  const disableRoot = useCallback(() => {
    rootVerified.current = null;
    savePref("afm.rootRemember", false);
    setRootMode(false);
  }, []);

  // 操作途中 root 被撤销：退出 root 模式，但保留“记住选择”，重新授权后下次还能自动开启
  useEffect(() => {
    onRootLost((message) => {
      rootVerified.current = null;
      setRootMode(false);
      flash(t("root.exited", { reason: message }));
    });
    return () => onRootLost(() => {});
  }, [flash, t]);

  useEffect(() => {
    const name = t("app.name");
    document.title = rootMode ? t("app.rootTitle", { name }) : name;
  }, [rootMode, t]);

  const askRename = useCallback(
    (entry: FileEntry) => {
      if (!target) return;
      setDialog({
        kind: "prompt",
        icon: <Pencil className="size-7" />,
        title: t("rename.title"),
        initial: entry.name,
        confirm: t("common.confirm"),
        onSubmit: async (name) => {
          if (name.includes("/")) throw new Error(t("name.noSlash"));
          if (name === entry.name) return;
          const to = joinPath(parentPath(entry.path), name);
          await api.rename(target, entry.path, to);
          await afterChange([[entry.path, to]]);
        },
      });
    },
    [target, afterChange, t],
  );

  const askMkdir = useCallback(
    (dir: string = path) => {
      if (!target) return;
      setDialog({
        kind: "prompt",
        icon: <FolderPlus className="size-7" />,
        title: t("mkdir.title"),
        initial: t("mkdir.initial"),
        confirm: t("mkdir.confirm"),
        onSubmit: async (name) => {
          if (name.includes("/")) throw new Error(t("name.noSlash"));
          await api.mkdir(target, joinPath(dir, name));
          await reload(true);
        },
      });
    },
    [target, path, reload, t],
  );

  /** 不传 existing 时新建书签，名称和路径取当前目录 */
  const askBookmark = useCallback(
    (existing?: Bookmark) => {
      const name = path === "/" ? t("crumbs.root") : path.slice(path.lastIndexOf("/") + 1);
      const order = (b: { preset?: string }) => PRESETS.findIndex((p) => p.preset === b.preset);
      setDialog({
        kind: "bookmark",
        title: existing ? t("bookmark.edit") : t("bookmark.new"),
        initial: existing
          ? {
              name: bookmarkName(existing, t),
              path: existing.path,
              icon: existing.icon,
              color: existing.color,
              preset: existing.preset,
            }
          : { name, path, icon: "bookmark", color: nextBookmarkColor(bookmarks) },
        templates: existing
          ? undefined
          : PRESETS.filter((p) => !bookmarks.some((b) => b.preset === p.preset)).map(presetFields),
        confirm: existing ? t("bookmark.save") : t("bookmark.create"),
        onSubmit: async (v) => {
          const p = normalizePath(v.path);
          if (!p) throw new Error(t("bookmark.badPath"));
          const next = { ...v, path: p, name: storedName(v, t) };
          setBookmarks((list) => {
            if (existing) return list.map((b) => (b.id === existing.id ? { ...b, ...next } : b));
            const item = { id: newBookmarkId(), ...next };
            if (!next.preset) return [...list, item];
            // 内置书签放回原来的位置：排在顺序靠前的内置书签之后
            const i = list.findLastIndex((b) => b.preset && order(b) < order(next));
            return list.toSpliced(i + 1, 0, item);
          });
        },
      });
    },
    [path, bookmarks, t],
  );

  const open = useCallback(
    (entry: FileEntry) => (entry.isDir ? navigate(entry.path) : void download([entry])),
    [navigate, download],
  );

  // ---------- 选择 ----------
  const onSelect = useCallback(
    (entry: FileEntry, e: MouseEvent) => {
      if (e.shiftKey && anchor.current) {
        const a = selectable.findIndex((v) => v.path === anchor.current);
        const b = selectable.findIndex((v) => v.path === entry.path);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(selectable.slice(lo, hi + 1).map((v) => v.path)));
          return;
        }
      }
      anchor.current = entry.path;
      if (e.metaKey || e.ctrlKey) {
        setSelected((s) => {
          const n = new Set(s);
          if (!n.delete(entry.path)) n.add(entry.path);
          return n;
        });
      } else {
        setSelected(new Set([entry.path]));
      }
    },
    [selectable],
  );

  const onToggle = useCallback((entry: FileEntry) => {
    anchor.current = entry.path;
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(entry.path)) n.add(entry.path);
      return n;
    });
  }, []);

  const selectedEntries = useMemo(() => selectable.filter((v) => selected.has(v.path)), [selectable, selected]);

  /** 当前视图要另外加载的目录：分栏视图是上层各栏，加上选中文件夹的下一栏；列表视图是展开的文件夹 */
  const wanted = useMemo(() => {
    if (view === "list") return [...expanded];
    if (view !== "columns") return [];
    const parts = path.split("/").filter(Boolean);
    const out = parts.map((_, i) => "/" + parts.slice(0, i).join("/"));
    const one = selectedEntries.length === 1 ? selectedEntries[0] : null;
    if (one?.isDir) out.push(one.path);
    return out;
  }, [view, expanded, path, selectedEntries]);
  const wantedKey = wanted.join("\n");

  // 缓存里没有或已过期（增删改、刷新后 rev 变了）的才去拉
  useEffect(() => {
    if (!target) return;
    const gen = dirGen.current;
    for (const dir of wantedKey ? wantedKey.split("\n") : []) {
      const key = `${dir}@${rev}`;
      if (dirsRef.current.get(dir)?.rev === rev || dirInflight.current.has(key)) continue;
      dirInflight.current.add(key);
      const put = (l: Listing) => gen === dirGen.current && putDir(dir, l);
      api
        .ls(target, dir)
        .then(
          (list) => put({ rev, entries: list }),
          (e: Error) => put({ rev, error: e.message }),
        )
        .finally(() => dirInflight.current.delete(key));
    }
  }, [wantedKey, rev, target, putDir]);

  // ---------- 剪切 / 拷贝 / 粘贴 ----------
  const canPaste = !!clip && clip.serial === serial;
  const cutPaths = useMemo(
    () => new Set(clip?.mode === "cut" && clip.serial === serial ? clip.entries.map((e) => e.path) : []),
    [clip, serial],
  );

  const toClip = useCallback(
    (mode: Clip["mode"], items: FileEntry[]) => {
      if (!serial || !items.length) return;
      setClip({ mode, entries: items, serial });
      flash(t(mode === "cut" ? "clip.cut" : "clip.copied", { n: items.length }), "info");
    },
    [serial, flash, t],
  );

  const paste = useCallback(
    async (dest: string) => {
      if (!target || !clip || clip.serial !== target.serial) return;
      const { mode, entries: items } = clip;
      const label =
        items.length === 1
          ? items[0].name
          : t("common.itemsEtc", { name: items[0].name, n: items.length, rest: items.length - 1 });
      const move = mode === "cut";
      const id = startTransfer({ kind: move ? "move" : "copy", label, status: move ? "moving" : "copying" });
      try {
        await (move ? api.move : api.copy)(
          target,
          items.map((i) => i.path),
          dest,
        );
        patchTransfer(id, { status: "done" });
        // 剪切的只能粘贴一次；拷贝的可以继续粘贴到别处
        if (move) setClip(null);
        else refreshStorage();
        await afterChange(move ? items.map((i) => [i.path, joinPath(dest, i.name)]) : [], true);
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
        // 多项时可能已经完成了一部分
        void reload(true);
      }
    },
    [target, clip, t, startTransfer, patchTransfer, refreshStorage, afterChange, reload],
  );

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => flash(t("clip.pathCopied"), "info"),
        () => flash(t("clip.failed")),
      );
    },
    [flash, t],
  );

  const pickUpload = (input: RefObject<HTMLInputElement | null>, dest: string | null) => {
    uploadDest.current = dest;
    input.current?.click();
  };

  // ---------- 右键菜单 ----------
  /** 右键某一项：点在已选中的项上就作用于整个选择，否则只选中并作用于这一项（同 Finder） */
  const openItemMenu = (e: MouseEvent, entry: FileEntry, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    let targets = [entry];
    if (dir === path) {
      if (selected.has(entry.path) && selectedEntries.length) targets = selectedEntries;
      else {
        anchor.current = entry.path;
        setSelected(new Set([entry.path]));
      }
    }
    const single = targets.length === 1 ? targets[0] : null;
    const n = targets.length;
    const items: MenuItem[] = [];
    if (single?.isDir) {
      items.push({
        label: t("menu.open"),
        icon: <FolderOpen className="size-4" />,
        shortcut: "↵",
        onSelect: () => navigate(single.path),
      });
      if (canPaste) {
        items.push({
          label: t("menu.pasteInto", { name: single.name }),
          icon: <ClipboardPaste className="size-4" />,
          onSelect: () => void paste(single.path),
        });
      }
    }
    items.push(
      {
        label: n > 1 ? t("menu.downloadMany", { n }) : t("menu.download"),
        icon: <Download className="size-4" />,
        shortcut: single && !single.isDir ? "↵" : undefined,
        onSelect: () => void download(targets),
      },
      "sep",
      {
        label: t("menu.cut"),
        icon: <Scissors className="size-4" />,
        shortcut: `${MOD}X`,
        onSelect: () => toClip("cut", targets),
      },
      {
        label: t("menu.copy"),
        icon: <Copy className="size-4" />,
        shortcut: `${MOD}C`,
        onSelect: () => toClip("copy", targets),
      },
      {
        label: t("menu.copyPath"),
        icon: <Link className="size-4" />,
        onSelect: () => copyText(targets.map((x) => x.path).join("\n")),
      },
      "sep",
    );
    if (single)
      items.push({
        label: t("menu.rename"),
        icon: <Pencil className="size-4" />,
        shortcut: "F2",
        onSelect: () => askRename(single),
      });
    items.push({
      label: n > 1 ? t("menu.deleteMany", { n }) : t("menu.delete"),
      icon: <Trash2 className="size-4" />,
      shortcut: MOD === "⌘" ? "⌘⌫" : "Del",
      danger: true,
      onSelect: () => askDelete(targets),
    });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const openBookmarkMenu = (e: MouseEvent, b: Bookmark) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: t("menu.open"), icon: <FolderOpen className="size-4" />, onSelect: () => navigate(b.path) },
        { label: t("menu.copyPath"), icon: <Link className="size-4" />, onSelect: () => copyText(b.path) },
        "sep",
        { label: t("bookmark.edit"), icon: <Pencil className="size-4" />, onSelect: () => askBookmark(b) },
        {
          label: t("bookmark.delete"),
          icon: <Trash2 className="size-4" />,
          danger: true,
          onSelect: () =>
            setDialog({
              kind: "confirm",
              tone: "danger",
              icon: <Trash2 className="size-7" />,
              title: t("bookmark.deleteTitle", { name: bookmarkName(b, t) }),
              message: (
                <>
                  <p>{t(b.preset ? "bookmark.deletePresetMessage" : "bookmark.deleteMessage")}</p>
                  <p className="mt-2 font-mono text-xs text-muted">{b.path}</p>
                </>
              ),
              confirm: t("common.delete"),
              onSubmit: async () => setBookmarks((list) => list.filter((x) => x.id !== b.id)),
            }),
        },
      ],
    });
  };

  /** 右键空白处：dir 是这块空白所属的目录（分栏视图里可能是上层某一栏） */
  const openBackgroundMenu = (e: MouseEvent, dir: string) => {
    e.preventDefault();
    const n = clip?.entries.length ?? 0;
    const items: MenuItem[] = [
      { label: t("menu.newFolder"), icon: <FolderPlus className="size-4" />, onSelect: () => askMkdir(dir) },
      { label: t("menu.upload"), icon: <Upload className="size-4" />, onSelect: () => pickUpload(fileInput, dir) },
      {
        label: t("menu.uploadFolder"),
        icon: <FolderUp className="size-4" />,
        onSelect: () => pickUpload(folderInput, dir),
      },
      "sep",
      {
        label: canPaste && n > 1 ? t("menu.pasteN", { n }) : t("menu.paste"),
        icon: <ClipboardPaste className="size-4" />,
        shortcut: `${MOD}V`,
        disabled: !canPaste,
        onSelect: () => void paste(dir),
      },
      { label: t("menu.copyPath"), icon: <Link className="size-4" />, onSelect: () => copyText(dir) },
      "sep",
    ];
    if (dir === path) {
      items.push({
        label: t("menu.selectAll"),
        icon: <CheckCheck className="size-4" />,
        shortcut: `${MOD}A`,
        disabled: !selectable.length,
        onSelect: () => setSelected(new Set(selectable.map((v) => v.path))),
      });
    }
    items.push(
      { label: t("menu.refresh"), icon: <RotateCw className="size-4" />, onSelect: () => void reload(true) },
      {
        label: t("menu.showHidden"),
        icon: <Eye className="size-4" />,
        shortcut: `${MOD}⇧.`,
        checked: showHidden,
        onSelect: () => setShowHidden((v) => !v),
      },
      "sep",
      ...VIEWS.map(({ id, Icon }) => ({
        label: t(`view.${id}`),
        icon: <Icon className="size-4" />,
        checked: view === id,
        onSelect: () => setView(id),
      })),
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const closeMenu = useCallback(() => setMenu(null), []);

  /** 方向键选择上一项 / 下一项，并滚动到可见 */
  const step = useCallback(
    (delta: 1 | -1) => {
      if (!selectable.length) return;
      const cur =
        anchor.current && selected.has(anchor.current) ? selectable.findIndex((v) => v.path === anchor.current) : -1;
      const i =
        cur < 0 ? (delta > 0 ? 0 : selectable.length - 1) : Math.min(selectable.length - 1, Math.max(0, cur + delta));
      const p = selectable[i].path;
      anchor.current = p;
      setSelected(new Set([p]));
      document.querySelector(`[data-entry="${CSS.escape(p)}"]`)?.scrollIntoView({ block: "nearest" });
    },
    [selectable, selected],
  );

  // ---------- 快捷键 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || menu || (e.target as HTMLElement).closest("input, textarea")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") setSelected(new Set());
      // 同访达的 ⌘⇧. ，按 code 判断，Shift 下 key 是 ">"
      else if (mod && e.shiftKey && e.code === "Period") {
        e.preventDefault();
        setShowHidden((v) => !v);
      } else if (mod && e.key === "a") {
        e.preventDefault();
        setSelected(new Set(selectable.map((v) => v.path)));
      } else if (mod && (e.key === "c" || e.key === "x")) {
        // 页面上选中了文字时让浏览器正常复制
        if (!selectedEntries.length || window.getSelection()?.toString()) return;
        e.preventDefault();
        toClip(e.key === "x" ? "cut" : "copy", selectedEntries);
      } else if (mod && e.key === "v") {
        if (!canPaste) return;
        e.preventDefault();
        void paste(path);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      } else if (view === "gallery" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (view === "list" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const one = selectedEntries.length === 1 ? selectedEntries[0] : null;
        if (!one) return;
        e.preventDefault();
        if (e.key === "ArrowRight") {
          if (one.isDir) toggleExpand(one, true);
        } else if (one.isDir && expanded.has(one.path)) toggleExpand(one, false);
        else if (parentPath(one.path) !== path) {
          // 展开出来的子项：跳回它所在的文件夹
          const parent = parentPath(one.path);
          anchor.current = parent;
          setSelected(new Set([parent]));
          document.querySelector(`[data-entry="${CSS.escape(parent)}"]`)?.scrollIntoView({ block: "nearest" });
        }
      } else if (view === "columns" && e.key === "ArrowLeft") {
        e.preventDefault();
        if (path !== "/") navigate(parentPath(path), path);
      } else if (view === "columns" && e.key === "ArrowRight") {
        e.preventDefault();
        const one = selectedEntries.length === 1 ? selectedEntries[0] : null;
        if (!one?.isDir) return;
        // 同访达：空文件夹、打不开的文件夹进不去，焦点留在原处
        const sub = dirs.get(one.path);
        if (sub && (sub.error || !arrange(sub.entries ?? [], sort, showHidden).length)) return;
        navigate(one.path, true);
      } else if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) askDelete(selectedEntries);
      else if (e.key === "Enter" && selectedEntries.length === 1) open(selectedEntries[0]);
      else if (e.key === "F2" && selectedEntries.length === 1) askRename(selectedEntries[0]);
      else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) path !== "/" && navigate(parentPath(path));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    dialog,
    menu,
    selectable,
    selectedEntries,
    askDelete,
    askRename,
    open,
    navigate,
    path,
    view,
    canPaste,
    paste,
    toClip,
    step,
    expanded,
    toggleExpand,
    dirs,
    sort,
    showHidden,
  ]);

  // ---------- 拖拽上传 ----------
  const dragProps = online
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        },
        onDragLeave: () => {
          if (--dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDragging(false);
          }
        },
        onDrop: async (e: DragEvent) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          try {
            await upload(await collectDropped(e.dataTransfer));
          } catch (err) {
            flash(t("drop.readFailed", { error: (err as Error).message }));
          }
        },
      }
    : {};

  const hiddenCount = entries.length - entries.filter((e) => !e.name.startsWith(".")).length;

  return (
    <div className="min-h-dvh" {...dragProps}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        {/* 顶栏 */}
        <header className="mb-2 flex items-center justify-between gap-3 sm:mb-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-[50%] bg-accent text-on-accent shadow-lg shadow-accent/20">
              <FolderUp className="size-6" strokeWidth={2.4} />
            </span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <span className="truncate">{t("app.name")}</span>
                <AnimatePresence>
                  {rootMode && online && (
                    <motion.span
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 20 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      className="hidden shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-mono sm:inline text-xs font-semibold tracking-widest text-on-accent shadow-lg shadow-accent/30"
                    >
                      ROOT
                    </motion.span>
                  )}
                </AnimatePresence>
              </h1>
              <StorageMeter storage={storage} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {online && (
              <motion.button
                type="button"
                title={rootMode ? t("toolbar.rootOff") : t("toolbar.rootOn")}
                aria-label={rootMode ? t("toolbar.rootOff") : t("toolbar.rootOn")}
                aria-pressed={rootMode}
                whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={rootMode ? disableRoot : askEnableRoot}
                className={`grid size-12 place-items-center rounded-[50%] transition-colors ${
                  rootMode
                    ? "bg-red/15 text-red ring-2 ring-red/60 hover:bg-red hover:text-crust"
                    : "bg-surface0 text-accent hover:bg-surface1"
                }`}
              >
                {rootMode ? <ShieldAlert className="size-5" /> : <Shield className="size-5" />}
              </motion.button>
            )}
            <DeviceSelect devices={devices} serial={serial} onChange={(s) => setSerial(s)} />
            <LanguagePicker />
            <ThemePicker />
          </div>
        </header>

        {/* 主面板 */}
        <main className="relative rounded-[2.5rem] bg-mantle p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-surface0)_60%,transparent)] sm:p-5">
          <AnimatePresence mode="wait" initial={false}>
            {!online ? (
              <NoDevice key="none" devices={devices} adbError={adbError} />
            ) : (
              <motion.div
                key="browser"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={spring}
                className="flex flex-col gap-4"
              >
                {/* 按容器宽度分档：路径 @4xl 起并入工具行，显示方式 @2xl 起展开，筛选 @md 起并入工具行 */}
                <div className="@container flex flex-wrap items-center gap-2">
                  <IconButton
                    title={t("toolbar.up")}
                    disabled={path === "/"}
                    onClick={() => navigate(parentPath(path))}
                  >
                    <ArrowUp className="size-5" />
                  </IconButton>
                  <IconButton title={t("toolbar.refresh")} onClick={() => reload(true)}>
                    <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
                  </IconButton>
                  <div className="order-2 flex min-w-0 basis-full @4xl:order-none @4xl:basis-0 @4xl:flex-1">
                    <Breadcrumbs path={path} onNavigate={navigate} />
                  </div>
                  <label className="order-1 flex h-10 basis-full items-center gap-2 rounded-full bg-base px-4 text-subtext0 focus-within:ring-2 focus-within:ring-accent/60 @md:order-none @md:min-w-28 @md:flex-1 @md:basis-0 @4xl:w-48 @4xl:flex-none">
                    <Search className="size-4 shrink-0" />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder={t("toolbar.filter")}
                      className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted"
                    />
                    {filter && (
                      <button
                        type="button"
                        onClick={() => setFilter("")}
                        className="grid size-5 place-items-center rounded-[50%] hover:bg-surface0"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </label>
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <ViewSwitch view={view} onChange={setView} onMenu={setMenu} />
                    <IconButton title={t("toolbar.newFolder")} onClick={() => askMkdir()}>
                      <FolderPlus className="size-5" />
                    </IconButton>
                    <div className="flex shrink-0 rounded-full shadow-lg shadow-accent/15">
                      <motion.button
                        type="button"
                        title={t("toolbar.uploadFiles")}
                        aria-label={t("toolbar.uploadFiles")}
                        whileTap={{ scale: 0.94 }}
                        transition={spring}
                        onClick={() => pickUpload(fileInput, null)}
                        className="inline-flex h-10 items-center gap-2 rounded-l-full bg-accent pr-3 pl-3.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover @sm:pl-4"
                      >
                        <Upload className="size-4" />
                        <span className="hidden @sm:inline">{t("toolbar.upload")}</span>
                      </motion.button>
                      <motion.button
                        type="button"
                        title={t("toolbar.uploadMore")}
                        aria-label={t("toolbar.uploadMore")}
                        aria-haspopup="menu"
                        whileTap={{ scale: 0.94 }}
                        transition={spring}
                        onClick={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setMenu({
                            x: r.right,
                            y: r.bottom + 6,
                            align: "end",
                            items: [
                              {
                                label: t("toolbar.uploadFiles"),
                                icon: <Upload className="size-4" />,
                                onSelect: () => pickUpload(fileInput, null),
                              },
                              {
                                label: t("toolbar.uploadFolder"),
                                icon: <FolderUp className="size-4" />,
                                onSelect: () => pickUpload(folderInput, null),
                              },
                            ],
                          });
                        }}
                        className="grid h-10 w-9 place-items-center rounded-r-full border-l border-on-accent/20 bg-accent pr-1 text-on-accent transition-colors hover:bg-accent-hover"
                      >
                        <ChevronDown className="size-4" />
                      </motion.button>
                    </div>
                  </div>
                </div>

                <QuickLinks
                  path={path}
                  bookmarks={bookmarks}
                  onNavigate={navigate}
                  onAddBookmark={() => askBookmark()}
                  onBookmarkMenu={openBookmarkMenu}
                  onMenu={setMenu}
                />

                {/* 点空白处取消选择，右键空白处是当前目录的菜单 */}
                <div
                  className="min-h-[40vh]"
                  onClick={(e) => !(e.target as HTMLElement).closest("[data-entry], button") && setSelected(new Set())}
                  onContextMenu={(e) => openBackgroundMenu(e, path)}
                >
                  {view === "columns" && target ? (
                    <ColumnView
                      key={`${target.serial}:${target.root}`}
                      target={target}
                      path={path}
                      entries={visible}
                      dirs={dirs}
                      loading={loading && entriesDir !== path}
                      error={listError}
                      selected={selected}
                      cut={cutPaths}
                      sort={sort}
                      showHidden={showHidden}
                      onNavigate={navigate}
                      onSelect={onSelect}
                      onOpen={open}
                      onContextMenu={(e, entry, dir) =>
                        entry ? openItemMenu(e, entry, dir) : openBackgroundMenu(e, dir)
                      }
                      onDownload={(e) => download([e])}
                      onRename={askRename}
                      onDelete={(e) => askDelete([e])}
                    />
                  ) : view === "gallery" && target ? (
                    <GalleryView
                      target={target}
                      entries={visible}
                      loading={loading}
                      error={listError}
                      selected={selected}
                      cut={cutPaths}
                      focused={anchor.current}
                      onSelect={onSelect}
                      onFocus={(entry) => {
                        anchor.current = entry.path;
                        setSelected(new Set([entry.path]));
                      }}
                      onOpen={open}
                      onContextMenu={(e, entry) => openItemMenu(e, entry, path)}
                      onDownload={(e) => download([e])}
                      onRename={askRename}
                      onDelete={(e) => askDelete([e])}
                    />
                  ) : view === "icons" ? (
                    <IconGrid
                      dir={path}
                      entries={visible}
                      loading={loading}
                      error={listError}
                      selected={selected}
                      cut={cutPaths}
                      onSelect={onSelect}
                      onOpen={open}
                      onContextMenu={(e, entry) => openItemMenu(e, entry, path)}
                    />
                  ) : (
                    <FileList
                      dir={path}
                      onUp={path === "/" ? undefined : () => navigate(parentPath(path))}
                      rows={rows}
                      expanded={expanded}
                      pending={pending}
                      onToggleExpand={toggleExpand}
                      loading={loading}
                      error={listError}
                      selected={selected}
                      cut={cutPaths}
                      sort={sort}
                      onSort={(key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
                      onSelect={onSelect}
                      onToggle={onToggle}
                      onOpen={open}
                      onDownload={(e) => download([e])}
                      onRename={askRename}
                      onDelete={(e) => askDelete([e])}
                      onContextMenu={(e, entry) => openItemMenu(e, entry, path)}
                    />
                  )}
                </div>

                {/* 状态栏，同访达窗口底部：项目数和剩余空间 */}
                <footer className="-mb-1 flex min-h-8 flex-wrap items-center justify-between gap-x-4 border-t border-surface0 px-3 pt-3 text-xs text-subtext0">
                  <span className="flex items-center gap-2">
                    {entriesDir === path &&
                      (hiddenCount && !showHidden
                        ? t("toolbar.countHidden", { n: visible.length, hidden: hiddenCount })
                        : t("toolbar.count", { n: visible.length }))}
                    {(hiddenCount > 0 || showHidden) && (
                      <button
                        type="button"
                        aria-pressed={showHidden}
                        title={`${MOD}⇧.`}
                        onClick={() => setShowHidden((v) => !v)}
                        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-semibold transition-colors ${
                          showHidden
                            ? "bg-accent/15 text-accent hover:bg-accent/25"
                            : "hover:bg-surface0 hover:text-text"
                        }`}
                      >
                        {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        {showHidden ? t("toolbar.hideHidden") : t("toolbar.showHidden")}
                      </button>
                    )}
                  </span>
                  {storage && <span>{t("toolbar.free", { size: formatSize(storage.free) })}</span>}
                </footer>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                transition={spring}
                className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-[2.25rem] border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px]"
              >
                <div className="flex flex-col items-center gap-3">
                  <span className="grid size-20 place-items-center rounded-[50%] bg-accent text-on-accent shadow-xl shadow-accent/30">
                    <Upload className="size-9" />
                  </span>
                  <p className="rounded-full bg-crust/80 px-5 py-2 font-bold">
                    {rich(
                      "toolbar.dropHere",
                      { path: (s) => <span className="font-mono text-accent">{s}</span> },
                      { path },
                    )}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* 多选操作条 */}
      <AnimatePresence>
        {/* 画廊视图的信息面板里已经有单项操作，只选一项时不弹 */}
        {online && selectedEntries.length > (view === "gallery" ? 1 : 0) && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: 40, scale: 0.9, x: "-50%", transition: { duration: 0.18 } }}
            transition={spring}
            className="fixed bottom-4 left-1/2 z-30 flex items-center gap-2 rounded-full bg-surface0 p-1.5 pl-5 shadow-2xl shadow-crust ring-1 ring-surface1"
          >
            <span className="flex items-center text-sm font-bold whitespace-nowrap">
              {t("selection.selected")}
              <span className="relative mx-1 inline-flex h-5 min-w-5 justify-center overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={selectedEntries.length}
                    initial={{ y: 14, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -14, opacity: 0 }}
                    transition={spring}
                    className="font-mono text-accent"
                  >
                    {selectedEntries.length}
                  </motion.span>
                </AnimatePresence>
              </span>
              {t("selection.unit")}
            </span>
            <PillButton tone="accent" icon={<Download className="size-4" />} onClick={() => download(selectedEntries)}>
              {t("selection.download")}
            </PillButton>
            <PillButton tone="danger" icon={<Trash2 className="size-4" />} onClick={() => askDelete(selectedEntries)}>
              {t("selection.delete")}
            </PillButton>
            <IconButton tone="ghost" title={t("selection.cancel")} onClick={() => setSelected(new Set())}>
              <X className="size-5" />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      <TransferQueue items={transfers} onDismiss={(id) => setTransfers((l) => l.filter((t) => t.id !== id))}>
        {online && <UsageTip />}
      </TransferQueue>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg}
            initial={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
            animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
            exit={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
            transition={spring}
            className={`fixed top-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] rounded-full px-5 py-2.5 text-sm font-semibold shadow-xl ${
              toast.tone === "error"
                ? "bg-red text-crust shadow-red/30"
                : "bg-surface0 text-text shadow-crust ring-1 ring-surface1"
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menu && <ContextMenu key={`${menu.x},${menu.y}`} menu={menu} onClose={closeMenu} />}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {dialog && (
          <Dialog key={dialog.title} state={dialog} onClose={() => setDialog((d) => (d === dialog ? null : d))} />
        )}
      </AnimatePresence>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload(fromInput(e.target.files), uploadDest.current ?? path);
          uploadDest.current = null;
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          void upload(fromInput(e.target.files), uploadDest.current ?? path);
          uploadDest.current = null;
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StorageMeter({ storage }: { storage: { total: number; free: number } | null }) {
  const t = useT();
  const pct = storage ? ((storage.total - storage.free) / storage.total) * 100 : 0;
  const nearlyFull = pct > 90;
  return (
    <AnimatePresence initial={false}>
      {storage && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-xs text-subtext0"
          title={t("toolbar.free", { size: formatSize(storage.free) })}
        >
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface0">
            <motion.span
              className={`block h-full rounded-full transition-colors ${nearlyFull ? "bg-red" : "bg-accent"}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.3 }}
            />
          </span>
          <span className="font-mono whitespace-nowrap">
            {formatSize(storage.total - storage.free)} / {formatSize(storage.total)}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
