import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { MessageKey } from "../../i18n/index.tsx";
import { useT } from "../../i18n/index.tsx";
import { press, spring } from "../ui.tsx";

export interface ModuleNavItem {
  id: string;
  icon: LucideIcon;
  label: MessageKey;
}

/** 模块导航的数据：由 App 根据模块注册表生成，放进 ShellContext，外壳组件不直接导入 modules/ */
export interface ModuleNavState {
  items: ModuleNavItem[];
  current: string;
  onChange: (id: string) => void;
}

/** 主面板上方的模块切换，药丸形分段按钮；只有一个模块时不显示 */
export function ModuleNav({ items, current, onChange }: ModuleNavState) {
  const t = useT();
  if (items.length <= 1) return null;
  return (
    <nav
      aria-label={t("nav.label")}
      className="flex h-12 w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-surface0 p-1"
    >
      {items.map(({ id, icon: Icon, label }) => {
        const active = current === id;
        return (
          <motion.button
            key={id}
            type="button"
            aria-pressed={active}
            {...press}
            onClick={() => onChange(id)}
            className={`relative flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors ${
              active ? "text-on-accent" : "text-subtext0 hover:bg-surface1 hover:text-text"
            }`}
          >
            {active && (
              <motion.span
                layoutId="module-active"
                transition={spring}
                className="absolute inset-0 rounded-full bg-accent"
              />
            )}
            <Icon className="relative size-4" />
            <span className="relative">{t(label)}</span>
          </motion.button>
        );
      })}
    </nav>
  );
}
