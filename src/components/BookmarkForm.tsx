import { Check, Palette, Upload } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  BOOKMARK_COLORS,
  type BookmarkColor,
  type BookmarkFields,
  bookmarkName,
  imageToIcon,
  isImageIcon,
} from "../lib/bookmarks.ts";
import { BookmarkGlyph, colorVar, ICON_LIBRARY } from "./BookmarkIcon.tsx";

const field =
  "h-12 w-full rounded-full bg-base px-5 text-text ring-1 ring-surface1 outline-none focus:ring-2 focus:ring-accent";

const tile = (active: boolean) =>
  `relative grid size-9 place-items-center overflow-hidden rounded-[50%] ring-offset-2 ring-offset-base transition-[background-color,box-shadow] ${
    active ? "bg-surface1 ring-2 ring-text" : "hover:bg-surface0 hover:ring-2 hover:ring-surface2"
  }`;

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

function Section({ label, children, dim }: { label: string; children: ReactNode; dim?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 transition-opacity ${dim ? "pointer-events-none opacity-40" : ""}`}>
      <span className="px-5 text-xs font-bold text-muted">{label}</span>
      {children}
    </div>
  );
}

/** 对话框里的书签预览：图标库图标用所选颜色淡色打底，上传的图片铺满 */
export function BookmarkPreview({ value }: { value: BookmarkFields }) {
  return (
    <span
      className="relative grid size-16 place-items-center rounded-[50%]"
      style={{ background: `color-mix(in oklab, ${colorVar(value.color)} 15%, transparent)` }}
    >
      <BookmarkGlyph icon={value.icon} color={value.color} className="size-7" />
    </span>
  );
}

export function BookmarkForm({
  value,
  onChange,
  templates,
  nameInput,
  onError,
}: {
  value: BookmarkFields;
  onChange: (v: BookmarkFields) => void;
  /** 可添加回来的内置书签，仅新建时提供 */
  templates?: BookmarkFields[];
  nameInput: RefObject<HTMLInputElement | null>;
  onError: (msg: string | null) => void;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  /** 最近上传的图片，切到图标库图标后仍可切回 */
  const [image, setImage] = useState(isImageIcon(value.icon) ? value.icon : null);
  /**
   * 新建时，内容和某个模板完全一致才算用了这个模板，改动任一项就成为普通书签；
   * 编辑已有书签时不提供模板，preset 保持不变
   */
  const set = (patch: Partial<BookmarkFields>) => {
    const next = { ...value, ...patch };
    if (templates) {
      const tpl = templates.find(
        (x) =>
          bookmarkName(x, t) === next.name.trim() &&
          x.path === next.path.trim() &&
          x.icon === next.icon &&
          x.color === next.color,
      );
      next.preset = tpl?.preset;
    }
    onChange(next);
  };

  const applyTemplate = (tpl: BookmarkFields) => {
    onChange({ ...tpl, name: bookmarkName(tpl, t) });
    // 等新名称渲染进输入框后再全选
    requestAnimationFrame(() => nameInput.current?.select());
    nameInput.current?.focus();
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const icon = await imageToIcon(file);
      setImage(icon);
      onError(null);
      set({ icon });
    } catch {
      onError(t("bookmark.imageFailed"));
    }
  };

  const usingImage = isImageIcon(value.icon);

  const swatch = (c: BookmarkColor) => {
    const active = c === value.color;
    const label = c === "accent" ? t("bookmark.followAccent") : capitalize(c);
    return (
      <motion.button
        key={c}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={active}
        tabIndex={usingImage ? -1 : undefined}
        whileTap={{ scale: 0.85 }}
        onClick={() => set({ color: c })}
        style={{ background: colorVar(c) }}
        className={`relative grid size-8 shrink-0 place-items-center rounded-[50%] text-crust ring-offset-2 ring-offset-base transition-shadow ${
          active ? "ring-2 ring-text" : "hover:ring-2 hover:ring-surface2"
        }`}
      >
        {active && <Check className="size-4" strokeWidth={3} />}
        {/* 角标表示这一格跟随主题主色 */}
        {c === "accent" && (
          <span className="absolute -right-1 -bottom-1 grid size-4 place-items-center rounded-[50%] bg-base text-text">
            <Palette className="size-2.5" strokeWidth={2.5} />
          </span>
        )}
      </motion.button>
    );
  };

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      {templates && templates.length > 0 && (
        <Section label={t("bookmark.templates")}>
          <div className="flex flex-wrap gap-1.5 px-1">
            {templates.map((tpl) => {
              const active = tpl.preset === value.preset;
              return (
                <motion.button
                  key={tpl.preset}
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  aria-pressed={active}
                  onClick={() => applyTemplate(tpl)}
                  className={`flex h-8 items-center gap-1.5 rounded-full pr-3 pl-1 text-xs font-semibold transition-colors ${
                    active ? "bg-surface1 text-text" : "bg-base text-subtext0 hover:bg-surface0 hover:text-text"
                  }`}
                >
                  <span className="relative grid size-6 place-items-center rounded-[50%] bg-crust/60">
                    <BookmarkGlyph icon={tpl.icon} color={tpl.color} className="size-3.5" />
                  </span>
                  {bookmarkName(tpl, t)}
                </motion.button>
              );
            })}
          </div>
        </Section>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="px-5 text-xs font-bold text-muted">{t("bookmark.name")}</span>
        <input
          ref={nameInput}
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          spellCheck={false}
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="px-5 text-xs font-bold text-muted">{t("bookmark.path")}</span>
        <input
          value={value.path}
          onChange={(e) => set({ path: e.target.value })}
          spellCheck={false}
          className={`${field} font-mono text-sm`}
        />
      </label>

      <Section label={t("bookmark.icon")}>
        <div className="grid grid-cols-8 justify-items-center gap-y-2 rounded-[1.75rem] bg-base p-2.5">
          {Object.entries(ICON_LIBRARY).map(([name, Icon]) => (
            <motion.button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={value.icon === name}
              whileTap={{ scale: 0.85 }}
              onClick={() => set({ icon: name })}
              className={tile(value.icon === name)}
            >
              <Icon className="size-4" style={{ color: colorVar(value.color) }} />
            </motion.button>
          ))}
          {image && (
            <motion.button
              type="button"
              title={t("bookmark.image")}
              aria-label={t("bookmark.image")}
              aria-pressed={value.icon === image}
              whileTap={{ scale: 0.85 }}
              onClick={() => set({ icon: image })}
              className={tile(value.icon === image)}
            >
              <img src={image} alt="" className="size-full object-cover" />
            </motion.button>
          )}
          <motion.button
            type="button"
            title={t("bookmark.upload")}
            aria-label={t("bookmark.upload")}
            whileTap={{ scale: 0.85 }}
            onClick={() => fileInput.current?.click()}
            className={`${tile(false)} text-subtext0 ring-1 ring-surface1 ring-offset-0 hover:text-text`}
          >
            <Upload className="size-4" />
          </motion.button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </Section>

      <Section label={t("bookmark.color")} dim={usingImage}>
        {/* 主色单独放在左边，和同色的固定色区分开；其余 14 个固定色正好排满两行 */}
        <div aria-disabled={usingImage} className="flex items-center gap-2.5 rounded-[1.75rem] bg-base p-2.5">
          {swatch("accent")}
          <span className="h-14 w-px shrink-0 bg-surface1" />
          <div className="grid flex-1 grid-cols-7 justify-items-center gap-y-2">
            {BOOKMARK_COLORS.filter((c) => c !== "accent").map(swatch)}
          </div>
        </div>
      </Section>
    </div>
  );
}
