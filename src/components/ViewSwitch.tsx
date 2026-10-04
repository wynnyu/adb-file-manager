import { Columns3, GalleryThumbnails, LayoutGrid, List } from "lucide-react";
import { motion } from "motion/react";
import { useT } from "../i18n/index.tsx";
import type { ViewMode } from "../types.ts";
import { spring } from "./ui.tsx";

export const VIEWS: { id: ViewMode; Icon: typeof List }[] = [
  { id: "icons", Icon: LayoutGrid },
  { id: "list", Icon: List },
  { id: "columns", Icon: Columns3 },
  { id: "gallery", Icon: GalleryThumbnails },
];

/** Finder 式的显示方式切换：图标 / 列表 / 分栏 / 画廊 */
export function ViewSwitch({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("view.title")}
      className="flex h-10 shrink-0 items-center gap-0.5 rounded-full bg-surface0 p-1"
    >
      {VIEWS.map(({ id, Icon }) => {
        const active = view === id;
        return (
          <motion.button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            title={t(`view.${id}`)}
            aria-label={t(`view.${id}`)}
            whileTap={{ scale: 0.9 }}
            transition={spring}
            onClick={() => onChange(id)}
            className={`relative grid h-8 w-9 place-items-center rounded-full transition-colors ${
              active ? "text-on-accent" : "text-subtext0 hover:bg-surface1 hover:text-text"
            }`}
          >
            {active && (
              <motion.span
                layoutId="view-active"
                transition={spring}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <Icon className="relative size-4" />
          </motion.button>
        );
      })}
    </div>
  );
}
