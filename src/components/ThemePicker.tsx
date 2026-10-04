import { Check, Palette } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  ACCENTS,
  currentTheme,
  FLAVORS,
  onSystemFlavorChange,
  saveTheme,
  storedFlavor,
  switchTheme,
  type Theme,
} from "../lib/theme.ts";
import { spring } from "./ui.tsx";

/** 扩散起点：鼠标点击取指针位置，键盘触发（detail 为 0）取按钮中心 */
function origin(e: MouseEvent<HTMLElement>) {
  if (e.detail > 0) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function ThemePicker() {
  const t = useT();
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 最近一次请求的主题。state 要等过渡回调里才提交，快速连点时拿它判断是否重复点击
  const target = useRef(theme);

  useEffect(() => {
    if (!open) return;
    const close = (e: globalThis.MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  // 没手动选过口味时跟随系统深浅色
  useEffect(
    () =>
      onSystemFlavorChange((flavor) => {
        if (storedFlavor()) return;
        target.current = { ...target.current, flavor };
        switchTheme(target.current, setTheme);
      }),
    [],
  );

  const pick = (patch: Partial<Theme>, e: MouseEvent<HTMLElement>) => {
    const prev = target.current;
    const next = { ...prev, ...patch };
    if (next.flavor === prev.flavor && next.accent === prev.accent) return;
    target.current = next;
    saveTheme(patch);
    switchTheme(next, setTheme, origin(e));
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        title={t("theme.title")}
        aria-label={t("theme.title")}
        aria-expanded={open}
        whileTap={{ scale: 0.9 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        className="grid size-12 place-items-center rounded-[50%] bg-surface0 text-accent transition-colors hover:bg-surface1"
      >
        <Palette className="size-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6, transition: { duration: 0.12 } }}
            transition={spring}
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 z-30 mt-2 flex w-64 flex-col gap-1 rounded-[1.75rem] bg-mantle p-2 shadow-2xl shadow-crust ring-1 ring-surface0"
          >
            <p className="px-3 pt-1.5 pb-0.5 text-xs font-bold text-muted">{t("theme.flavor")}</p>
            {FLAVORS.map((f) => {
              const active = f.id === theme.flavor;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={(e) => pick({ flavor: f.id }, e)}
                  className={`flex items-center gap-3 rounded-full p-1.5 pr-4 text-left transition-colors ${
                    active ? "bg-accent/15 hover:bg-accent/20" : "hover:bg-surface0"
                  }`}
                >
                  {/* data-flavor 让这颗预览球内部取该口味的配色 */}
                  <span
                    data-flavor={f.id}
                    className="grid size-9 shrink-0 place-items-center rounded-[50%] bg-base ring-1 ring-surface1"
                  >
                    <span className="size-3.5 rounded-[50%]" style={{ background: `var(--color-${theme.accent})` }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{f.name}</span>
                    <span className="block text-[11px] text-muted">{t(`theme.${f.id}`)}</span>
                  </span>
                  {active && <Check className="size-4 text-accent" strokeWidth={3} />}
                </button>
              );
            })}

            <div className="mx-3 my-1 h-px bg-surface0" />

            <p className="px-3 pb-0.5 text-xs font-bold text-muted">{t("theme.accent")}</p>
            <div className="flex justify-between px-2 pt-0.5 pb-1.5">
              {ACCENTS.map((a) => {
                const active = a.id === theme.accent;
                return (
                  <motion.button
                    key={a.id}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={active}
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => pick({ accent: a.id }, e)}
                    style={{ background: `var(--color-${a.id})` }}
                    className={`grid size-9 place-items-center rounded-[50%] text-crust ring-offset-2 ring-offset-mantle transition-shadow ${
                      active ? "ring-2 ring-text" : "hover:ring-2 hover:ring-surface2"
                    }`}
                  >
                    {active && <Check className="size-4" strokeWidth={3} />}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
