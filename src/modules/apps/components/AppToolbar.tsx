import { PackagePlus, RotateCw } from "lucide-react";
import { useRef } from "react";
import { IconButton, PillButton, SearchField, Segmented } from "../../../components/ui.tsx";
import { useT } from "../../../i18n/index.tsx";
import { INSTALL_EXTS } from "../lib/index.ts";
import type { AppFilter } from "../types.ts";

const FILTERS: AppFilter[] = ["all", "user", "system", "disabled", "uninstalled"];

/** 应用列表上方的工具行：刷新、搜索、筛选和数量 */
export function AppToolbar({
  loading,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  shown,
  onRefresh,
  onInstall,
}: {
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filter: AppFilter;
  onFilterChange: (f: AppFilter) => void;
  /** 各筛选项的应用数量 */
  counts: Record<AppFilter, number>;
  /** 当前筛选和搜索后显示的数量 */
  shown: number;
  onRefresh: () => void;
  /** 选好要安装的文件 */
  onInstall: (files: File[]) => void;
}) {
  const t = useT();
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PillButton tone="accent" icon={<PackagePlus className="size-4" />} onClick={() => picker.current?.click()}>
        {t("apps.install")}
      </PillButton>
      <input
        ref={picker}
        type="file"
        multiple
        accept={INSTALL_EXTS.join(",")}
        aria-label={t("apps.install.hint")}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          // 清空后再选同一个文件也会触发 change
          e.target.value = "";
          if (files.length) onInstall(files);
        }}
      />
      <IconButton title={t("apps.refresh")} onClick={onRefresh}>
        <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
      </IconButton>
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={t("apps.search")}
        clearTitle={t("apps.clearSearch")}
      />
      <Segmented
        options={FILTERS.map((id) => ({ id, label: t(`apps.filter.${id}`), count: counts[id] }))}
        value={filter}
        onChange={onFilterChange}
        label={t("apps.filter")}
        layoutId="apps-filter-active"
      />
      <span className="ml-auto text-sm text-subtext0 tabular-nums">{t("apps.count", { n: shown })}</span>
    </div>
  );
}
