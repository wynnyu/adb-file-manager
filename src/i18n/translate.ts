import { loadPref, savePref } from "../lib/prefs.ts";
import { en } from "./en.ts";
import { type MessageKey, zh } from "./zh.ts";

export const LANGS = [
  { id: "zh", name: "中文" },
  { id: "en", name: "English" },
] as const;

export type Lang = (typeof LANGS)[number]["id"];

const DICTS: Record<Lang, Record<string, string>> = { zh, en };
const LANG_KEY = "afm.lang";

function detect(): Lang {
  const saved = loadPref<string | null>(LANG_KEY, null);
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export type Params = Record<string, string | number>;

/** 文案里的 {name} 占位；params.n === 1 且存在 `${key}_one` 时用单数形式 */
export function format(lang: Lang, key: MessageKey, params?: Params) {
  const dict = DICTS[lang];
  const one = params?.n === 1 ? dict[`${key}_one`] : undefined;
  const tpl = one ?? dict[key] ?? zh[key];
  return params ? tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : tpl;
}

export type T = (key: MessageKey, params?: Params) => string;

/** React 之外（api.ts 等）用；随 I18nProvider 同步 */
let current: Lang = "zh";
export const getLang = () => current;
export const tr: T = (key, params) => format(current, key, params);

/** 读取保存的语言，没有则按浏览器语言判断 */
export function initLang(): Lang {
  current = detect();
  return current;
}

/** 切换语言并保存 */
export function changeLang(l: Lang) {
  current = l;
  savePref(LANG_KEY, l);
}
