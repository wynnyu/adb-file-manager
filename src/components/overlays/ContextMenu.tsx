import { ArrowBigUp, Check, Command, CornerDownLeft, Delete } from "lucide-react";
import { motion } from "motion/react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { IS_MAC } from "../../lib/index.ts";
import { spring } from "../ui.tsx";

export type MenuItem =
  | {
      /** label 可能重复时（如同名书签）用它做 key */
      id?: string;
      label: string;
      icon?: ReactNode;
      /** 右侧的快捷键提示，按顺序列出各个键 */
      shortcut?: Key[];
      danger?: boolean;
      disabled?: boolean;
      /** 单选 / 开关项：true 显示对勾 */
      checked?: boolean;
      onSelect: () => void;
      /** 右键该项，如在“更多”菜单里右键书签打开书签菜单 */
      onContextMenu?: (e: MouseEvent) => void;
    }
  | "sep";

/** 特殊键用图标显示，其余按原样显示文字，如 "X"、"F2" */
export type Key = "mod" | "shift" | "enter" | "backspace" | (string & {});

const KEY_ICONS: Partial<Record<Key, ReactNode>> = {
  enter: <CornerDownLeft className="size-3.5" />,
  backspace: <Delete className="size-3.5" />,
  ...(IS_MAC && {
    mod: <Command className="size-3.5" />,
    shift: <ArrowBigUp className="size-3.5" />,
  }),
};

const KEY_TEXT: Partial<Record<Key, string>> = { mod: "Ctrl+", shift: "Shift+", alt: "Alt+" };

function Shortcut({ keys }: { keys: Key[] }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 pl-4 text-xs font-medium text-muted">
      {keys.map((k) => (
        <span key={k} className="grid min-w-3.5 place-items-center">
          {KEY_ICONS[k] ?? KEY_TEXT[k] ?? k}
        </span>
      ))}
    </span>
  );
}

export interface MenuState {
  x: number;
  y: number;
  /** end：菜单右边缘对齐 x，用于靠右的按钮 */
  align?: "end";
  items: MenuItem[];
}

const EDGE = 8;

/** 自定义右键菜单：贴着指针弹出，碰到窗口边缘就往反方向翻 */
export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y, originX: 0, originY: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const flipX = menu.align === "end" ? menu.x - width >= EDGE : menu.x + width > innerWidth - EDGE;
    const flipY = menu.y + height > innerHeight - EDGE;
    setPos({
      left: Math.max(EDGE, flipX ? menu.x - width : menu.x),
      top: Math.max(EDGE, flipY ? Math.min(menu.y - height, innerHeight - EDGE - height) : menu.y),
      originX: flipX ? 1 : 0,
      originY: flipY ? 1 : 0,
    });
    el.focus();
  }, [menu]);

  useEffect(() => {
    const outside = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 别让外层的 Esc（清空选择）也跟着触发
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("scroll", outside, true);
    window.addEventListener("keydown", esc, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("scroll", outside, true);
      window.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // 上下方向键在可用项之间移动焦点
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? buttons.length - 1
          : e.key === "ArrowDown"
            ? (i + 1) % buttons.length
            : (i - 1 + buttons.length) % buttons.length;
    buttons[next].focus();
  };

  const hasChecks = menu.items.some((i) => i !== "sep" && i.checked !== undefined);

  return (
    <motion.div
      ref={ref}
      role="menu"
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
      transition={spring}
      style={{ left: pos.left, top: pos.top, originX: pos.originX, originY: pos.originY }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
      className="fixed z-50 flex max-h-[calc(100dvh-1rem)] min-w-56 flex-col overflow-y-auto rounded-3xl bg-mantle/95 p-1.5 shadow-2xl shadow-crust ring-1 ring-surface0 outline-none backdrop-blur-md"
    >
      {menu.items.map((item, i) =>
        item === "sep" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: 分隔线是静态的，没有别的可用作 key
          <div key={`sep-${i}`} className="mx-3 my-1 h-px shrink-0 bg-surface0" />
        ) : (
          <button
            key={item.id ?? item.label}
            type="button"
            role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            onContextMenu={item.onContextMenu}
            className={`flex h-9 shrink-0 items-center gap-3 rounded-full pr-4 pl-3 text-left text-sm font-semibold outline-none transition-colors disabled:pointer-events-none disabled:opacity-40 ${
              item.danger
                ? "text-red hover:bg-red/15 focus-visible:bg-red/15"
                : "hover:bg-surface0 focus-visible:bg-surface0"
            }`}
          >
            {hasChecks && (
              <span className="grid size-4 shrink-0 place-items-center text-accent">
                {item.checked && <Check className="size-4" strokeWidth={3} />}
              </span>
            )}
            <span className={`grid size-4 shrink-0 place-items-center ${item.danger ? "" : "text-subtext0"}`}>
              {item.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut && <Shortcut keys={item.shortcut} />}
          </button>
        ),
      )}
    </motion.div>
  );
}
