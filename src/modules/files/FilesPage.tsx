import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, useCallback, useMemo, useState } from "react";
import { NoDevice } from "../../components/NoDevice.tsx";
import { ContextMenu, type MenuState } from "../../components/overlays/index.ts";
import { ShellLayout } from "../../components/shell/index.ts";
import { spring } from "../../components/ui.tsx";
import { useShell } from "../../hooks/index.ts";
import { useT } from "../../i18n/index.tsx";
import { parentPath, usePref } from "../../lib/index.ts";
import type { FileEntry } from "../../types.ts";
import { QuickLinks } from "./components/bookmarks/index.ts";
import { backgroundMenu, bookmarkMenu, DropOverlay, itemMenu, Properties } from "./components/overlays/index.ts";
import { SelectionBar, StatusBar, Toolbar } from "./components/toolbar/index.ts";
import { UploadInputs } from "./components/UploadInputs.tsx";
import { Viewer } from "./components/viewer/index.ts";
import { ColumnView, FileList, GalleryView, IconGrid } from "./components/views/index.ts";
import {
  useBookmarks,
  useClipboard,
  useDirectory,
  useDropUpload,
  useFileOps,
  useListings,
  useMediaPlayer,
  useProperties,
  useSelection,
  useSelectionActions,
  useShortcuts,
  useTree,
  useUploadPicker,
  useViewer,
} from "./hooks/index.ts";
import type { Bookmark, Sort, SortKey } from "./lib/index.ts";
import type { ViewMode } from "./types.ts";

export function FilesPage() {
  const t = useT();
  const [view, setView] = usePref<ViewMode>("afm.view", "list");
  const [sort, setSort] = usePref<Sort>("afm.sort", { key: "name", asc: true });
  const [showHidden, setShowHidden] = usePref("afm.hidden", false);
  const toggleHidden = useCallback(() => setShowHidden((v) => !v), [setShowHidden]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // ---------- 设备 ----------
  const shell = useShell();
  const { devices, adbError, serial, online, storage, refreshStorage, rootMode, target, flash, openDialog } = shell;
  const { startTransfer, patchTransfer } = shell;

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
  const { bookmarks, askBookmark, askDeleteBookmark } = useBookmarks(path, openDialog);
  const { upload, download, paste, extract, compress, askDelete, askRename, askMkdir } = useFileOps({
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
    openDialog,
  });

  const { propertiesEntries, askProperties, askDirProperties, closeProperties } = useProperties();

  const viewer = useViewer({ selectable, selectOnly, target, online });
  const { openFile } = viewer;
  const media = useMediaPlayer(viewer.entry?.path ?? null);
  const open = useCallback(
    (entry: FileEntry) => (entry.isDir ? navigate(entry.path) : openFile(entry)),
    [navigate, openFile],
  );

  const picker = useUploadPicker(upload);
  const onDropError = useCallback((err: Error) => flash(t("drop.readFailed", { error: err.message })), [flash, t]);
  const drop = useDropUpload(online, upload, onDropError);

  // ---------- 快捷键和右键菜单 ----------
  const actions = {
    t,
    blocked: !!shell.dialog || !!menu || !!viewer.entry || !!propertiesEntries,
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
    extract,
    compress,
    download,
    toClip,
    copyText,
    askRename,
    askDelete,
    askMkdir,
    askProperties,
    askDirProperties,
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
    <ShellLayout
      dropProps={drop.dragProps}
      panelOverlay={<DropOverlay show={drop.dragging} path={path} />}
      overlays={
        <>
          <SelectionBar
            // 画廊视图的信息面板里已经有单项操作，只选一项时不弹
            show={online && selectedEntries.length > (view === "gallery" ? 1 : 0)}
            count={selectedEntries.length}
            onDownload={() => download(selectedEntries)}
            onCompress={() => compress(selectedEntries, "zip")}
            onDelete={() => askDelete(selectedEntries)}
            onClear={clear}
          />

          {/* 放在传输队列之前：同一层级时，查看器里点下载后进度显示在查看器上面 */}
          <AnimatePresence>
            {viewer.entry && target && (
              <Viewer
                target={target}
                entry={viewer.entry}
                index={viewer.index}
                count={viewer.count}
                hasPrev={viewer.hasPrev}
                hasNext={viewer.hasNext}
                media={media}
                onStep={viewer.step}
                onClose={viewer.close}
                onDownload={(e) => void download([e])}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {menu && <ContextMenu key={`${menu.x},${menu.y}`} menu={menu} onClose={closeMenu} />}
          </AnimatePresence>

          <AnimatePresence>
            {propertiesEntries && target && (
              <Properties
                entries={propertiesEntries}
                target={target}
                onClose={closeProperties}
                onNavigate={navigate}
                onCopy={copyText}
                flash={flash}
              />
            )}
          </AnimatePresence>

          <UploadInputs {...picker.inputs} />
        </>
      }
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
                  onContextMenu={(e, entry, dir) => (entry ? openItemMenu(e, entry, dir) : openBackgroundMenu(e, dir))}
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
    </ShellLayout>
  );
}
