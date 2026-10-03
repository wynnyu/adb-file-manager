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
import { ThemePicker } from "./components/ThemePicker.tsx";
import { TransferQueue } from "./components/TransferQueue.tsx";
import { LanguagePicker } from "./components/LanguagePicker.tsx";
import { IconButton, PillButton, spring } from "./components/ui.tsx";
import { collectDropped, fromInput, type UploadItem } from "./drop.ts";
import { formatSize, joinPath, parentPath } from "./format.ts";
import { useI18n, useT } from "./i18n/index.tsx";
import { loadPref, savePref } from "./prefs.ts";
import type { Device, FileEntry, Transfer } from "./types.ts";

const HOME = "/sdcard";

export default function App() {
  const { t, rich } = useI18n();
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

  const navigate = useCallback(
    (p: string) => {
      setFilter("");
      // 点的是当前目录：path 不变不会触发加载 effect，直接刷新，别清空列表
      if (p === path) return void load(p);
      setEntries([]);
      setPath(p);
    },
    [path, load],
  );

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
    async (items: UploadItem[]) => {
      if (!target || !online || !items.length) return;
      const dest = path;
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
        if (dest === path) void load(dest, true);
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
      }
    },
    [target, online, path, load, startTransfer, patchTransfer, refreshStorage, t],
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
        await load(path);
      };
      // root 模式：第二层确认，列出完整路径并倒计时
      const finalStep: DialogState = {
        kind: "confirm",
        tone: "danger",
        icon: <Skull className="size-7" />,
        title: t("delete.final.title"),
        countdown: 3,
        confirm: t("delete.final.confirm"),
        message: (
          <div className="flex flex-col items-center gap-3">
            <p>{rich("delete.final.message", { b: (s) => <b className="text-red">{s}</b> })}</p>
            <ul className="flex w-full flex-col gap-1">
              {targets.slice(0, 4).map((t) => (
                <li key={t.path} className="truncate rounded-full bg-red/10 px-4 py-1.5 font-mono text-xs text-red">
                  {t.path}
                </li>
              ))}
              {targets.length > 4 && <li className="text-xs text-overlay1">{t("common.moreItems", { n: targets.length - 4 })}</li>}
            </ul>
          </div>
        ),
        onSubmit: doDelete,
      };
      setDialog({
        kind: "confirm",
        tone: "danger",
        icon: <Trash2 className="size-7" />,
        title: t(
          single
            ? rootMode
              ? "delete.titleRoot"
              : "delete.title"
            : rootMode
              ? "delete.titleRootMany"
              : "delete.titleMany",
          { name: targets[0].name, n: targets.length },
        ),
        message: t("delete.message"),
        confirm: rootMode ? t("delete.continue") : t("common.delete"),
        onSubmit: rootMode ? async () => setDialog(finalStep) : doDelete,
      });
    },
    [target, rootMode, path, load, refreshStorage, t, rich],
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

  // 操作途中 root 被撤销：退出 root 模式，但保留「记住选择」，重新授权后下次还能自动开启
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
          await api.rename(target, entry.path, joinPath(parentPath(entry.path), name));
          await load(path);
        },
      });
    },
    [target, path, load, t],
  );

  const askMkdir = useCallback(() => {
    if (!target) return;
    setDialog({
      kind: "prompt",
      icon: <FolderPlus className="size-7" />,
      title: t("mkdir.title"),
      initial: t("mkdir.initial"),
      confirm: t("mkdir.confirm"),
      onSubmit: async (name) => {
        if (name.includes("/")) throw new Error(t("name.noSlash"));
        await api.mkdir(target, joinPath(path, name));
        await load(path);
      },
    });
  }, [target, path, load, t]);

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
                rootMode && online ? "from-red to-peach shadow-red/30" : "from-accent to-accent-2 shadow-accent/20"
              }`}
            >
              <FolderUp className="size-6" strokeWidth={2.4} />
            </motion.span>
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
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring, delay: 0.05 }}
            className="flex shrink-0 items-center gap-2"
          >
            <DeviceSelect devices={devices} serial={serial} onChange={(s) => setSerial(s)} />
            <LanguagePicker />
            <ThemePicker />
          </motion.div>
        </header>

        {/* 主面板 */}
        {/* 不要给主面板加 layout：高度变化时会用 scale 过渡，把工具栏和列表整个拉伸变形 */}
        <motion.main
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...spring, delay: 0.08 }}
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
                <IconButton title={t("toolbar.up")} disabled={path === "/"} onClick={() => navigate(parentPath(path))}>
                  <ArrowUp className="size-5" />
                </IconButton>
                <IconButton title={t("toolbar.refresh")} onClick={() => load(path, true)}>
                  <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
                </IconButton>
                <div className="order-last flex min-w-0 basis-full md:order-none md:basis-0 md:flex-1">
                  <Breadcrumbs path={path} onNavigate={navigate} />
                </div>
                <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-base px-4 text-subtext0 focus-within:ring-2 focus-within:ring-accent/60 md:w-48 md:flex-none">
                  <Search className="size-4 shrink-0" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t("toolbar.filter")}
                    className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-overlay0"
                  />
                  {filter && (
                    <button type="button" onClick={() => setFilter("")} className="grid size-5 place-items-center rounded-[50%] hover:bg-surface0">
                      <X className="size-3.5" />
                    </button>
                  )}
                </label>
                <IconButton
                  title={
                    showHidden
                      ? t("toolbar.hideHidden")
                      : hiddenCount
                        ? t("toolbar.showHiddenCount", { n: hiddenCount })
                        : t("toolbar.showHidden")
                  }
                  tone={showHidden ? "accent" : "default"}
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
                </IconButton>
                <IconButton
                  title={rootMode ? t("toolbar.rootOff") : t("toolbar.rootOn")}
                  tone={rootMode ? "danger" : "default"}
                  className={rootMode ? "ring-2 ring-red/60" : ""}
                  onClick={rootMode ? disableRoot : askEnableRoot}
                >
                  {rootMode ? <ShieldAlert className="size-5" /> : <Shield className="size-5" />}
                </IconButton>
                <IconButton title={t("toolbar.newFolder")} onClick={askMkdir}>
                  <FolderPlus className="size-5" />
                </IconButton>
                <IconButton title={t("toolbar.uploadFolder")} onClick={() => folderInput.current?.click()}>
                  <FolderUp className="size-5" />
                </IconButton>
                <PillButton tone="accent" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
                  {t("toolbar.upload")}
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
                {t("toolbar.hint", { n: visible.length })}
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
                className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-[2.25rem] border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px]"
              >
                <div className="flex flex-col items-center gap-3">
                  <motion.span
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
                    className="grid size-20 place-items-center rounded-[50%] bg-accent text-crust shadow-xl shadow-accent/30"
                  >
                    <Upload className="size-9" />
                  </motion.span>
                  <p className="rounded-full bg-crust/80 px-5 py-2 font-bold">
                    {rich("toolbar.dropHere", { path: (s) => <span className="font-mono text-accent">{s}</span> }, { path })}
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
  const t = useT();
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
              className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
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
