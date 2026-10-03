import { motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

type Tone = "default" | "accent" | "danger" | "ghost";

const tones: Record<Tone, string> = {
  default: "bg-surface0 text-text hover:bg-surface1",
  accent: "bg-accent text-crust hover:bg-accent-hover shadow-lg shadow-accent/15 hover:shadow-accent-hover/25",
  danger: "bg-red/15 text-red hover:bg-red/25",
  ghost: "text-subtext0 hover:bg-surface0 hover:text-text",
};

export const spring = { type: "spring", stiffness: 500, damping: 30, mass: 0.6 } as const;
export const press = { whileTap: { scale: 0.88 }, transition: spring };

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
      className={`inline-grid size-10 shrink-0 place-items-center rounded-[50%] transition-colors disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
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
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.94, y: 0 }}
      transition={spring}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-[background-color,color,box-shadow] disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </motion.button>
  );
}
