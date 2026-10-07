import type { MessageKey } from "../../../i18n/index.tsx";
import { useT } from "../../../i18n/index.tsx";

export type BadgeKind = "system" | "disabled" | "uninstalled";

/** 系统用中性色，已停用用橙色，已卸载用红色 */
const TONES: Record<BadgeKind, string> = {
  system: "bg-surface1 text-subtext0",
  disabled: "bg-peach/15 text-peach",
  uninstalled: "bg-red/15 text-red",
};

/** 应用状态标签 */
export function AppBadge({ kind, label }: { kind: BadgeKind; label?: MessageKey }) {
  const t = useT();
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${TONES[kind]}`}>
      {t(label ?? `apps.badge.${kind}`)}
    </span>
  );
}
