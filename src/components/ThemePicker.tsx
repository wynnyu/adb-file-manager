import { Check, Palette } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ACCENTS, FLAVORS, currentTheme, onSystemFlavorChange, saveTheme, storedFlavor, switchTheme, type Theme } from "../theme.ts";
import { spring } from "./ui.tsx";

/** 扩散起点：鼠标点击取指针位置，键盘触发（detail 为 0）取按钮中心 */
function origin(e: MouseEvent<HTMLElement>) {
  if (e.detail > 0) return { x: e.clientX, y: e.clientY };
  const r = e.currentTarget.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        if (!storedFlavor()) switchTheme({ ...currentTheme(), flavor }, setTheme);
      }),
    [],
  );

  const pick = (patch: Partial<Theme>, e: MouseEvent<HTMLElement>) => {
    const next = { ...theme, ...patch };
    if (next.flavor === theme.flavor && next.accent === theme.accent) return;
    saveTheme(patch);
    switchTheme(next, setTheme, origin(e));
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        title="主题"
        aria-label="主题"
        aria-expanded={open}
        whileTap={{ scale: 0.9 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        className="grid size-12 place-items-center rounded-[50%] bg-surface0 text-accent transition-colors hover:bg-surface1"
      >
        <motion.span animate={{ rotate: open ? -30 : 0 }} transition={spring}>
          <Palette className="size-5" />
        </motion.span>
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
            <p className="px-3 pt-1.5 pb-0.5 text-xs font-bold text-overlay1">口味</p>
            {FLAVORS.map((f, i) => {
              const active = f.id === theme.flavor;
              return (
                <motion.button
                  key={f.id}
                  type="button"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0, transition: { ...spring, delay: 0.03 * i + 0.04 } }}
                  aria-pressed={active}
                  onClick={(e) => pick({ flavor: f.id }, e)}
                  className={`flex items-center gap-3 rounded-full p-1.5 pr-4 text-left transition-colors hover:bg-surface0 ${
                    active ? "bg-surface0" : ""
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
                    <span className="block text-[11px] text-overlay1">{f.hint}</span>
                  </span>
                  {active && <Check className="size-4 text-accent" strokeWidth={3} />}
                </motion.button>
              );
            })}

            <div className="mx-3 my-1 h-px bg-surface0" />

            <p className="px-3 pb-0.5 text-xs font-bold text-overlay1">主色</p>
            <div className="flex justify-between px-2 pt-0.5 pb-1.5">
              {ACCENTS.map((a, i) => {
                const active = a.id === theme.accent;
                return (
                  <motion.button
                    key={a.id}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={active}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1, transition: { ...spring, delay: 0.03 * i + 0.14 } }}
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
