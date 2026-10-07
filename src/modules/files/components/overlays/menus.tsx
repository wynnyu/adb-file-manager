import {
  CheckCheck,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Info,
  Link,
  Package,
  PackageOpen,
  Pencil,
  RotateCw,
  ScanEye,
  Scissors,
  Trash2,
  Upload,
} from "lucide-react";
import type { MenuItem } from "../../../../components/overlays/index.ts";
import type { T } from "../../../../i18n/index.tsx";
import type { ArchiveFormat, FileEntry } from "../../../../types.ts";
import type { Bookmark } from "../../lib/index.ts";
import { IS_MAC, isArchive } from "../../lib/index.ts";
import type { Clip, ViewMode } from "../../types.ts";
import { VIEWS } from "../views/index.ts";

/** 属性页的快捷键：Mac 上同访达的显示简介，其他系统用 Alt+Enter */
export const PROPERTIES_KEYS = IS_MAC ? ["mod", "I"] : ["alt", "enter"];

/** 右键菜单用到的状态和操作 */
export interface MenuActions {
  t: T;
  path: string;
  view: ViewMode;
  showHidden: boolean;
  canPaste: boolean;
  /** 应用内剪贴板里的条目数 */
  clipCount: number;
  selectable: FileEntry[];
  navigate: (p: string) => void;
  /** 打开条目：文件夹进入，文件在查看器中打开 */
  open: (entry: FileEntry) => void;
  paste: (dest: string) => Promise<void>;
  /** 在设备上把压缩包解压到所在目录 */
  extract: (entry: FileEntry) => Promise<void>;
  /** 在所选项的公共父目录生成压缩包 */
  compress: (targets: FileEntry[], format: ArchiveFormat) => Promise<void>;
  download: (targets: FileEntry[]) => Promise<void>;
  toClip: (mode: Clip["mode"], items: FileEntry[]) => void;
  copyText: (text: string) => void;
  askRename: (entry: FileEntry) => void;
  askDelete: (targets: FileEntry[]) => void;
  askMkdir: (dir?: string) => void;
  askProperties: (entries: FileEntry[]) => void;
  askDirProperties: (dir: string) => void;
  pickUpload: (kind: "files" | "folder", dest: string | null) => void;
  selectAll: () => void;
  reload: (keepSelection?: boolean) => Promise<void>;
  toggleHidden: () => void;
  setView: (v: ViewMode) => void;
  askBookmark: (b?: Bookmark) => void;
  askDeleteBookmark: (b: Bookmark) => void;
}

/** 条目的右键菜单；targets 是要操作的条目，可能是整个选择 */
export function itemMenu(targets: FileEntry[], a: MenuActions): MenuItem[] {
  const { t } = a;
  const single = targets.length === 1 ? targets[0] : null;
  const n = targets.length;
  const items: MenuItem[] = [];
  if (single && !single.isDir) {
    items.push({
      label: t("menu.open"),
      icon: <ScanEye className="size-4" />,
      shortcut: ["enter"],
      onSelect: () => a.open(single),
    });
    if (isArchive(single.name)) {
      items.push({
        label: t("menu.extract"),
        icon: <PackageOpen className="size-4" />,
        onSelect: () => void a.extract(single),
      });
    }
  }
  if (single?.isDir) {
    items.push({
      label: t("menu.open"),
      icon: <FolderOpen className="size-4" />,
      shortcut: ["enter"],
      onSelect: () => a.navigate(single.path),
    });
    if (a.canPaste) {
      items.push({
        label: t("menu.pasteInto", { name: single.name }),
        icon: <ClipboardPaste className="size-4" />,
        onSelect: () => void a.paste(single.path),
      });
    }
  }
  items.push(
    {
      label: n > 1 ? t("menu.downloadMany", { n }) : t("menu.download"),
      icon: <Download className="size-4" />,
      onSelect: () => void a.download(targets),
    },
    {
      label: t("menu.compressZip"),
      icon: <Package className="size-4" />,
      onSelect: () => void a.compress(targets, "zip"),
    },
    {
      label: t("menu.compressTgz"),
      icon: <Package className="size-4" />,
      onSelect: () => void a.compress(targets, "tgz"),
    },
    "sep",
    {
      label: t("menu.cut"),
      icon: <Scissors className="size-4" />,
      shortcut: ["mod", "X"],
      onSelect: () => a.toClip("cut", targets),
    },
    {
      label: t("menu.copy"),
      icon: <Copy className="size-4" />,
      shortcut: ["mod", "C"],
      onSelect: () => a.toClip("copy", targets),
    },
    {
      label: t("menu.copyPath"),
      icon: <Link className="size-4" />,
      onSelect: () => a.copyText(targets.map((x) => x.path).join("\n")),
    },
    {
      label: t("menu.properties"),
      icon: <Info className="size-4" />,
      shortcut: PROPERTIES_KEYS,
      onSelect: () => a.askProperties(targets),
    },
    "sep",
  );
  if (single)
    items.push({
      label: t("menu.rename"),
      icon: <Pencil className="size-4" />,
      shortcut: ["F2"],
      onSelect: () => a.askRename(single),
    });
  items.push({
    label: n > 1 ? t("menu.deleteMany", { n }) : t("menu.delete"),
    icon: <Trash2 className="size-4" />,
    shortcut: IS_MAC ? ["mod", "backspace"] : ["Del"],
    danger: true,
    onSelect: () => a.askDelete(targets),
  });
  return items;
}

