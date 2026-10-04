import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

type Params = Record<string, string | number>;

/** 文案里的 {name} 占位；params.n === 1 且存在 `${key}_one` 时用单数形式 */
function format(lang: Lang, key: MessageKey, params?: Params) {
  const dict = DICTS[lang];
  const one = params?.n === 1 ? dict[`${key}_one`] : undefined;
  const tpl = one ?? dict[key] ?? zh[key];
  return params ? tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : tpl;
}

type Tags = Record<string, (children: string) => ReactNode>;

/** 把 `<b>文字</b>` 这样的标记交给 tags 渲染；其余部分原样输出 */
function renderRich(text: string, tags: Tags): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(\w+)>(.*?)<\/\1>/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(render ? <span key={m.index}>{render(m[2])}</span> : m[2]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export type T = (key: MessageKey, params?: Params) => string;
export type Rich = (key: MessageKey, tags: Tags, params?: Params) => ReactNode;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  rich: Rich;
}

const Ctx = createContext<I18n | null>(null);

/** React 之外（api.ts 等）用；随 Provider 同步 */
let current: Lang = "zh";
export const getLang = () => current;
export const tr: T = (key, params) => format(current, key, params);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (current = detect()));

  const setLang = useCallback((l: Lang) => {
    current = l;
    savePref(LANG_KEY, l);
    setLangState(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => format(lang, key, params),
      rich: (key, tags, params) => renderRich(format(lang, key, params), tags),
    }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n 必须在 I18nProvider 内使用");
  return v;
}

export const useT = () => useI18n().t;
