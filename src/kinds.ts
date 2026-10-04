import type { T } from "./i18n/index.tsx";
import type { MessageKey } from "./i18n/zh.ts";
import type { FileEntry } from "./types.ts";

/** 扩展名 → 访达式的「种类」文案，文案里的 {ext} 换成扩展名的显示名 */
const KINDS: [RegExp, MessageKey][] = [
  [/^(jpe?g|png|gif|webp|heic|heif|bmp|svg|avif|dng|raw|tiff?|ico)$/, "kind.imageOf"],
  [/^(mp4|mkv|mov|avi|webm|3gp|m4v|flv|ts|wmv)$/, "kind.videoOf"],
  [/^(mp3|flac|wav|aac|ogg|opus|m4a|amr|ape|wma|midi?)$/, "kind.audioOf"],
  [/^(apk|apks|xapk|aab)$/, "kind.apk"],
  [/^(zip|rar|7z|tar|gz|tgz|xz|bz2|zst|lz4)$/, "kind.archiveOf"],
  [/^(txt|log|text)$/, "kind.text"],
  [/^(img|iso|dmg|vhdx?|vmdk|qcow2)$/, "kind.diskImage"],
  [/^(sh|bash|py|js|mjs|lua|pl|rb|bat|ps1)$/, "kind.scriptOf"],
  [/^(c|h|cc|cpp|hpp|java|kt|rs|go|swift|dart|smali)$/, "kind.sourceOf"],
  [/^(pdf|md|docx?|xlsx?|pptx?|rtf|odt|epub|csv|json|xml|ya?ml|html?|css|toml|ini|conf|prop|rc)$/, "kind.documentOf"],
];

const EXT_NAMES: Record<string, string> = {
  jpg: "JPEG",
  jpeg: "JPEG",
  tif: "TIFF",
  mp4: "MPEG-4",
  m4v: "MPEG-4",
  m4a: "MPEG-4",
  mov: "QuickTime",
  mid: "MIDI",
  md: "Markdown",
  doc: "Word",
  docx: "Word",
  xls: "Excel",
  xlsx: "Excel",
  ppt: "PowerPoint",
  pptx: "PowerPoint",
  yml: "YAML",
  htm: "HTML",
  sh: "Shell",
  bash: "Shell",
  py: "Python",
  js: "JavaScript",
  mjs: "JavaScript",
  lua: "Lua",
  pl: "Perl",
  rb: "Ruby",
  kt: "Kotlin",
  rs: "Rust",
  go: "Go",
  java: "Java",
  swift: "Swift",
  dart: "Dart",
  cc: "C++",
  cpp: "C++",
  hpp: "C++",
  h: "C",
};

/** 访达列表「种类」一栏的文字，例如「PNG 图像」「纯文本文稿」「磁盘映像」 */
export function kindLabel(entry: FileEntry, t: T) {
  if (entry.isDir) return t("kind.folder");
  if (entry.type === "link") return t("kind.link");
  const dot = entry.name.lastIndexOf(".");
  // .nomedia 这类点开头、没有别的点的名字没有扩展名
  if (dot <= 0 || dot === entry.name.length - 1) return t("kind.file");
  const raw = entry.name.slice(dot + 1);
  const ext = raw.toLowerCase();
  const display = EXT_NAMES[ext] ?? raw.toUpperCase();
  const key = KINDS.find(([re]) => re.test(ext))?.[1] ?? "kind.fileOf";
  return t(key, { ext: display });
}
