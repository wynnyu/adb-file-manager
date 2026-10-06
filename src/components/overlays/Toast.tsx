import { AnimatePresence, motion } from "motion/react";
import type { ToastState } from "../../hooks/index.ts";
import { spring } from "../ui.tsx";

/** 顶部居中的短暂提示，错误为红色 */
export function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.msg}
          initial={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
          animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
          exit={{ opacity: 0, y: -30, x: "-50%", scale: 0.9 }}
          transition={spring}
          className={`fixed top-4 left-1/2 z-50 max-w-[calc(100vw-2rem)] rounded-full px-5 py-2.5 text-sm font-semibold shadow-xl ${
            toast.tone === "error"
              ? "bg-red text-crust shadow-red/30"
              : "bg-surface0 text-text shadow-crust ring-1 ring-surface1"
          }`}
        >
          {toast.msg}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
