import { Plus, RotateCw, ShieldCheck } from "lucide-react";
import { IconButton, PillButton, SearchField, Segmented } from "../../../components/ui.tsx";
import { useT } from "../../../i18n/index.tsx";
import type { PropGroup } from "../types.ts";

const GROUPS: PropGroup[] = ["all", "ro", "persist", "sys", "init", "vendor", "other"];

/** 属性列表上方的工具行：新建、刷新、搜索、分组和数量；非 root 模式时提示可开启 root */
export function PropToolbar({
  loading,
  search,
  onSearchChange,
  group,
  onGroupChange,
  counts,
  shown,
  onRefresh,
  onAdd,
  rootMode,
  onAskRoot,
}: {
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  group: PropGroup;
  onGroupChange: (g: PropGroup) => void;
  /** 各分组的属性数量 */
  counts: Record<PropGroup, number>;
  /** 当前分组和搜索后显示的数量 */
  shown: number;
  onRefresh: () => void;
  onAdd: () => void;
  rootMode: boolean;
  onAskRoot: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PillButton tone="accent" icon={<Plus className="size-4" />} onClick={onAdd}>
        {t("prop.add")}
      </PillButton>
      <IconButton title={t("prop.refresh")} onClick={onRefresh}>
        <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
      </IconButton>
      <SearchField
        value={search}
        onChange={onSearchChange}
        placeholder={t("prop.search")}
        clearTitle={t("prop.clearSearch")}
      />
      <Segmented
        options={GROUPS.map((id) => ({ id, label: t(`prop.group.${id}`), count: counts[id] }))}
        value={group}
        onChange={onGroupChange}
        label={t("prop.groups")}
        layoutId="props-group-active"
      />
      {!rootMode && (
        <PillButton tone="ghost" icon={<ShieldCheck className="size-4" />} onClick={onAskRoot}>
          {t("prop.rootHint")}
        </PillButton>
      )}
      <span className="ml-auto text-sm text-subtext0 tabular-nums">{t("prop.count", { n: shown })}</span>
    </div>
  );
}
