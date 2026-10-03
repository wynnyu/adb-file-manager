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

const dtf = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatTime(sec: number) {
  return sec ? dtf.format(new Date(sec * 1000)) : "—";
}

export function joinPath(dir: string, name: string) {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(p: string) {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
