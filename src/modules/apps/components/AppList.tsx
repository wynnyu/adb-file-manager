import { Loader2, Package, SearchX, TriangleAlert } from "lucide-react";
import { motion } from "motion/react";
import { Placeholder, spring } from "../../../components/ui.tsx";
import { useT } from "../../../i18n/index.tsx";
import type { AppEntry } from "../../../types.ts";
import { AppBadge } from "./AppBadge.tsx";

/** 应用列表；每行是一个按钮，点击选中并在详情面板显示 */
export function AppList({
  apps,
  selected,
  loading,
  error,
  onSelect,
}: {
  apps: AppEntry[];
  /** 选中应用的包名 */
  selected: string | null;
  /** 首次加载中，列表还没有数据 */
  loading: boolean;
  error: string | null;
  onSelect: (pkg: string) => void;
}) {
  const t = useT();
  const animateLayout = apps.length <= 200;

  if (error) return <Placeholder icon={<TriangleAlert className="size-7" />} text={error} tone="bg-red/15 text-red" />;
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-muted" role="status">
        <Loader2 className="size-7 animate-spin" />
        <span className="text-sm">{t("apps.loading")}</span>
      </div>
    );
  }
  if (apps.length === 0) return <Placeholder icon={<SearchX className="size-7" />} text={t("apps.empty")} />;

  return (
    <div className="flex flex-col gap-1">
      {apps.map((app) => {
        const active = app.pkg === selected;
        return (
          <motion.button
            key={app.pkg}
            type="button"
            aria-pressed={active}
            layout={animateLayout ? "position" : false}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.12 } }}
            transition={spring}
            onClick={() => onSelect(app.pkg)}
            className={`flex items-center gap-3 rounded-full py-1.5 pr-4 pl-1.5 text-left transition-colors ${
              active ? "bg-accent/15 ring-1 ring-accent/40" : "even:bg-base/60 hover:bg-surface0/70"
            }`}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-circle bg-surface0 text-subtext0">
              <Package className="size-[45%]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{app.pkg}</span>
              <span className="block truncate text-xs text-muted">{app.path}</span>
            </span>
            {app.system && <AppBadge kind="system" />}
            {app.state !== "enabled" && <AppBadge kind={app.state} />}
          </motion.button>
        );
      })}
    </div>
  );
}
