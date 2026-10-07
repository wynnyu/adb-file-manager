import { PackagePlus, RotateCw, Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { IconButton, PillButton, press, spring } from "../../../components/ui.tsx";
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
      <label className="flex h-10 min-w-40 flex-1 items-center gap-2 rounded-full bg-base px-4 text-subtext0 focus-within:ring-2 focus-within:ring-accent/60 sm:max-w-72 sm:flex-none">
        <Search className="size-4 shrink-0" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("apps.search")}
          aria-label={t("apps.search")}
          className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted"
        />
        {search && (
          <button
            type="button"
            title={t("apps.clearSearch")}
            aria-label={t("apps.clearSearch")}
            onClick={() => onSearchChange("")}
            className="grid size-5 place-items-center rounded-circle hover:bg-surface0"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>
      <div
        role="radiogroup"
        aria-label={t("apps.filter")}
        className="flex h-10 max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-full bg-surface0 p-1"
      >
        {FILTERS.map((id) => {
          const active = filter === id;
          return (
            <motion.button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              {...press}
              onClick={() => onFilterChange(id)}
              className={`relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-bold transition-colors ${
                active ? "text-on-accent" : "text-subtext0 hover:bg-surface1 hover:text-text"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="apps-filter-active"
                  transition={spring}
                  className="absolute inset-0 rounded-full bg-accent"
                />
              )}
              <span className="relative">{t(`apps.filter.${id}`)}</span>
              <span className={`relative text-xs tabular-nums ${active ? "text-on-accent/80" : "text-muted"}`}>
                {counts[id]}
              </span>
            </motion.button>
          );
        })}
      </div>
      <span className="ml-auto text-sm text-subtext0 tabular-nums">{t("apps.count", { n: shown })}</span>
    </div>
  );
}
