import { Download, Eraser, type LucideIcon, Power, PowerOff, RotateCcw, Square, Trash2, Undo2 } from "lucide-react";
import { PillButton } from "../../../components/ui.tsx";
import { useT } from "../../../i18n/index.tsx";
import type { AppEntry } from "../../../types.ts";
import type { AppOpName, AppOps } from "../hooks/index.ts";

type Tone = "default" | "accent" | "danger" | "warn";

interface Action {
  key: string;
  label: Parameters<ReturnType<typeof useT>>[0];
  icon: LucideIcon;
  tone: Tone;
  onClick: () => void;
}

/** 应用详情顶部的操作按钮：按应用状态、是否系统应用、是否更新过系统应用决定显示哪些 */
export function AppActions({
  entry,
  updatedSystem,
  ops,
}: {
  entry: AppEntry;
  /** 系统应用已被更新过，才能卸载更新 */
  updatedSystem: boolean;
  ops: Pick<AppOps, "run" | "extract">;
}) {
  const t = useT();
  const run = (op: AppOpName, label: Action["label"], icon: LucideIcon, tone: Tone): Action => ({
    key: op,
    label,
    icon,
    tone,
    onClick: () => ops.run(op, entry),
  });
  const extract: Action = {
    key: "extract",
    label: "apps.action.extract",
    icon: Download,
    tone: "default",
    onClick: () => void ops.extract(entry),
  };
  const uninstall = run(
    "uninstall",
    entry.system ? "apps.action.uninstallUser" : "apps.action.uninstall",
    Trash2,
    "danger",
  );

  const actions: Action[] =
    entry.state === "uninstalled"
      ? [run("restore", "apps.action.restore", RotateCcw, "accent"), extract]
      : entry.state === "disabled"
        ? [
            run("enable", "apps.action.enable", Power, "accent"),
            run("clear", "apps.action.clear", Eraser, "warn"),
            uninstall,
            extract,
          ]
        : [
            run("stop", "apps.action.stop", Square, "default"),
            run("disable", "apps.action.disable", PowerOff, "warn"),
            run("clear", "apps.action.clear", Eraser, "warn"),
            uninstall,
            ...(updatedSystem ? [run("uninstallUpdates", "apps.action.uninstallUpdates", Undo2, "warn")] : []),
            extract,
          ];

  return (
    <fieldset className="flex min-w-0 flex-wrap gap-2">
      <legend className="sr-only">{t("apps.action.label")}</legend>
      {actions.map(({ key, label, icon: Icon, tone, onClick }) => (
        <PillButton key={key} tone={tone} icon={<Icon className="size-4" />} onClick={onClick}>
          {t(label)}
        </PillButton>
      ))}
    </fieldset>
  );
}
