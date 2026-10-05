import { FolderUp, Shield, ShieldAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useT } from "../../i18n/index.tsx";
import { formatSize } from "../../lib/format.ts";
import type { Device, StorageInfo } from "../../types.ts";
import { press, springPop, springSlow } from "../ui.tsx";
import { DeviceSelect } from "./DeviceSelect.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { ThemePicker } from "./ThemePicker.tsx";

/** 顶栏：应用名和 ROOT 标记、存储用量，右侧是 root 开关、设备、语言和主题 */
export function Header({
  online,
  rootMode,
  onToggleRoot,
  storage,
  devices,
  serial,
  onSerialChange,
}: {
  online: boolean;
  rootMode: boolean;
  onToggleRoot: () => void;
  storage: StorageInfo | null;
  devices: Device[];
  serial: string | null;
  onSerialChange: (serial: string) => void;
}) {
  const t = useT();
  return (
    <header className="mb-2 flex items-center justify-between gap-3 sm:mb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-[50%] bg-accent text-on-accent shadow-lg shadow-accent/20">
          <FolderUp className="size-6" strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <span className="truncate">{t("app.name")}</span>
            <AnimatePresence>
              {rootMode && online && (
                <motion.span
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 20 }}
                  transition={springPop}
                  className="hidden shrink-0 rounded-full bg-accent px-2.5 py-0.5 font-mono sm:inline text-xs font-semibold tracking-widest text-on-accent shadow-lg shadow-accent/30"
                >
                  ROOT
                </motion.span>
              )}
            </AnimatePresence>
          </h1>
          <StorageMeter storage={storage} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {online && (
          <motion.button
            type="button"
            title={rootMode ? t("toolbar.rootOff") : t("toolbar.rootOn")}
            aria-label={rootMode ? t("toolbar.rootOff") : t("toolbar.rootOn")}
            aria-pressed={rootMode}
            {...press}
            onClick={onToggleRoot}
            className={`grid size-12 place-items-center rounded-[50%] transition-colors ${
              rootMode
                ? "bg-red/15 text-red ring-2 ring-red/60 hover:bg-red hover:text-crust"
                : "bg-surface0 text-accent hover:bg-surface1"
            }`}
          >
            {rootMode ? <ShieldAlert className="size-5" /> : <Shield className="size-5" />}
          </motion.button>
        )}
        <DeviceSelect devices={devices} serial={serial} onChange={onSerialChange} />
        <LanguagePicker />
        <ThemePicker />
      </div>
    </header>
  );
}

function StorageMeter({ storage }: { storage: StorageInfo | null }) {
  const t = useT();
  const pct = storage ? ((storage.total - storage.free) / storage.total) * 100 : 0;
  const nearlyFull = pct > 90;
  return (
    <AnimatePresence initial={false}>
      {storage && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="flex items-center gap-2 text-xs text-subtext0"
          title={t("toolbar.free", { size: formatSize(storage.free) })}
        >
          <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface0">
            <motion.span
              className={`block h-full rounded-full transition-colors ${nearlyFull ? "bg-red" : "bg-accent"}`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ ...springSlow, delay: 0.3 }}
            />
          </span>
          <span className="font-mono whitespace-nowrap">
            {formatSize(storage.total - storage.free)} / {formatSize(storage.total)}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
