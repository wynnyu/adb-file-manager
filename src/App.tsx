import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { QuickLinks } from "./components/bookmarks/QuickLinks.tsx";
import { Header } from "./components/header/Header.tsx";
import { NoDevice } from "./components/NoDevice.tsx";
import { ContextMenu, type MenuState } from "./components/overlays/ContextMenu.tsx";
import { Dialog, type DialogState } from "./components/overlays/Dialog.tsx";
import { DropOverlay } from "./components/overlays/DropOverlay.tsx";
import { backgroundMenu, bookmarkMenu, itemMenu } from "./components/overlays/menus.tsx";
import { Toast } from "./components/overlays/Toast.tsx";
import { TransferQueue } from "./components/overlays/TransferQueue.tsx";
import { UsageTip } from "./components/overlays/UsageTip.tsx";
import { SelectionBar } from "./components/toolbar/SelectionBar.tsx";
import { StatusBar } from "./components/toolbar/StatusBar.tsx";
import { Toolbar } from "./components/toolbar/Toolbar.tsx";
import { UploadInputs } from "./components/UploadInputs.tsx";
import { spring } from "./components/ui.tsx";
import { ColumnView } from "./components/views/ColumnView.tsx";
import { FileList } from "./components/views/FileList.tsx";
import { GalleryView } from "./components/views/GalleryView.tsx";
import { IconGrid } from "./components/views/IconGrid.tsx";
import { useBookmarks } from "./hooks/useBookmarks.ts";
import { useClipboard } from "./hooks/useClipboard.ts";
import { useDevices, useStorage } from "./hooks/useDevices.ts";
import { useDirectory, useListings } from "./hooks/useDirectory.ts";
import { useDropUpload } from "./hooks/useDropUpload.ts";
import { useFileOps } from "./hooks/useFileOps.ts";
import { useRootMode } from "./hooks/useRootMode.ts";
import { useSelection, useSelectionActions } from "./hooks/useSelection.ts";
import { useShortcuts } from "./hooks/useShortcuts.ts";
import { useToast } from "./hooks/useToast.ts";
import { useTransfers } from "./hooks/useTransfers.ts";
import { useTree } from "./hooks/useTree.ts";
import { useUploadPicker } from "./hooks/useUploadPicker.ts";
import { useT } from "./i18n/index.tsx";
import type { Target } from "./lib/api.ts";
import type { Bookmark } from "./lib/bookmarks.ts";
import type { Sort, SortKey } from "./lib/entries.ts";
import { parentPath } from "./lib/format.ts";
import { usePref } from "./lib/prefs.ts";
import type { FileEntry, ViewMode } from "./types.ts";

