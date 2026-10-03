import { flushSync } from "react-dom";
import { loadPref, savePref } from "./prefs.ts";

// 键名和取值要和 index.html 里首帧前执行的内联脚本保持一致
const FLAVOR_KEY = "afm.flavor";
const ACCENT_KEY = "afm.accent";

export const FLAVORS = [
  { id: "latte", name: "Latte" },
  { id: "frappe", name: "Frappé" },
  { id: "macchiato", name: "Macchiato" },
  { id: "mocha", name: "Mocha" },
] as const;

export const ACCENTS = [
  { id: "mauve", name: "Mauve" },
  { id: "peach", name: "Peach" },
  { id: "green", name: "Green" },
  { id: "blue", name: "Blue" },
  { id: "rosewater", name: "Rosewater" },
] as const;

export type Flavor = (typeof FLAVORS)[number]["id"];
export type Accent = (typeof ACCENTS)[number]["id"];
export interface Theme {
  flavor: Flavor;
  accent: Accent;
}

const lightQuery = () => matchMedia("(prefers-color-scheme: light)");

export const systemFlavor = (): Flavor => (lightQuery().matches ? "latte" : "mocha");

/** 用户手动选过的口味；没选过返回 null，表示跟随系统 */
export function storedFlavor(): Flavor | null {
  const f = loadPref<unknown>(FLAVOR_KEY, null);
  return FLAVORS.some((x) => x.id === f) ? (f as Flavor) : null;
}

/** 内联脚本已在首帧前写好 data-*，直接从 <html> 读，保证一致 */
export function currentTheme(): Theme {
  const d = document.documentElement.dataset;
  return {
    flavor: FLAVORS.some((x) => x.id === d.flavor) ? (d.flavor as Flavor) : systemFlavor(),
    accent: ACCENTS.some((x) => x.id === d.accent) ? (d.accent as Accent) : "mauve",
  };
}

export function saveTheme(patch: Partial<Theme>) {
  if (patch.flavor) savePref(FLAVOR_KEY, patch.flavor);
  if (patch.accent) savePref(ACCENT_KEY, patch.accent);
}

export function onSystemFlavorChange(cb: (f: Flavor) => void) {
  const mq = lightQuery();
  const listener = () => cb(systemFlavor());
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

/**
 * 切换主题。传了 from 时用 View Transition 让新画面从该点圆形扩散到整页；
 * 浏览器不支持或用户开了减少动态效果时直接切换。
 */
export function switchTheme(next: Theme, onCommit: (t: Theme) => void, from?: { x: number; y: number }) {
  const root = document.documentElement;
  const commit = () => {
    root.dataset.flavor = next.flavor;
    root.dataset.accent = next.accent;
    flushSync(() => onCommit(next));
  };

  if (!from || !document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }

  const { x, y } = from;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add("theme-switching");
  const vt = document.startViewTransition(commit);
  vt.ready
    .then(() =>
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
  const done = () => root.classList.remove("theme-switching");
  vt.finished.then(done, done);
}
