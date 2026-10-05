import { Eye, EyeOff } from "lucide-react";
import { useT } from "../../i18n/index.tsx";
import { MOD } from "../../lib/entries.ts";
import { formatSize } from "../../lib/format.ts";
import type { FileEntry, StorageInfo } from "../../types.ts";

/** 状态栏，同访达窗口底部：项目数、隐藏文件开关和剩余空间 */
export function StatusBar({
  entries,
  shown,
  ready,
  showHidden,
  onToggleHidden,
  storage,
}: {
  /** 当前目录的全部条目，用于统计隐藏文件 */
  entries: FileEntry[];
  /** 筛选后显示出来的条目数 */
  shown: number;
  /** 当前目录已加载完成；未完成时不显示项目数 */
  ready: boolean;
  showHidden: boolean;
  onToggleHidden: () => void;
  storage: StorageInfo | null;
}) {
  const t = useT();
  const hiddenCount = entries.filter((e) => e.name.startsWith(".")).length;
  return (
    <footer className="-mb-1 flex min-h-8 flex-wrap items-center justify-between gap-x-4 border-t border-surface0 px-3 pt-3 text-xs text-subtext0">
      <span className="flex items-center gap-2">
        {ready &&
          (hiddenCount && !showHidden
            ? t("toolbar.countHidden", { n: shown, hidden: hiddenCount })
            : t("toolbar.count", { n: shown }))}
        {(hiddenCount > 0 || showHidden) && (
          <button
            type="button"
            aria-pressed={showHidden}
            title={`${MOD}⇧.`}
            onClick={onToggleHidden}
            className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-semibold transition-colors ${
              showHidden ? "bg-accent/15 text-accent hover:bg-accent/25" : "hover:bg-surface0 hover:text-text"
            }`}
          >
            {showHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {showHidden ? t("toolbar.hideHidden") : t("toolbar.showHidden")}
          </button>
        )}
      </span>
      {storage && <span>{t("toolbar.free", { size: formatSize(storage.free) })}</span>}
    </footer>
  );
}
