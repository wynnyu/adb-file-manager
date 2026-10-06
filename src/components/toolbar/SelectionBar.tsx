import { Download, Package, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "../../i18n/index.tsx";
import { IconButton, PillButton, spring } from "../ui.tsx";

/** 底部居中的多选操作条：已选数量、下载、压缩、删除和取消选择 */
export function SelectionBar({
  show,
  count,
  onDownload,
  onCompress,
  onDelete,
  onClear,
}: {
  show: boolean;
  count: number;
  onDownload: () => void;
  /** 压缩为 zip */
  onCompress: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.9, x: "-50%" }}
          animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
          exit={{ opacity: 0, y: 40, scale: 0.9, x: "-50%", transition: { duration: 0.18 } }}
          transition={spring}
          className="fixed bottom-4 left-1/2 z-30 flex items-center gap-2 rounded-full bg-surface0 p-1.5 pl-5 shadow-2xl shadow-crust ring-1 ring-surface1"
        >
          <span className="flex items-center text-sm font-bold whitespace-nowrap">
            {t("selection.selected")}
            <span className="relative mx-1 inline-flex h-5 min-w-5 justify-center overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={count}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={spring}
                  className="font-mono text-accent"
                >
                  {count}
                </motion.span>
              </AnimatePresence>
            </span>
            {t("selection.unit")}
          </span>
          <PillButton tone="accent" icon={<Download className="size-4" />} onClick={onDownload}>
            {t("selection.download")}
          </PillButton>
          {/* 窄屏时压缩和删除只显示图标，否则操作条会超出屏幕 */}
          <PillButton
            icon={<Package className="size-4" />}
            title={t("selection.compress")}
            aria-label={t("selection.compress")}
            className="max-sm:w-10 max-sm:justify-center max-sm:px-0"
            onClick={onCompress}
          >
            <span className="max-sm:hidden">{t("selection.compress")}</span>
          </PillButton>
          <PillButton
            tone="danger"
            icon={<Trash2 className="size-4" />}
            title={t("selection.delete")}
            aria-label={t("selection.delete")}
            className="max-sm:w-10 max-sm:justify-center max-sm:px-0"
            onClick={onDelete}
          >
            <span className="max-sm:hidden">{t("selection.delete")}</span>
          </PillButton>
          <IconButton tone="ghost" title={t("selection.cancel")} onClick={onClear}>
            <X className="size-5" />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
