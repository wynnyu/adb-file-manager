import { Ellipsis, type LucideIcon, Plus } from "lucide-react";
import { motion } from "motion/react";
import { type MouseEvent, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../../i18n/index.tsx";
import { type Bookmark, bookmarkName } from "../../lib/bookmarks.ts";
import type { MenuState } from "../overlays/ContextMenu.tsx";
import { press, spring } from "../ui.tsx";
import { BookmarkGlyph } from "./BookmarkIcon.tsx";

/** 和 gap-2 一致 */
const GAP = 8;
const MAX_ROWS = 2;

/** 按 flex-wrap 的规则把宽度依次排进 width 宽的行里，返回行数 */
function countRows(widths: number[], width: number) {
  let rows = 1;
  let x = 0;
  for (const w of widths) {
    if (x > 0 && x + GAP + w > width) {
      rows++;
      x = w;
    } else {
      x += (x > 0 ? GAP : 0) + w;
    }
  }
  return rows;
}

const badge = "relative grid size-6 shrink-0 place-items-center rounded-[50%] bg-crust/60";

function ChipBody({ b, label }: { b: Bookmark; label: string }) {
  return (
    <>
      <span className={badge}>
        <BookmarkGlyph icon={b.icon} color={b.color} className="size-3.5" />
      </span>
      <span className="relative max-w-48 truncate">{label}</span>
    </>
  );
}

function ActionBody({ Icon, label }: { Icon: LucideIcon; label: string }) {
  return (
    <>
      <span className={badge}>
        <Icon className="size-3.5" />
      </span>
      <span className="relative">{label}</span>
    </>
  );
}

const chipClass =
  "group relative flex h-9 shrink-0 items-center gap-2 rounded-full bg-base pr-4 pl-1.5 text-sm font-semibold";

export function QuickLinks({
  path,
  bookmarks,
  onNavigate,
  onAddBookmark,
  onBookmarkMenu,
  onMenu,
}: {
  path: string;
  bookmarks: Bookmark[];
  onNavigate: (p: string) => void;
  onAddBookmark: () => void;
  onBookmarkMenu: (e: MouseEvent, b: Bookmark) => void;
  onMenu: (menu: MenuState) => void;
}) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  /** 前多少项直接显示，其余收进“更多”菜单 */
  const [shown, setShown] = useState(Number.POSITIVE_INFINITY);

  const activeId = bookmarks.find((b) => b.path === path)?.id;

  // 标尺层把所有项、“更多”和“新建书签”排成一行，按各自宽度算出两行内能放下多少项
  const fit = useCallback(() => {
    const el = ruler.current;
    const width = box.current?.clientWidth;
    if (!el || !width) return;
    const widths = [...el.children].map((c) => c.getBoundingClientRect().width);
    const add = widths.pop() ?? 0;
    const more = widths.pop() ?? 0;
    if (countRows([...widths, add], width) <= MAX_ROWS) {
      setShown(Number.POSITIVE_INFINITY);
      return;
    }
    let n = widths.length - 1;
    while (n > 0 && countRows([...widths.slice(0, n), more, add], width) > MAX_ROWS) n--;
    setShown(n);
  }, []);

  useLayoutEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    // 字体加载完成、切换语言或增删书签后标尺宽度会变
    if (ruler.current) ro.observe(ruler.current);
    return () => ro.disconnect();
  }, [fit]);

  const visible = bookmarks.slice(0, shown);
  const hidden = bookmarks.slice(visible.length);
  const activeHidden = hidden.some((b) => b.id === activeId);

  const openOverflow = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({
      x: r.left,
      y: r.bottom + 6,
      items: hidden.map((b) => ({
        id: b.id,
        label: bookmarkName(b, t),
        icon: (
          <span className="relative grid size-4 place-items-center">
            <BookmarkGlyph icon={b.icon} color={b.color} className="size-4" />
          </span>
        ),
        // 当前目录在菜单里时才显示对勾列
        checked: activeHidden ? b.id === activeId : undefined,
        onSelect: () => onNavigate(b.path),
        onContextMenu: (ev) => onBookmarkMenu(ev, b),
      })),
    });
  };

  const actions: ReactNode = (
    <>
      <span className={chipClass}>
        <ActionBody Icon={Ellipsis} label={t("bookmark.more")} />
      </span>
      <span className={chipClass}>
        <ActionBody Icon={Plus} label={t("bookmark.new")} />
      </span>
    </>
  );

  return (
    <div ref={box} className="relative">
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={ruler} className="flex w-max gap-2">
          {bookmarks.map((b) => (
            <span key={b.id} className={chipClass}>
              <ChipBody b={b} label={bookmarkName(b, t)} />
            </span>
          ))}
          {actions}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visible.map((b) => {
          const active = b.id === activeId;
          return (
            <motion.button
              key={b.id}
              type="button"
              title={b.path}
              {...press}
              onClick={() => onNavigate(b.path)}
              onContextMenu={(e) => onBookmarkMenu(e, b)}
              className={`${chipClass} transition-colors ${
                active ? "text-text" : "text-subtext0 hover:bg-surface0 hover:text-text"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="quick-active"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-surface1"
                />
              )}
              <ChipBody b={b} label={bookmarkName(b, t)} />
            </motion.button>
          );
        })}
        {hidden.length > 0 && (
          <motion.button
            type="button"
            {...press}
            onClick={openOverflow}
            className={`${chipClass} transition-colors ${
              activeHidden ? "bg-surface1 text-text" : "text-subtext0 hover:bg-surface0 hover:text-text"
            }`}
          >
            <ActionBody Icon={Ellipsis} label={t("bookmark.more")} />
          </motion.button>
        )}
        <motion.button
          type="button"
          {...press}
          onClick={onAddBookmark}
          className={`${chipClass} text-subtext0 transition-colors hover:bg-surface0 hover:text-text`}
        >
          <ActionBody Icon={Plus} label={t("bookmark.new")} />
        </motion.button>
      </div>
    </div>
  );
}
