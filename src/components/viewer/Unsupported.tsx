import { Download, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useT } from "../../i18n/index.tsx";
import type { FileEntry } from "../../types.ts";
import { PillButton, spring } from "../ui.tsx";
import { FileIcon } from "../views/index.ts";

/** 无法在页面内查看时的提示：文件图标、原因和下载按钮 */
export function Unsupported({ entry, text, onDownload }: { entry: FileEntry; text: string; onDownload: () => void }) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
      className="grid size-full place-items-center p-6"
    >
      <div className="flex max-w-sm flex-col items-center gap-5 text-center">
        <FileIcon entry={entry} size="size-32" stroke={1.4} />
        <p className="text-sm font-semibold text-subtext0 wrap-anywhere">{text}</p>
        <PillButton tone="accent" icon={<Download className="size-4" />} onClick={onDownload}>
          {t("files.download")}
        </PillButton>
      </div>
    </motion.div>
  );
}

/** 加载中的转圈，稍等片刻才出现，避免一闪而过 */
export function Spinner() {
  const t = useT();
  return (
    <motion.div
      role="status"
      aria-label={t("viewer.loading")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.15 } }}
      className="pointer-events-none absolute inset-0 grid place-items-center text-subtext0"
    >
      <span className="grid size-14 place-items-center rounded-circle bg-crust/60 backdrop-blur-sm">
        <Loader2 className="size-7 animate-spin" />
      </span>
    </motion.div>
  );
}