export default function App() {
  const t = useT();
  const [view, setView] = usePref<ViewMode>("afm.view", "list");
  const [sort, setSort] = usePref<Sort>("afm.sort", { key: "name", asc: true });
  const [showHidden, setShowHidden] = usePref("afm.hidden", false);
  const toggleHidden = useCallback(() => setShowHidden((v) => !v), [setShowHidden]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const { toast, flash } = useToast();
  const { transfers, startTransfer, patchTransfer, dismissTransfer } = useTransfers();

  // ---------- 设备 ----------
  const { devices, adbError, serial, setSerial } = useDevices();
  const online = devices.find((d) => d.serial === serial)?.state === "device";
  const { storage, refreshStorage } = useStorage(serial, online);
  const { rootMode, askEnableRoot, disableRoot } = useRootMode({ serial, online, flash, openDialog: setDialog });
  const target = useMemo<Target | null>(() => (serial ? { serial, root: rootMode } : null), [serial, rootMode]);

  // ---------- 目录与选择 ----------
  const selection = useSelection();
  const { selected, anchor, selectOnly, clear } = selection;
  const { path, entries, ready, visible, loading, listError, filter, setFilter, navigate, reload, afterChange } =
    useDirectory({ target, online, sort, showHidden, selection });
  const { expanded, toggleExpand, rows, pending } = useTree({
    visible,
    sort,
    showHidden,
    path,
    target,
    online,
    active: view === "list",
  });

  /** 能选中、能用方向键走到的条目：列表视图包括展开的子项 */
  const selectable = useMemo(
    () => (view === "list" ? rows.flatMap((r) => ("entry" in r ? [r.entry] : [])) : visible),
    [view, rows, visible],
  );
  const { selectedEntries, onSelect, onToggle, selectAll, step } = useSelectionActions(selection, selectable);

  /** 分栏视图要另外加载的目录：上层各栏，加上选中文件夹的下一栏 */
  const columnDirs = useMemo(() => {
    if (view !== "columns") return [];
    const parts = path.split("/").filter(Boolean);
    const out = parts.map((_, i) => "/" + parts.slice(0, i).join("/"));
    const one = selectedEntries.length === 1 ? selectedEntries[0] : null;
    if (one?.isDir) out.push(one.path);
    return out;
  }, [view, path, selectedEntries]);
  const dirs = useListings(target, online, columnDirs);

  // ---------- 操作 ----------
  const { clip, setClip, canPaste, cutPaths, toClip, copyText } = useClipboard(serial, flash);
  const { bookmarks, askBookmark, askDeleteBookmark } = useBookmarks(path, setDialog);
  const { upload, download, paste, askDelete, askRename, askMkdir } = useFileOps({
    target,
    online,
    rootMode,
    path,
    clip,
    setClip,
    transfers: { startTransfer, patchTransfer },
    reload,
    afterChange,
    refreshStorage,
    openDialog: setDialog,
  });

  const open = useCallback(
    (entry: FileEntry) => (entry.isDir ? navigate(entry.path) : void download([entry])),
    [navigate, download],
  );

  const picker = useUploadPicker(upload);
  const onDropError = useCallback((err: Error) => flash(t("drop.readFailed", { error: err.message })), [flash, t]);
  const drop = useDropUpload(online, upload, onDropError);

  // ---------- 快捷键和右键菜单 ----------
  const actions = {
    t,
    blocked: !!dialog || !!menu,
    path,
    view,
    sort,
    showHidden,
    dirs,
    expanded,
    selectable,
    selectedEntries,
    canPaste,
    clipCount: clip?.entries.length ?? 0,
    clear,
    selectOnly,
    selectAll,
    step,
    toggleHidden,
    toggleExpand,
    setView,
    navigate,
    open,
    reload,
    paste,
    download,
    toClip,
    copyText,
    askRename,
    askDelete,
    askMkdir,
    askBookmark,
    askDeleteBookmark,
    pickUpload: picker.pick,
  };
  useShortcuts(actions);

  /** 右键某一项：点在已选中的项上就作用于整个选择，否则只选中并作用于这一项（同 Finder） */
  const openItemMenu = (e: MouseEvent, entry: FileEntry, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    let targets = [entry];
    if (dir === path) {
      if (selected.has(entry.path) && selectedEntries.length) targets = selectedEntries;
      else selectOnly(entry.path);
    }
    setMenu({ x: e.clientX, y: e.clientY, items: itemMenu(targets, actions) });
  };

  const openBackgroundMenu = (e: MouseEvent, dir: string) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: backgroundMenu(dir, actions) });
  };

  const openBookmarkMenu = (e: MouseEvent, b: Bookmark) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, items: bookmarkMenu(b, actions) });
  };

  return (
    <div className="min-h-dvh" {...drop.dragProps}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
        <Header
          online={online}
          rootMode={rootMode}
          onToggleRoot={rootMode ? disableRoot : askEnableRoot}
          storage={storage}
          devices={devices}
          serial={serial}
          onSerialChange={setSerial}
        />

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
                <Toolbar
                  path={path}
                  loading={loading}
                  filter={filter}
                  onFilterChange={setFilter}
                  view={view}
                  onViewChange={setView}
                  onNavigate={navigate}
                  onRefresh={() => reload(true)}
                  onMkdir={() => askMkdir()}
                  onUpload={(kind) => picker.pick(kind, null)}
                  onMenu={setMenu}
                />

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
                  onClick={(e) => !(e.target as HTMLElement).closest("[data-entry], button") && clear()}
                  onContextMenu={(e) => openBackgroundMenu(e, path)}
                >
                  {view === "columns" && target ? (
                    <ColumnView
                      key={`${target.serial}:${target.root}`}
                      target={target}
                      path={path}
                      entries={visible}
                      dirs={dirs}
                      loading={loading && !ready}
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
                      onFocus={(entry) => selectOnly(entry.path)}
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

                <StatusBar
                  entries={entries}
                  shown={visible.length}
                  ready={ready}
                  showHidden={showHidden}
                  onToggleHidden={toggleHidden}
                  storage={storage}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <DropOverlay show={drop.dragging} path={path} />
        </main>
      </div>

      <SelectionBar
        // 画廊视图的信息面板里已经有单项操作，只选一项时不弹
        show={online && selectedEntries.length > (view === "gallery" ? 1 : 0)}
        count={selectedEntries.length}
        onDownload={() => download(selectedEntries)}
        onDelete={() => askDelete(selectedEntries)}
        onClear={clear}
      />

      <TransferQueue items={transfers} onDismiss={dismissTransfer}>
        {online && <UsageTip />}
      </TransferQueue>

      <Toast toast={toast} />

      <AnimatePresence>
        {menu && <ContextMenu key={`${menu.x},${menu.y}`} menu={menu} onClose={closeMenu} />}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {dialog && (
          <Dialog key={dialog.title} state={dialog} onClose={() => setDialog((d) => (d === dialog ? null : d))} />
        )}
      </AnimatePresence>

      <UploadInputs {...picker.inputs} />
    </div>
  );
}
