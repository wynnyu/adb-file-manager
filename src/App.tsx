import {
  ArrowUp,
  Download,
  Eye,
  EyeOff,
  FolderPlus,
  FolderUp,
  Pencil,
  RotateCw,
  Search,
  Shield,
  ShieldAlert,
  Skull,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { api, onRootLost, type Target } from "./api.ts";
import { Breadcrumbs } from "./components/Breadcrumbs.tsx";
import { DeviceSelect } from "./components/DeviceSelect.tsx";
import { Dialog, type DialogState } from "./components/Dialog.tsx";
import { FileList, type Sort, type SortKey } from "./components/FileList.tsx";
import { NoDevice } from "./components/NoDevice.tsx";
import { QuickLinks } from "./components/QuickLinks.tsx";
import { TransferQueue } from "./components/TransferQueue.tsx";
import { IconButton, PillButton, spring } from "./components/ui.tsx";
import { collectDropped, fromInput, type UploadItem } from "./drop.ts";
import { formatSize, joinPath, parentPath } from "./format.ts";
import type { Device, FileEntry, Transfer } from "./types.ts";

const HOME = "/sdcard";

function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function savePref(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* 隐私模式等情况下忽略 */
  }
}

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [serial, setSerial] = useState<string | null>(null);
  const [path, setPath] = useState(() => loadPref("afm.path", HOME));
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [sort, setSort] = useState<Sort>(() => loadPref("afm.sort", { key: "name", asc: true }));
  const [showHidden, setShowHidden] = useState(() => loadPref("afm.hidden", false));
  const [filter, setFilter] = useState("");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rootMode, setRootMode] = useState(() => loadPref("afm.rootRemember", false));
  const rootVerified = useRef<string | null>(null);
  const [storage, setStorage] = useState<{ total: number; free: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
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
        setListError(null);
        if (!keepSelection) setSelected(new Set());
      } catch (e) {
        if (seq !== loadSeq.current) return;
        setEntries([]);
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
  useEffect(() => savePref("afm.sort", sort), [sort]);
  useEffect(() => savePref("afm.hidden", showHidden), [showHidden]);

  const navigate = useCallback((p: string) => {
    setFilter("");
    setEntries([]);
    setPath(p);
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = entries.filter(
      (e) => (showHidden || !e.name.startsWith(".")) && (!q || e.name.toLowerCase().includes(q)),
    );
    const dir = sort.asc ? 1 : -1;
    return list.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let r = 0;
      if (sort.key === "size") r = a.size - b.size;
      else if (sort.key === "mtime") r = a.mtime - b.mtime;
      if (r === 0) r = a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" });
      return r * dir;
    });
  }, [entries, filter, showHidden, sort]);

  // ---------- 提示 & 传输队列 ----------
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4000);
  }, []);

  useEffect(() => {
    if (!rootMode || !online || !serial || rootVerified.current === serial) return;
    api.rootCheck(serial).then(
      () => (rootVerified.current = serial),
      (e: Error) => {
        rootVerified.current = null;
        setRootMode(false);
        flash(`已退出 root 模式：${e.message}`);
      },
    );
  }, [rootMode, online, serial, flash]);

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
    async (items: UploadItem[]) => {
      if (!target || !online || !items.length) return;
      const dest = path;
      const tops = new Set(items.map((i) => i.path.split("/")[0]));
      const label = tops.size === 1 ? [...tops][0] : `${[...tops][0]} 等 ${tops.size} 项`;
      const id = startTransfer({ kind: "upload", label, status: "uploading", progress: 0 });
      try {
        await api.upload(target, dest, items, (p) =>
          patchTransfer(id, p >= 1 ? { status: "pushing", progress: undefined } : { progress: p }),
        );
        patchTransfer(id, { status: "done" });
        refreshStorage();
        if (dest === path) void load(dest, true);
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
      }
    },
    [target, online, path, load, startTransfer, patchTransfer, refreshStorage],
  );

  const download = useCallback(
    async (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const label = targets.length === 1 ? targets[0].name : `${targets[0].name} 等 ${targets.length} 项`;
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
    [target, startTransfer, patchTransfer],
  );

  const askDelete = useCallback(
    (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const doDelete = async () => {
        await api.remove(
          target,
          targets.map((t) => t.path),
        );
        refreshStorage();
        await load(path);
      };
      const what = targets.length === 1 ? `「${targets[0].name}」` : ` ${targets.length} 项`;
      // root 模式：第二层确认，列出完整路径并倒计时
      const finalStep: DialogState = {
        kind: "confirm",
        tone: "danger",
        icon: <Skull className="size-7" />,
        title: "最后确认",
        countdown: 3,
        confirm: "确认删除",
        message: (
          <div className="flex flex-col items-center gap-3">
            <p>
              正在以 <b className="text-red">root</b> 权限删除，系统文件和应用数据也会被删除，无法恢复。
            </p>
            <ul className="flex w-full flex-col gap-1">
              {targets.slice(0, 4).map((t) => (
                <li key={t.path} className="truncate rounded-full bg-red/10 px-4 py-1.5 font-mono text-xs text-red">
                  {t.path}
                </li>
              ))}
              {targets.length > 4 && <li className="text-xs text-overlay1">…以及另外 {targets.length - 4} 项</li>}
            </ul>
          </div>
        ),
        onSubmit: doDelete,
      };
      setDialog({
        kind: "confirm",
        tone: "danger",
        icon: <Trash2 className="size-7" />,
        title: rootMode ? `以 root 权限删除${what}？` : `删除${what}？`,
        message: "将永久删除，无法恢复。",
        confirm: rootMode ? "继续" : "删除",
        onSubmit: rootMode ? async () => setDialog(finalStep) : doDelete,
      });
    },
    [target, rootMode, path, load, refreshStorage],
  );

  // ---------- root 模式 ----------
  const askEnableRoot = useCallback(() => {
    if (!serial) return;
    setDialog({
      kind: "confirm",
      tone: "warn",
      icon: <ShieldAlert className="size-7" />,
      title: "开启 root 模式？",
      message: (
        <p>
          之后所有操作都会通过 <code className="rounded-full bg-crust px-2 py-0.5 font-mono text-peach">su</code> 以 root
          身份执行，可以读写系统分区和应用数据。误删或误改可能导致应用异常甚至无法开机。
        </p>
      ),
      checkbox: "记住选择，下次自动开启",
      confirm: "开启",
      onSubmit: async (remember) => {
        await api.rootCheck(serial);
        rootVerified.current = serial;
        savePref("afm.rootRemember", remember);
        setRootMode(true);
      },
    });
  }, [serial]);

  const disableRoot = useCallback(() => {
    rootVerified.current = null;
    savePref("afm.rootRemember", false);
    setRootMode(false);
  }, []);

  // 操作途中 root 被撤销：退出 root 模式，但保留「记住选择」，重新授权后下次还能自动开启
  useEffect(() => {
    onRootLost((message) => {
      rootVerified.current = null;
      setRootMode(false);
      flash(`已退出 root 模式：${message}`);
    });
    return () => onRootLost(() => {});
  }, [flash]);

  useEffect(() => {
    document.title = rootMode ? "⚠ ROOT · ADB File Manager" : "ADB File Manager";
  }, [rootMode]);

  const askRename = useCallback(
    (entry: FileEntry) => {
      if (!target) return;
      setDialog({
        kind: "prompt",
        icon: <Pencil className="size-7" />,
        title: "重命名",
        initial: entry.name,
        confirm: "确定",
        onSubmit: async (name) => {
          if (name.includes("/")) throw new Error("名称不能包含 /");
          if (name === entry.name) return;
          await api.rename(target, entry.path, joinPath(parentPath(entry.path), name));
          await load(path);
        },
      });
    },
    [target, path, load],
  );

  const askMkdir = useCallback(() => {
    if (!target) return;
    setDialog({
      kind: "prompt",
      icon: <FolderPlus className="size-7" />,
      title: "新建文件夹",
      initial: "新建文件夹",
      confirm: "创建",
      onSubmit: async (name) => {
        if (name.includes("/")) throw new Error("名称不能包含 /");
        await api.mkdir(target, joinPath(path, name));
        await load(path);
      },
    });
  }, [target, path, load]);

  const open = useCallback(
    (entry: FileEntry) => (entry.isDir ? navigate(entry.path) : void download([entry])),
    [navigate, download],
  );

  // ---------- 选择 ----------
  const onSelect = useCallback(
    (entry: FileEntry, e: MouseEvent) => {
      if (e.shiftKey && anchor.current) {
        const a = visible.findIndex((v) => v.path === anchor.current);
        const b = visible.findIndex((v) => v.path === entry.path);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelected(new Set(visible.slice(lo, hi + 1).map((v) => v.path)));
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
    [visible],
  );

  const onToggle = useCallback((entry: FileEntry) => {
    anchor.current = entry.path;
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(entry.path)) n.add(entry.path);
      return n;
    });
  }, []);

  const selectedEntries = useMemo(() => visible.filter((v) => selected.has(v.path)), [visible, selected]);

  // ---------- 快捷键 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog || (e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") setSelected(new Set());
      else if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault();
        setSelected(new Set(visible.map((v) => v.path)));
      } else if (e.key === "Delete" || (e.metaKey && e.key === "Backspace")) askDelete(selectedEntries);
      else if (e.key === "Enter" && selectedEntries.length === 1) open(selectedEntries[0]);
      else if (e.key === "F2" && selectedEntries.length === 1) askRename(selectedEntries[0]);
      else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) path !== "/" && navigate(parentPath(path));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, visible, selectedEntries, askDelete, askRename, open, navigate, path]);

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
            flash(`读取拖入的文件失败：${(err as Error).message}`);
          }
        },
      }
    : {};

  const hiddenCount = entries.length - entries.filter((e) => !e.name.startsWith(".")).length;

  return (
    <div className="min-h-dvh" {...dragProps}>
      <AnimatePresence>{online && rootMode && <RootBanner onExit={disableRoot} />}</AnimatePresence>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        {/* 顶栏 */}
        <header className="flex items-center justify-between gap-3">
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
            className="flex min-w-0 items-center gap-3"
          >
            <motion.span
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              whileHover={{ rotate: 18, scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
              className={`grid size-12 shrink-0 place-items-center rounded-[50%] bg-gradient-to-br text-crust shadow-lg transition-[--tw-gradient-from,--tw-gradient-to,box-shadow] duration-500 ${
                rootMode && online ? "from-red to-peach shadow-red/30" : "from-mauve to-pink shadow-mauve/20"
              }`}
            >
              <FolderUp className="size-6" strokeWidth={2.4} />
            </motion.span>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <span className="truncate">ADB File Manager</span>
                <AnimatePresence>
                  {rootMode && online && (
                    <motion.span
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 20 }}
                      transition={{ type: "spring", stiffness: 500, damping: 15 }}
                      className="hidden shrink-0 rounded-full bg-red px-2.5 py-0.5 font-mono sm:inline text-xs font-semibold tracking-widest text-crust shadow-lg shadow-red/40"
                    >
                      ROOT
                    </motion.span>
                  )}
                </AnimatePresence>
              </h1>
              <StorageMeter storage={storage} />
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.05 }}>
            <DeviceSelect devices={devices} serial={serial} onChange={(s) => setSerial(s)} />
          </motion.div>
        </header>

        {/* 主面板 */}
        <motion.main
          layout
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.08, layout: { type: "spring", stiffness: 300, damping: 32 } }}
          className={`relative rounded-[2.5rem] bg-mantle p-3 transition-[box-shadow] duration-500 sm:p-5 ${
            rootMode && online
              ? "shadow-[0_0_0_2px_var(--color-red),0_0_60px_-12px_var(--color-red)]"
              : "shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-surface0)_60%,transparent)]"
          }`}
        >
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
              <div className="flex flex-wrap items-center gap-2">
                <IconButton title="上一级 (Backspace)" disabled={path === "/"} onClick={() => navigate(parentPath(path))}>
                  <ArrowUp className="size-5" />
                </IconButton>
                <IconButton title="刷新" onClick={() => load(path, true)}>
                  <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
                </IconButton>
                <div className="order-last flex min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
                  <Breadcrumbs path={path} onNavigate={navigate} />
                </div>
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-base px-4 text-subtext0 focus-within:ring-2 focus-within:ring-mauve/60 md:w-48 md:flex-none">
                  <Search className="size-4 shrink-0" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="筛选"
                    className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-overlay0"
                  />
                  {filter && (
                    <button type="button" onClick={() => setFilter("")} className="grid size-5 place-items-center rounded-[50%] hover:bg-surface0">
                      <X className="size-3.5" />
                    </button>
                  )}
                </label>
                <IconButton
                  title={showHidden ? "隐藏点开头的文件" : `显示隐藏文件${hiddenCount ? `（${hiddenCount}）` : ""}`}
                  tone={showHidden ? "accent" : "default"}
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                </IconButton>
                <IconButton
                  title={rootMode ? "退出 root 模式" : "开启 root 模式"}
                  tone={rootMode ? "danger" : "default"}
                  className={rootMode ? "ring-2 ring-red/60" : ""}
                  onClick={rootMode ? disableRoot : askEnableRoot}
                >
                  {rootMode ? <ShieldAlert className="size-5" /> : <Shield className="size-5" />}
                </IconButton>
                <IconButton title="新建文件夹" onClick={askMkdir}>
                  <FolderPlus className="size-5" />
                </IconButton>
                <IconButton title="上传文件夹" onClick={() => folderInput.current?.click()}>
                  <FolderUp className="size-5" />
                </IconButton>
                <PillButton tone="accent" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
                  上传
                </PillButton>
              </div>

              <QuickLinks path={path} onNavigate={navigate} />

              <FileList
                dir={path}
                onUp={path === "/" ? undefined : () => navigate(parentPath(path))}
                entries={visible}
                loading={loading}
                error={listError}
                selected={selected}
                sort={sort}
                onSort={(key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
                onSelect={onSelect}
                onToggle={onToggle}
                onOpen={open}
                onDownload={(e) => download([e])}
                onRename={askRename}
                onDelete={(e) => askDelete([e])}
              />

              <p className="px-3 pt-2 text-center text-xs text-overlay0">
                {visible.length} 项 · 双击打开 · 拖拽文件或文件夹到窗口即可上传到当前目录
              </p>
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
                className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-[2.25rem] border-2 border-dashed border-mauve bg-mauve/10 backdrop-blur-[2px]"
              >
                <div className="flex flex-col items-center gap-3">
                  <motion.span
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                    className="grid size-20 place-items-center rounded-[50%] bg-mauve text-crust shadow-xl shadow-mauve/30"
                  >
                    <Upload className="size-9" />
                  </motion.span>
                  <p className="rounded-full bg-crust/80 px-5 py-2 font-bold">
                    松手上传到 <span className="font-mono text-mauve">{path}</span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.main>
      </div>

      {/* 多选操作条 */}
      <AnimatePresence>
      {online && selectedEntries.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.9, x: "-50%" }}
          animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
          exit={{ opacity: 0, y: 40, scale: 0.9, x: "-50%", transition: { duration: 0.18 } }}
          transition={spring}
          className="fixed bottom-4 left-1/2 z-30 flex items-center gap-2 rounded-full bg-surface0 p-1.5 pl-5 shadow-2xl shadow-crust ring-1 ring-surface1"
        >
          <span className="flex items-center text-sm font-bold whitespace-nowrap">
            已选
            <span className="relative mx-1 inline-flex h-5 min-w-5 justify-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={selectedEntries.length}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={spring}
                  className="font-mono text-mauve"
                >
                  {selectedEntries.length}
                </motion.span>
              </AnimatePresence>
            </span>
            项
          </span>
          <PillButton tone="accent" icon={<Download className="size-4" />} onClick={() => download(selectedEntries)}>
            下载
          </PillButton>
          <PillButton tone="danger" icon={<Trash2 className="size-4" />} onClick={() => askDelete(selectedEntries)}>
            删除
          </PillButton>
          <IconButton tone="ghost" title="取消选择 (Esc)" onClick={() => setSelected(new Set())}>
            <X className="size-5" />
          </IconButton>
        </motion.div>
      )}
      </AnimatePresence>

      <TransferQueue items={transfers} onDismiss={(id) => setTransfers((l) => l.filter((t) => t.id !== id))} />

      <AnimatePresence>
      {toast && (
        <motion.div
          key={toast}
          initial={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
          transition={spring}
          className="fixed top-4 left-1/2 z-50 rounded-full bg-red/20 px-5 py-2.5 text-sm font-semibold text-red shadow-xl ring-1 ring-red/30 backdrop-blur">
          {toast}
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {dialog && <Dialog key={dialog.title} state={dialog} onClose={() => setDialog((d) => (d === dialog ? null : d))} />}
      </AnimatePresence>

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void upload(fromInput(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        {...{ webkitdirectory: "" }}
        onChange={(e) => {
          void upload(fromInput(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function StorageMeter({ storage }: { storage: { total: number; free: number } | null }) {
  return (
    <AnimatePresence initial={false}>
      {storage && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-xs text-subtext0"
          title={`可用 ${formatSize(storage.free)}`}
        >
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface0">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-mauve to-pink"
              initial={{ width: 0 }}
              animate={{ width: `${((storage.total - storage.free) / storage.total) * 100}%` }}
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

function RootBanner({ onExit }: { onExit: () => void }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="sticky top-0 z-40 overflow-hidden"
    >
      <div className="root-stripes flex items-center justify-center gap-3 px-4 py-2 text-crust">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-[50%] bg-crust opacity-60" />
          <span className="relative size-2.5 rounded-[50%] bg-crust" />
        </span>
        <ShieldAlert className="size-4 shrink-0" strokeWidth={2.6} />
        <span className="truncate text-sm font-bold">
          <span className="font-mono tracking-wider">ROOT</span> 模式
          <span className="hidden sm:inline"> · 所有操作都以 root 身份执行，请谨慎操作</span>
        </span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={onExit}
          className="shrink-0 rounded-full bg-crust/85 px-3 py-1 text-xs font-bold text-red transition-colors hover:bg-crust"
        >
          退出
        </motion.button>
      </div>
    </motion.div>
  );
}
