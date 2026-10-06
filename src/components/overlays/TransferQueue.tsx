import { ArrowDownToLine, ArrowUpFromLine, Check, Copy, FolderInput, type LucideIcon, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import type { MessageKey } from "../../i18n/index.tsx";
import { useT } from "../../i18n/index.tsx";
import type { Transfer } from "../../types.ts";
import { spring, springPop } from "../ui.tsx";

const kindIcon: Record<Transfer["kind"], LucideIcon> = {
  upload: ArrowUpFromLine,
  download: ArrowDownToLine,
  copy: Copy,
  move: FolderInput,
};
/** 写全类名，Tailwind 才扫得到 */
const kindTint: Record<Transfer["kind"], { badge: string; bar: string }> = {
  upload: { badge: "bg-accent/20 text-accent", bar: "bg-accent" },
  download: { badge: "bg-blue/20 text-blue", bar: "bg-blue" },
  copy: { badge: "bg-teal/20 text-teal", bar: "bg-teal" },
  move: { badge: "bg-teal/20 text-teal", bar: "bg-teal" },
};

const statusText: Record<Transfer["status"], MessageKey> = {
  uploading: "transfer.uploading",
  pushing: "transfer.pushing",
  pulling: "transfer.pulling",
  copying: "transfer.copying",
  moving: "transfer.moving",
  done: "transfer.done",
  error: "transfer.error",
};

/** 右下角的传输卡片；children 排在最下面（首次使用的提示），和传输卡片共用这一角，不会互相盖住 */
export function TransferQueue({
  items,
  onDismiss,
  children,
}: {
  items: Transfer[];
  onDismiss: (id: string) => void;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="fixed right-4 bottom-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      <AnimatePresence initial={false}>
        {items.map((item) => {
          const Icon = kindIcon[item.kind];
          const color = kindTint[item.kind];
          const busy = item.status !== "done" && item.status !== "error";
          const pct = item.status === "uploading" && item.progress != null ? Math.round(item.progress * 100) : null;
          const tint =
            item.status === "error"
              ? "bg-red/20 text-red"
              : item.status === "done"
                ? "bg-green/20 text-green"
                : color.badge;
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
              <span
                className={`relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-circle transition-colors duration-300 ${tint}`}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={busy ? "busy" : item.status}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 90 }}
                    transition={springPop}
                  >
                    {item.status === "done" ? (
                      <Check className="size-5" />
                    ) : item.status === "error" ? (
                      <X className="size-5" />
                    ) : (
                      <Icon className="size-5" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-bold">{item.label}</span>
                  <span className="shrink-0 font-mono text-2xs text-subtext1">{pct != null ? `${pct}%` : ""}</span>
                </div>
                {busy ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-crust/70">
                    {pct != null ? (
                      <motion.div
                        className="bg-rainbow h-full rounded-full"
                        style={{ backgroundSize: `${10000 / Math.max(pct, 1)}% 100%` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ ease: "easeOut", duration: 0.25 }}
                      />
                    ) : (
                      <div className={`animate-indeterminate h-full w-2/5 rounded-full ${color.bar}`} />
                    )}
                  </div>
                ) : null}
                <div className={`truncate text-xs ${item.status === "error" ? "text-red" : "text-subtext1"}`}>
                  {item.error ?? t(statusText[item.status])}
                </div>
              </div>
              {!busy && (
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-circle text-muted hover:bg-surface1 hover:text-text"
                  title={t("common.close")}
                  aria-label={t("common.close")}
                >
                  <X className="size-4" />
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
      {children}
    </div>
  );
}
