import type { Lang, T } from "../i18n/translate.ts";

export function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** 播放时间：不到一小时写作 3:07，否则 1:02:07；时长未知时为 --:-- */
export function formatDuration(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "--:--";
  const s = Math.floor(sec);
  const [h, m, r] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const dtfs = new Map<string, Intl.DateTimeFormat>();

function dtf(locale: string, opts: Intl.DateTimeFormatOptions) {
  const key = locale + JSON.stringify(opts);
  let f = dtfs.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dtfs.set(key, f);
  }
  return f;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * 访达式日期：今天、昨天的只写“今天 下午8:10”，其余“2026/9/10 下午8:10”。
 * long 为 true 时写全“2026年9月10日 下午8:10”，用在信息面板
 */
export function formatDate(sec: number, lang: Lang, t: T, long = false) {
  if (!sec) return "--";
  const d = new Date(sec * 1000);
  const zh = lang === "zh";
  const locale = zh ? "zh-CN" : "en-GB";
  const time = dtf(zh ? "zh-CN" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days === 0) return t("date.today", { time });
  if (days === 1) return t("date.yesterday", { time });
  const date = dtf(locale, { year: "numeric", month: long ? "long" : zh ? "numeric" : "short", day: "numeric" }).format(
    d,
  );
  return t("date.at", { date, time });
}

export function joinPath(dir: string, name: string) {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(p: string) {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
