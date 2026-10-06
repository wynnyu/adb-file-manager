import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DialogState } from "../components/overlays/index.ts";
import { useT } from "../i18n/index.tsx";
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
} from "../lib/index.ts";

/** 快捷入口里的书签：列表本身，以及新建、编辑、删除书签的对话框 */
export function useBookmarks(path: string, openDialog: (d: DialogState) => void) {
  const t = useT();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);

  useEffect(() => saveBookmarks(bookmarks), [bookmarks]);

  /** 不传 existing 时新建书签，名称和路径取当前目录 */
  const askBookmark = useCallback(
    (existing?: Bookmark) => {
      const name = path === "/" ? t("crumbs.root") : path.slice(path.lastIndexOf("/") + 1);
      const order = (b: { preset?: string }) => PRESETS.findIndex((p) => p.preset === b.preset);
      openDialog({
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
    [path, bookmarks, openDialog, t],
  );

  const askDeleteBookmark = useCallback(
    (b: Bookmark) =>
      openDialog({
        kind: "confirm",
        tone: "danger",
        icon: Trash2,
        title: t("bookmark.deleteTitle", { name: bookmarkName(b, t) }),
        message: { kind: "bookmarkDelete", preset: !!b.preset, path: b.path },
        confirm: t("common.delete"),
        onSubmit: async () => setBookmarks((list) => list.filter((x) => x.id !== b.id)),
      }),
    [openDialog, t],
  );

  return { bookmarks, askBookmark, askDeleteBookmark };
}
