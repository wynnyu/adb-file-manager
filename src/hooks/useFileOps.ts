import { FolderPlus, Pencil, Skull, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type { DialogState } from "../components/overlays/Dialog.tsx";
import { useT } from "../i18n/index.tsx";
import type { T } from "../i18n/translate.ts";
import { api, type Target } from "../lib/api.ts";
import type { UploadItem } from "../lib/drop.ts";
import { joinPath, parentPath } from "../lib/format.ts";
import { loadPref, savePref } from "../lib/prefs.ts";
import type { Clip, FileEntry } from "../types.ts";
import type { Directory } from "./useDirectory.ts";
import type { Transfers } from "./useTransfers.ts";

/** 内部存储、SD 卡和 /data/local/tmp 里的内容普通 shell 用户就能删，root 模式下删除这些不额外警告 */
const SHELL_WRITABLE = [
  /^\/sdcard\/./,
  /^\/mnt\/sdcard\/./,
  /^\/storage\/(emulated\/\d+|self\/primary|[0-9A-F]{4}-[0-9A-F]{4})\/./i,
  /^\/data\/local\/tmp\/./,
];
const needsRoot = (p: string) => !SHELL_WRITABLE.some((re) => re.test(p));

/** 传输队列里显示的名称：单项为其名称，多项为“某某等 n 项” */
const batchLabel = (names: string[], t: T) =>
  names.length === 1 ? names[0] : t("common.itemsEtc", { name: names[0], n: names.length, rest: names.length - 1 });

/** 对设备上文件的操作：上传、下载、粘贴，以及删除、重命名、新建文件夹的对话框 */
export function useFileOps({
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
}: {
  target: Target | null;
  online: boolean;
  rootMode: boolean;
  path: string;
  clip: Clip | null;
  setClip: (c: Clip | null) => void;
  transfers: Pick<Transfers, "startTransfer" | "patchTransfer">;
  reload: Directory["reload"];
  afterChange: Directory["afterChange"];
  refreshStorage: () => void;
  openDialog: (d: DialogState) => void;
}) {
  const t = useT();

  const upload = useCallback(
    async (items: UploadItem[], dest = path) => {
      if (!target || !online || !items.length) return;
      const tops = new Set(items.map((i) => i.path.split("/")[0]));
      const id = startTransfer({ kind: "upload", label: batchLabel([...tops], t), status: "uploading", progress: 0 });
      try {
        await api.upload(target, dest, items, (p) =>
          patchTransfer(id, p >= 1 ? { status: "pushing", progress: undefined } : { progress: p }),
        );
        patchTransfer(id, { status: "done" });
        refreshStorage();
        void reload(true);
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
        // 多项时可能已经推送了一部分
        refreshStorage();
        void reload(true);
      }
    },
    [target, online, path, reload, startTransfer, patchTransfer, refreshStorage, t],
  );

  const download = useCallback(
    async (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const label = batchLabel(
        targets.map((x) => x.name),
        t,
      );
      const id = startTransfer({ kind: "download", label, status: "pulling" });
      try {
        await api.download(
          target,
          targets.map((x) => x.path),
        );
        patchTransfer(id, { status: "done" });
      } catch (e) {
        patchTransfer(id, { status: "error", error: (e as Error).message });
      }
    },
    [target, startTransfer, patchTransfer, t],
  );

  const paste = useCallback(
    async (dest: string) => {
      if (!target || !clip || clip.serial !== target.serial) return;
      const { mode, entries: items } = clip;
      const label = batchLabel(
        items.map((i) => i.name),
        t,
      );
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
    [target, clip, setClip, t, startTransfer, patchTransfer, refreshStorage, afterChange, reload],
  );

  const askDelete = useCallback(
    (targets: FileEntry[]) => {
      if (!target || !targets.length) return;
      const single = targets.length === 1;
      const doDelete = async () => {
        try {
          await api.remove(
            target,
            targets.map((x) => x.path),
          );
        } catch (e) {
          // rm 一次删多项，其中一项失败时其余的可能已经删掉了
          refreshStorage();
          void reload(true);
          throw e;
        }
        refreshStorage();
        await afterChange(targets.map((x) => [x.path, null]));
      };
      const params = { name: targets[0].name, n: targets.length };
      // 只有内部存储、SD 卡以外的路径才真正用到 root，这时才警告
      const rooted = rootMode ? targets.filter((x) => needsRoot(x.path)) : [];
      if (rooted.length && !loadPref("afm.rootDeleteNoWarn", false)) {
        openDialog({
          kind: "confirm",
          tone: "danger",
          icon: Skull,
          title: t(single ? "delete.titleRoot" : "delete.titleRootMany", params),
          countdown: 3,
          confirm: t("delete.root.confirm"),
          checkbox: t("delete.root.noWarn"),
          message: { kind: "rootDelete", paths: rooted.map((x) => x.path) },
          onSubmit: async (noWarn) => {
            if (noWarn) savePref("afm.rootDeleteNoWarn", true);
            await doDelete();
          },
        });
        return;
      }
      openDialog({
        kind: "confirm",
        tone: "danger",
        icon: Trash2,
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
    [target, rootMode, afterChange, reload, refreshStorage, openDialog, t],
  );

  const askRename = useCallback(
    (entry: FileEntry) => {
      if (!target) return;
      openDialog({
        kind: "prompt",
        icon: Pencil,
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
    [target, afterChange, openDialog, t],
  );

  const askMkdir = useCallback(
    (dir: string = path) => {
      if (!target) return;
      openDialog({
        kind: "prompt",
        icon: FolderPlus,
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
    [target, path, reload, openDialog, t],
  );

  return { upload, download, paste, askDelete, askRename, askMkdir };
}
