import { ChevronRight, HardDrive, Pencil } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { spring } from "../../../../components/ui.tsx";
import { useT } from "../../../../i18n/index.tsx";

export function Breadcrumbs({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);
  const scroller = useRef<HTMLDivElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  /** 用 Esc 或回车结束编辑时把焦点还给编辑按钮；点到别处结束时不抢焦点 */
  const refocus = useRef(false);
  const parts = path.split("/").filter(Boolean);

  useEffect(() => {
    setDraft(path);
    scroller.current?.scrollTo({ left: scroller.current.scrollWidth });
  }, [path]);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    editButton.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          refocus.current = true;
          setEditing(false);
          const p = draft.trim().replace(/\/+$/, "") || "/";
          if (p.startsWith("/")) onNavigate(p);
        }}
      >
        <motion.input
          initial={{ scale: 0.98, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            refocus.current = true;
            setEditing(false);
          }}
          spellCheck={false}
          className="h-10 w-full rounded-full bg-base px-4 font-mono text-sm text-text ring-2 ring-accent/60 outline-none"
        />
      </form>
    );
  }

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      title={t("crumbs.edit")}
      className="group flex h-10 min-w-0 flex-1 items-center rounded-full bg-base pr-1"
    >
      <div
        ref={scroller}
        className="flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pl-1 [scrollbar-width:none]"
      >
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="grid size-8 shrink-0 place-items-center rounded-circle text-subtext0 transition-colors hover:bg-surface0 hover:text-text"
          title={t("crumbs.root")}
          aria-label={t("crumbs.root")}
        >
          <HardDrive className="size-4" />
        </button>
        <AnimatePresence initial={false} mode="popLayout">
          {parts.map((part, i) => {
            const target = "/" + parts.slice(0, i + 1).join("/");
            const last = i === parts.length - 1;
            return (
              <motion.span
                key={target}
                layout="position"
                initial={{ opacity: 0, x: -10, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}
                transition={spring}
                className="flex shrink-0 items-center gap-0.5"
              >
                <ChevronRight className="size-3.5 text-overlay0" />
                <button
                  type="button"
                  onClick={() => onNavigate(target)}
                  className={`relative h-8 rounded-full px-3 font-mono text-sm whitespace-nowrap transition-colors ${
                    last ? "font-medium text-accent" : "text-subtext1 hover:bg-surface0"
                  }`}
                >
                  {last && (
                    <motion.span
                      layoutId="crumb-active"
                      transition={spring}
                      className="absolute inset-0 rounded-full bg-accent/15"
                    />
                  )}
                  <span className="relative">{part}</span>
                </button>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
      {/* 双击之外的另一种进入方式，键盘也能用；平时隐藏，悬停或获得焦点时显示 */}
      <button
        ref={editButton}
        type="button"
        onClick={() => setEditing(true)}
        title={t("crumbs.type")}
        aria-label={t("crumbs.type")}
        className="grid size-8 shrink-0 place-items-center rounded-circle text-subtext0 opacity-0 transition hover:bg-surface0 hover:text-text group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  );
}
