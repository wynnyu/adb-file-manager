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

const dtfs = new Map<string, Intl.DateTimeFormat>();

export function formatTime(sec: number, lang: string) {
  if (!sec) return "—";
  const locale = lang === "zh" ? "zh-CN" : "en-GB";
  let dtf = dtfs.get(locale);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    dtfs.set(locale, dtf);
  }
  return dtf.format(new Date(sec * 1000));
}

export function joinPath(dir: string, name: string) {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(p: string) {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
