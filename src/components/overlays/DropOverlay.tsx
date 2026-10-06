import { Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useI18n } from "../../i18n/index.tsx";
import { spring } from "../ui.tsx";

/** 拖着文件经过窗口时盖在主面板上的提示，标明会上传到哪个目录 */
export function DropOverlay({ show, path }: { show: boolean; path: string }) {
  const { rich } = useI18n();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
          transition={spring}
          className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-4xl border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[2px]"
        >
          <div className="flex flex-col items-center gap-3">
            <span className="grid size-20 place-items-center rounded-circle bg-accent text-on-accent shadow-xl shadow-accent/30">
              <Upload className="size-9" />
            </span>
            <p className="rounded-full bg-crust/80 px-5 py-2 font-bold">
              {rich("toolbar.dropHere", { path: (s) => <span className="font-mono text-accent">{s}</span> }, { path })}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
