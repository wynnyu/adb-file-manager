import { ChevronDown, Columns3, GalleryThumbnails, LayoutGrid, List } from "lucide-react";
import { motion } from "motion/react";
import { useT } from "../i18n/index.tsx";
import type { ViewMode } from "../types.ts";
import type { MenuState } from "./ContextMenu.tsx";
import { press, spring } from "./ui.tsx";

export const VIEWS: { id: ViewMode; Icon: typeof List }[] = [
  { id: "icons", Icon: LayoutGrid },
  { id: "list", Icon: List },
  { id: "columns", Icon: Columns3 },
  { id: "gallery", Icon: GalleryThumbnails },
];

/**
 * Finder 式的显示方式切换：图标 / 列表 / 分栏 / 画廊。
 * 工具栏容器窄于 @2xl 时收成一个按钮，点开是菜单
 */
export function ViewSwitch({
  view,
  onChange,
  onMenu,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  onMenu: (menu: MenuState) => void;
}) {
  const t = useT();
  const Current = VIEWS.find((v) => v.id === view)?.Icon ?? List;
  return (
    <>
      <motion.button
        type="button"
        title={t("view.title")}
        aria-label={t("view.title")}
        aria-haspopup="menu"
        {...press}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onMenu({
            x: r.left,
            y: r.bottom + 6,
            items: VIEWS.map(({ id, Icon }) => ({
              label: t(`view.${id}`),
              icon: <Icon className="size-4" />,
              checked: view === id,
              onSelect: () => onChange(id),
            })),
          });
        }}
        className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-surface0 pr-2.5 pl-3 text-text transition-colors hover:bg-surface1 @2xl:hidden"
      >
        <Current className="size-4" />
        <ChevronDown className="size-3.5 text-subtext0" />
      </motion.button>
      <ViewRadios view={view} onChange={onChange} />
    </>
  );
}

function ViewRadios({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("view.title")}
      className="hidden h-10 shrink-0 items-center gap-0.5 rounded-full bg-surface0 p-1 @2xl:flex"
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
