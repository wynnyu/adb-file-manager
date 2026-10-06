import { motion } from "motion/react";
import { useEffect } from "react";
import { useT } from "../../i18n/index.tsx";
import type { Target } from "../../lib/index.ts";
import type { FileEntry } from "../../types.ts";
import { PillButton, spring } from "../ui.tsx";
import { PropertiesSingle } from "./PropertiesSingle.tsx";
import { PropertiesSummary } from "./PropertiesSummary.tsx";

/** 属性页：一项显示完整信息和权限，多项只显示汇总 */
export function Properties({
  entries,
  target,
  onClose,
  onNavigate,
  onCopy,
  flash,
}: {
  entries: FileEntry[];
  target: Target;
  onClose: () => void;
  /** 跳转到链接目标：文件夹进入，文件则进入它所在的目录并选中 */
  onNavigate: (path: string, focus?: string | true) => void;
  onCopy: (text: string) => void;
  flash: (message: string) => void;
}) {
  const t = useT();
  const single = entries.length === 1 ? entries[0] : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      className="fixed inset-0 z-40 grid place-items-center bg-crust/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <motion.div
        role="dialog"
        aria-label={single?.name ?? t("props.itemsTitle", { n: entries.length })}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12 } }}
        transition={spring}
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col items-center gap-4 overflow-y-auto rounded-[2.5rem] bg-mantle px-6 pt-7 pb-6 shadow-2xl ring-1 ring-surface0"
      >
        {single ? (
          <PropertiesSingle
            key={single.path}
            entry={single}
            target={target}
            onNavigate={(path, focus) => {
              onClose();
              onNavigate(path, focus);
            }}
            onCopy={onCopy}
            flash={flash}
          />
        ) : (
          <PropertiesSummary entries={entries} target={target} />
        )}
        <PillButton className="h-11 w-full justify-center" onClick={onClose}>
          {t("common.close")}
        </PillButton>
      </motion.div>
    </motion.div>
  );
}
