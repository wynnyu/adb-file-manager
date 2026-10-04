import type { MessageKey } from "./i18n/zh.ts";
import { loadPref, savePref } from "./prefs.ts";

/**
 * 书签图标可选的颜色，取 Catppuccin 调色板里的名字，渲染时用 CSS 变量，切换口味时跟着变。
 * accent 跟随主题主色
 */
export const BOOKMARK_COLORS = [
  "accent",
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
] as const;

export type BookmarkColor = (typeof BOOKMARK_COLORS)[number];

/** 内置书签，删除后可在“新建书签”里从模板添加回来 */
export const PRESETS = [
  { preset: "internal", label: "quick.internal", path: "/sdcard", icon: "home", color: "accent" },
  { preset: "downloads", label: "quick.downloads", path: "/sdcard/Download", icon: "download", color: "blue" },
  { preset: "camera", label: "quick.camera", path: "/sdcard/DCIM", icon: "camera", color: "pink" },
  { preset: "pictures", label: "quick.pictures", path: "/sdcard/Pictures", icon: "image", color: "flamingo" },
  { preset: "movies", label: "quick.movies", path: "/sdcard/Movies", icon: "video", color: "peach" },
  { preset: "music", label: "quick.music", path: "/sdcard/Music", icon: "music", color: "teal" },
  { preset: "documents", label: "quick.documents", path: "/sdcard/Documents", icon: "file-text", color: "yellow" },
] as const satisfies readonly {
  preset: string;
  label: MessageKey;
  path: string;
  icon: string;
  color: BookmarkColor;
}[];

export type PresetId = (typeof PRESETS)[number]["preset"];

export interface Bookmark {
  id: string;
  /** 内置书签的名称为空时显示当前语言的默认名称 */
  name: string;
  path: string;
  /** 图标库里的名称，或用户上传图片的 data URL */
  icon: string;
  color: BookmarkColor;
  preset?: PresetId;
}

export type BookmarkFields = Omit<Bookmark, "id">;

export const isImageIcon = (icon: string) => icon.startsWith("data:image/");

const presetOf = (id: string | undefined) => PRESETS.find((p) => p.preset === id);

export function bookmarkName(b: BookmarkFields, t: (k: MessageKey) => string) {
  const p = presetOf(b.preset);
  return p && !b.name ? t(p.label) : b.name;
}

/** 内置书签的名称和默认名称相同时存为空，切换语言后跟着变 */
export function storedName(b: BookmarkFields, t: (k: MessageKey) => string) {
  const p = presetOf(b.preset);
  return p && b.name === t(p.label) ? "" : b.name;
}

/** 模板的字段，名称为空，显示时取当前语言 */
export const presetFields = (p: (typeof PRESETS)[number]): BookmarkFields => ({
  name: "",
  path: p.path,
  icon: p.icon,
  color: p.color,
  preset: p.preset,
});

const KEY = "afm.bookmarks";

function valid(b: Partial<Bookmark> | null): b is Bookmark {
  return (
    typeof b?.id === "string" &&
    typeof b.name === "string" &&
    typeof b.path === "string" &&
    typeof b.icon === "string" &&
    BOOKMARK_COLORS.includes(b.color as BookmarkColor) &&
    (b.preset === undefined || !!presetOf(b.preset))
  );
}

export function loadBookmarks(): Bookmark[] {
  const raw = loadPref<unknown>(KEY, null);
  const defaults = PRESETS.map((p) => ({ id: p.preset, ...presetFields(p) }));
  if (raw == null) return defaults;
  // 第一版只存了用户自建的书签，没有图标字段：补上内置书签和默认图标
  if (Array.isArray(raw)) return [...defaults, ...raw.map((b) => ({ icon: "bookmark", ...b })).filter(valid)];
  const items = (raw as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter(valid) : defaults;
}

export const saveBookmarks = (items: Bookmark[]) => savePref(KEY, { v: 2, items });

export const newBookmarkId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 新书签默认颜色：按已有数量轮换，相邻的书签颜色不同，不用 accent */
export const nextBookmarkColor = (list: Bookmark[]): BookmarkColor =>
  BOOKMARK_COLORS[1 + ((list.length * 5 + 3) % (BOOKMARK_COLORS.length - 1))];

/** 去掉末尾的 /，空串视为根目录；不是绝对路径时返回 null */
export function normalizePath(p: string) {
  const s = p.trim().replace(/\/+$/, "") || "/";
  return s.startsWith("/") ? s : null;
}

const ICON_SIZE = 96;

/** 把上传的图片裁成正方形并缩小，存成 PNG data URL，避免撑大 localStorage */
export function imageToIcon(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("not an image"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth || ICON_SIZE;
      const h = img.naturalHeight || ICON_SIZE;
      const side = Math.min(w, h);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = ICON_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, ICON_SIZE, ICON_SIZE);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
