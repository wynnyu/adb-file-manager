import { type HTMLMotionProps, motion } from "motion/react";
import type { ReactNode } from "react";

type Tone = "default" | "accent" | "danger" | "warn" | "ghost" | "ghost-danger";

const tones: Record<Tone, string> = {
  default: "bg-surface0 text-text hover:bg-surface1",
  accent: "bg-accent text-on-accent hover:bg-accent-hover shadow-lg shadow-accent/15 hover:shadow-accent-hover/25",
  danger: "bg-red/15 text-red hover:bg-red hover:text-crust",
  warn: "bg-peach/15 text-peach hover:bg-peach hover:text-crust",
  ghost: "text-subtext0 hover:bg-surface0 hover:text-text",
  /** 平时同 ghost，悬停时变红：用于列表行里不想太醒目的删除按钮 */
  "ghost-danger": "text-subtext0 hover:bg-red/15 hover:text-red",
};

/** 默认弹簧：按压反馈、面板和指示条的位移 */
export const spring = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 } as const;
/** 带回弹的弹簧：勾选标记、图标弹出 */
export const springPop = { type: "spring", stiffness: 550, damping: 20 } as const;
/** 缓慢的弹簧：页面元素入场 */
export const springSlow = { type: "spring", stiffness: 80, damping: 18 } as const;

/** 按压反馈按元素大小分三档：胶囊按钮缩得少，小色块缩得多 */
export const pressLarge = { whileTap: { scale: 0.94 }, transition: spring };
export const press = { whileTap: { scale: 0.9 }, transition: spring };
export const pressSmall = { whileTap: { scale: 0.85 }, transition: spring };

interface Props extends HTMLMotionProps<"button"> {
  tone?: Tone;
}

/** 50% 圆形图标按钮 */
export function IconButton({ tone = "default", className = "", title, ...rest }: Props) {
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      {...press}
      className={`inline-grid size-10 shrink-0 place-items-center rounded-circle transition-colors disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    />
  );
}

/** 9999px 胶囊按钮 */
export function PillButton({
  tone = "default",
  icon,
  className = "",
  children,
  ...rest
}: Props & { icon?: ReactNode; children?: ReactNode }) {
  return (
    <motion.button
      type="button"
      {...pressLarge}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-[background-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
}

/** 居中的占位提示：空结果、错误等；icon 放在圆形底色里，tone 决定底色和图标颜色 */
export function Placeholder({
  icon,
  text,
  tone = "bg-surface0 text-muted",
}: {
  icon: ReactNode;
  text: string;
  tone?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="flex flex-col items-center gap-3 py-20 text-center"
    >
      <span className={`grid size-16 place-items-center rounded-circle ${tone}`}>{icon}</span>
      <p className="max-w-md font-semibold">{text}</p>
    </motion.div>
  );
}