/** 空白处的右键菜单；dir 是这块空白所属的目录（分栏视图里可能是上层某一栏） */
export function backgroundMenu(dir: string, a: MenuActions): MenuItem[] {
  const { t } = a;
  const n = a.clipCount;
  const items: MenuItem[] = [
    { label: t("menu.newFolder"), icon: <FolderPlus className="size-4" />, onSelect: () => a.askMkdir(dir) },
    { label: t("menu.upload"), icon: <Upload className="size-4" />, onSelect: () => a.pickUpload("files", dir) },
    {
      label: t("menu.uploadFolder"),
      icon: <FolderUp className="size-4" />,
      onSelect: () => a.pickUpload("folder", dir),
    },
    "sep",
    {
      label: a.canPaste && n > 1 ? t("menu.pasteN", { n }) : t("menu.paste"),
      icon: <ClipboardPaste className="size-4" />,
      shortcut: ["mod", "V"],
      disabled: !a.canPaste,
      onSelect: () => void a.paste(dir),
    },
    { label: t("menu.copyPath"), icon: <Link className="size-4" />, onSelect: () => a.copyText(dir) },
    { label: t("menu.properties"), icon: <Info className="size-4" />, onSelect: () => a.askDirProperties(dir) },
    "sep",
  ];
  if (dir === a.path) {
    items.push({
      label: t("menu.selectAll"),
      icon: <CheckCheck className="size-4" />,
      shortcut: ["mod", "A"],
      disabled: !a.selectable.length,
      onSelect: a.selectAll,
    });
  }
  items.push(
    { label: t("menu.refresh"), icon: <RotateCw className="size-4" />, onSelect: () => void a.reload(true) },
    {
      label: t("menu.showHidden"),
      icon: <Eye className="size-4" />,
      shortcut: ["mod", "shift", "."],
      checked: a.showHidden,
      onSelect: a.toggleHidden,
    },
    "sep",
    ...VIEWS.map(({ id, Icon }) => ({
      label: t(`view.${id}`),
      icon: <Icon className="size-4" />,
      checked: a.view === id,
      onSelect: () => a.setView(id),
    })),
  );
  return items;
}

/** 快捷入口里书签的右键菜单 */
export function bookmarkMenu(b: Bookmark, a: MenuActions): MenuItem[] {
  const { t } = a;
  return [
    { label: t("menu.open"), icon: <FolderOpen className="size-4" />, onSelect: () => a.navigate(b.path) },
    { label: t("menu.copyPath"), icon: <Link className="size-4" />, onSelect: () => a.copyText(b.path) },
    "sep",
    { label: t("bookmark.edit"), icon: <Pencil className="size-4" />, onSelect: () => a.askBookmark(b) },
    {
      label: t("bookmark.delete"),
      icon: <Trash2 className="size-4" />,
      danger: true,
      onSelect: () => a.askDeleteBookmark(b),
    },
  ];
}
