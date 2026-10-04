import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "../i18n/index.tsx";
import { PillButton, spring } from "./ui.tsx";

export type DialogState =
  | { kind: "prompt"; title: string; icon: ReactNode; initial: string; confirm: string; onSubmit: (v: string) => Promise<void> }
  | {
      kind: "confirm";
      title: string;
      icon: ReactNode;
      message: ReactNode;
      confirm: string;
      tone?: "danger" | "warn";
      /** 附带一个可勾选项，结果传给 onSubmit */
      checkbox?: string;
      /** 确认按钮倒计时若干秒后才可点击 */
      countdown?: number;
      onSubmit: (checked: boolean) => Promise<void>;
    };

const toneStyles = {
  default: { badge: "bg-accent/15 text-accent", ring: "ring-surface0" },
  danger: { badge: "bg-red/15 text-red", ring: "ring-red/40" },
  warn: { badge: "bg-peach/15 text-peach", ring: "ring-peach/40" },
};

export function Dialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const t = useT();
  const [value, setValue] = useState(state.kind === "prompt" ? state.initial : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [left, setLeft] = useState(state.kind === "confirm" ? (state.countdown ?? 0) : 0);
  const input = useRef<HTMLInputElement>(null);
  const cancelBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  // 有倒计时的危险操作默认聚焦“取消”，防止回车误触
  useEffect(() => {
    if (state.kind === "confirm" && state.countdown) cancelBtn.current?.focus();
  }, [state]);

  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.focus();
    // 重命名时只选中文件名主体，不选扩展名
    const dot = el.value.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function submit() {
    if (state.kind === "prompt" && !value.trim()) return;
    if (left > 0) return;
    setBusy(true);
    setError(null);
    try {
      if (state.kind === "prompt") await state.onSubmit(value.trim());
      else await state.onSubmit(checked);
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const tone = (state.kind === "confirm" && state.tone) || "default";
  const styles = toneStyles[tone];
  const countdown = state.kind === "confirm" ? (state.countdown ?? 0) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-50 grid place-items-center bg-crust/70 p-4 backdrop-blur-sm"
      onMouseDown={() => !busy && onClose()}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
        transition={{ type: "spring", stiffness: 420, damping: 28 }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`flex w-full max-w-md flex-col items-center gap-5 rounded-[2.5rem] bg-mantle px-6 pt-8 pb-6 text-center shadow-2xl ring-1 ${styles.ring}`}
      >
        <span className={`grid size-16 place-items-center rounded-[50%] ${styles.badge}`}>{state.icon}</span>
        <h2 className="w-full text-lg font-extrabold wrap-anywhere">{state.title}</h2>
        {state.kind === "prompt" ? (
          <input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            className="h-12 w-full rounded-full bg-base px-5 text-center font-mono text-text ring-1 ring-surface1 outline-none focus:ring-2 focus:ring-accent"
          />
        ) : (
          <div className="w-full text-sm text-subtext1 wrap-anywhere">{state.message}</div>
        )}
        {state.kind === "confirm" && state.checkbox && (
          <button
            type="button"
            onClick={() => setChecked((c) => !c)}
            className="flex items-center gap-3 rounded-full bg-base py-1.5 pr-5 pl-1.5 text-sm font-semibold text-subtext1 transition-colors hover:bg-surface0"
          >
            <span
              className={`grid size-7 place-items-center rounded-[50%] ring-2 transition-colors ${
                checked ? "bg-peach text-crust ring-peach" : "ring-surface2"
              }`}
            >
              <AnimatePresence>
                {checked && (
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}>
                    <Check className="size-4" strokeWidth={3} />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            {state.checkbox}
          </button>
        )}
        {error && (
          <motion.p
            key={error}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1, x: [0, -8, 8, -5, 5, 0] }}
            transition={{ ...spring, x: { duration: 0.4 } }}
            className="w-full rounded-2xl bg-red/15 px-4 py-2 text-sm text-red wrap-anywhere"
          >
            {error}
          </motion.p>
        )}
        <div className="flex w-full gap-2">
          <PillButton ref={cancelBtn} className="h-12 flex-1 justify-center" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </PillButton>
          <PillButton
            type="submit"
            tone={tone === "default" ? "accent" : "danger"}
            className={`relative h-12 flex-1 justify-center overflow-hidden ${tone === "warn" ? "!bg-peach/15 !text-peach hover:!bg-peach hover:!text-crust" : ""}`}
            disabled={busy || left > 0}
          >
            {countdown > 0 && (
              <motion.span
                className="absolute inset-y-0 left-0 bg-red/20"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: countdown, ease: "linear" }}
              />
            )}
            <span className="relative">{busy ? t("common.processing") : left > 0 ? `${state.confirm}（${left}）` : state.confirm}</span>
          </PillButton>
        </div>
      </motion.form>
    </motion.div>
  );
}
