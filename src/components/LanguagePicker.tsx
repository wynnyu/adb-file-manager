import { Check, Languages } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LANGS, useI18n } from "../i18n/index.tsx";
import { spring } from "./ui.tsx";

export function LanguagePicker() {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        title={t("lang.title")}
        aria-label={t("lang.title")}
        aria-expanded={open}
        whileTap={{ scale: 0.9 }}
        transition={spring}
        onClick={() => setOpen((o) => !o)}
        className="grid size-12 place-items-center rounded-[50%] bg-surface0 text-accent transition-colors hover:bg-surface1"
      >
        <Languages className="size-5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6, transition: { duration: 0.12 } }}
            transition={spring}
            style={{ originX: 1, originY: 0 }}
            className="absolute right-0 z-30 mt-2 flex w-44 flex-col gap-1 rounded-[1.75rem] bg-mantle p-2 shadow-2xl shadow-crust ring-1 ring-surface0"
          >
            {LANGS.map((l, i) => (
              <motion.button
                key={l.id}
                type="button"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0, transition: { ...spring, delay: 0.03 * i + 0.04 } }}
                aria-pressed={l.id === lang}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-3 rounded-full px-4 py-2.5 text-left text-sm font-bold transition-colors ${
                  l.id === lang ? "bg-accent/15 hover:bg-accent/20" : "hover:bg-surface0"
                }`}
              >
                <span className="flex-1">{l.name}</span>
                {l.id === lang && <Check className="size-4 text-accent" strokeWidth={3} />}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
