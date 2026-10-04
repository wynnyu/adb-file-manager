import { Lightbulb, MousePointerClick, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import { loadPref, savePref } from "../prefs.ts";
import { spring } from "./ui.tsx";

const KEY = "afm.tipDismissed";

/** 首次使用时右下角的提示卡片：右键菜单和拖拽上传不容易发现，提示一次，关掉后不再出现 */
export function UsageTip() {
  const t = useT();
  const [show, setShow] = useState(() => !loadPref(KEY, false));

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          layout
          initial={{ opacity: 0, x: 80, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1, transition: { ...spring, delay: 0.6 } }}
          exit={{ opacity: 0, x: 80, scale: 0.9, transition: { duration: 0.2 } }}
          transition={spring}
          className="rounded-[1.5rem] bg-surface0 p-4 pt-3 shadow-xl shadow-crust/60 ring-1 ring-surface1"
        >
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-[50%] bg-yellow/20 text-yellow">
              <Lightbulb className="size-4" />
            </span>
            <span className="flex-1 text-sm font-bold">{t("tip.title")}</span>
            <button
              type="button"
              title={t("tip.dismiss")}
              aria-label={t("tip.dismiss")}
              onClick={() => {
                savePref(KEY, true);
                setShow(false);
              }}
              className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-[50%] text-muted hover:bg-surface1 hover:text-text"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5 text-xs text-subtext1">
            <li className="flex gap-2">
              <MousePointerClick className="mt-px size-3.5 shrink-0 text-muted" />
              {t("tip.rightClick")}
            </li>
            <li className="flex gap-2">
              <Upload className="mt-px size-3.5 shrink-0 text-muted" />
              {t("tip.drop")}
            </li>
          </ul>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
