import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { changeLang, format, initLang, type Lang, type Params, type T } from "./translate.ts";
import type { MessageKey } from "./zh.ts";

export * from "./translate.ts";
export type { MessageKey } from "./zh.ts";

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

export type Rich = (key: MessageKey, tags: Tags, params?: Params) => ReactNode;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  rich: Rich;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initLang);

  const setLang = useCallback((l: Lang) => {
    changeLang(l);
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
