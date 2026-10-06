import { defaultSchema } from "rehype-sanitize";

/**
 * 原始 HTML 的净化白名单，沿用 GitHub 风格的默认配置。默认配置已保留：
 * align（README 居中）、details / summary、img 的 width / height、code 的 language-* 类、
 * 脚注的 data-footnote-* 和 sr-only。script、style、事件属性以及 javascript: 和 data: 地址会被去掉。
 * 相对路径没有协议，不受协议白名单限制，由 MdLink 和 MdImage 自行解析
 */
export const SANITIZE_SCHEMA = defaultSchema;

export type LinkTarget =
  | { kind: "external"; href: string }
  | { kind: "anchor"; id: string }
  | { kind: "device"; path: string };

/** 解码失败（例如孤立的 %）时保持原样 */
function decode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** 按 baseDir 解析 . 和 ..，不会越过根目录 */
function resolvePath(baseDir: string, rel: string) {
  const parts = rel.startsWith("/") ? [] : baseDir.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join("/")}`;
}

/** 判断链接指向哪里：外部网址、文档内的锚点，或设备上的另一个文件（相对于 md 所在目录 baseDir） */
export function resolveLink(baseDir: string, href: string): LinkTarget {
  if (/^(https?:|mailto:|\/\/)/i.test(href)) return { kind: "external", href };
  if (href.startsWith("#")) return { kind: "anchor", id: decode(href.slice(1)) };
  const hash = href.indexOf("#");
  const noHash = hash === -1 ? href : href.slice(0, hash);
  const q = noHash.indexOf("?");
  const path = decode(q === -1 ? noHash : noHash.slice(0, q));
  if (!path) return { kind: "anchor", id: hash === -1 ? "" : decode(href.slice(hash + 1)) };
  return { kind: "device", path: resolvePath(baseDir, path) };
}

/** GitHub 规则的标题锚点：小写，去掉标点，空格转 -，保留中文 */
export function headingSlug(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/** 同一文档内按出现顺序生成锚点，重复的标题依次追加 -1、-2 */
export function slugger() {
  const used = new Map<string, number>();
  return (text: string) => {
    const base = headingSlug(text);
    let slug = base;
    let n = used.get(base) ?? 0;
    while (used.has(slug)) slug = `${base}-${++n}`;
    used.set(base, n);
    used.set(slug, 0);
    return slug;
  };
}
