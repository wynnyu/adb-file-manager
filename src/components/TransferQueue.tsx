import { ArrowDownToLine, ArrowUpFromLine, Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Transfer } from "../types.ts";
import { useT } from "../i18n/index.tsx";
import type { MessageKey } from "../i18n/zh.ts";
import { spring } from "./ui.tsx";

const statusText: Record<Transfer["status"], MessageKey> = {
  uploading: "transfer.uploading",
  pushing: "transfer.pushing",
  pulling: "transfer.pulling",
  done: "transfer.done",
  error: "transfer.error",
};

export function TransferQueue({ items, onDismiss }: { items: Transfer[]; onDismiss: (id: string) => void }) {
  const t = useT();
  return (
    <div className="fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
      {items.map((item) => {
        const Icon = item.kind === "upload" ? ArrowUpFromLine : ArrowDownToLine;
        const busy = item.status !== "done" && item.status !== "error";
        const pct = item.status === "uploading" && item.progress != null ? Math.round(item.progress * 100) : null;
        const tint =
          item.status === "error"
            ? "bg-red/20 text-red"
            : item.status === "done"
              ? "bg-green/20 text-green"
              : item.kind === "upload"
                ? "bg-accent/20 text-accent"
                : "bg-blue/20 text-blue";
        return (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
            transition={spring}
            className="flex items-center gap-3 rounded-full bg-surface0 py-1.5 pr-2 pl-1.5 shadow-xl shadow-crust/60 ring-1 ring-surface1"
          >
            <span className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-[50%] transition-colors duration-300 ${tint}`}>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={busy ? "busy" : item.status}
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 90 }}
                  transition={{ type: "spring", stiffness: 500, damping: 20 }}
                >
                  {item.status === "done" ? (
                    <Check className="size-5" />
                  ) : item.status === "error" ? (
                    <X className="size-5" />
                  ) : (
                    <motion.span
                      className="block"
                      animate={{ y: item.kind === "upload" ? [2, -2, 2] : [-2, 2, -2] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Icon className="size-5" />
                    </motion.span>
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold">{item.label}</span>
                <span className="shrink-0 font-mono text-[11px] text-subtext0">{pct != null ? `${pct}%` : ""}</span>
              </div>
              {busy ? (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-crust/70">
                  {pct != null ? (
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ ease: "easeOut", duration: 0.25 }}
                    />
                  ) : (
                    <div className={`animate-indeterminate h-full w-2/5 rounded-full ${item.kind === "upload" ? "bg-accent" : "bg-blue"}`} />
                  )}
                </div>
              ) : null}
              <div className={`truncate text-xs ${item.status === "error" ? "text-red" : "text-subtext0"}`}>
                {item.error ?? t(statusText[item.status])}
              </div>
            </div>
            {!busy && (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="grid size-8 shrink-0 place-items-center rounded-[50%] text-overlay1 hover:bg-surface1 hover:text-text"
                title={t("common.close")}
              >
                <X className="size-4" />
              </button>
            )}
          </motion.div>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
