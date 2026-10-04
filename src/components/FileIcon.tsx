import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileText,
  FileVideo,
  Folder,
  FolderSymlink,
  Link2,
  Package,
} from "lucide-react";
import type { FileEntry } from "../types.ts";

export type FileKind =
  | "folder"
  | "link"
  | "image"
  | "video"
  | "audio"
  | "apk"
  | "archive"
  | "document"
  | "code"
  | "file";

const groups: [RegExp, FileKind, typeof File, string][] = [
  [/\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|avif|dng|raw)$/i, "image", FileImage, "bg-pink/15 text-pink"],
  [/\.(mp4|mkv|mov|avi|webm|3gp|m4v|flv|ts)$/i, "video", FileVideo, "bg-peach/15 text-peach"],
  [/\.(mp3|flac|wav|aac|ogg|opus|m4a|amr|ape)$/i, "audio", FileAudio, "bg-teal/15 text-teal"],
  [/\.(apk|apks|xapk|aab)$/i, "apk", Package, "bg-green/15 text-green"],
  [/\.(zip|rar|7z|tar|gz|tgz|xz|bz2|zst)$/i, "archive", FileArchive, "bg-yellow/15 text-yellow"],
  [/\.(txt|md|pdf|docx?|xlsx?|pptx?|csv|log|epub)$/i, "document", FileText, "bg-blue/15 text-blue"],
  [
    /\.(json|xml|ya?ml|js|ts|py|sh|html|css|kt|java|c|cpp|rs|go|toml|ini|conf)$/i,
    "code",
    FileCode,
    "bg-sapphire/15 text-sapphire",
  ],
];

function classify(entry: FileEntry): { kind: FileKind; Icon: typeof File; color: string } {
  if (entry.isDir) {
    return { kind: "folder", Icon: entry.type === "link" ? FolderSymlink : Folder, color: "bg-accent/15 text-accent" };
  }
  if (entry.type === "link") return { kind: "link", Icon: Link2, color: "bg-flamingo/15 text-flamingo" };
  for (const [re, kind, Icon, color] of groups) {
    if (re.test(entry.name)) return { kind, Icon, color };
  }
  return { kind: "file", Icon: File, color: "bg-overlay0/20 text-overlay2" };
}

/** 浏览器能直接显示、分栏预览里可以加载缩略图的图片 */
export const isPreviewable = (entry: FileEntry) =>
  !entry.isDir &&
  entry.size > 0 &&
  entry.size <= 30 * 1024 * 1024 &&
  /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(entry.name);

export function FileIcon({
  entry,
  size = "size-10",
  stroke = 2.2,
  onAccent = false,
}: {
  entry: FileEntry;
  size?: string;
  stroke?: number;
  /** 放在强调色底上（分栏视图的选中行）：用反色，不然文件夹图标和底色一样看不见 */
  onAccent?: boolean;
}) {
  const { Icon, color } = classify(entry);
  return (
    <span
      className={`grid ${size} shrink-0 place-items-center rounded-[50%] ${onAccent ? "bg-on-accent/15 text-on-accent" : color}`}
    >
      <Icon className="size-[45%]" strokeWidth={stroke} />
    </span>
  );
}
