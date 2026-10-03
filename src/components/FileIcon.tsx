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

const groups: [RegExp, typeof File, string][] = [
  [/\.(jpe?g|png|gif|webp|heic|heif|bmp|svg|avif|dng|raw)$/i, FileImage, "bg-pink/15 text-pink"],
  [/\.(mp4|mkv|mov|avi|webm|3gp|m4v|flv|ts)$/i, FileVideo, "bg-peach/15 text-peach"],
  [/\.(mp3|flac|wav|aac|ogg|opus|m4a|amr|ape)$/i, FileAudio, "bg-teal/15 text-teal"],
  [/\.(apk|apks|xapk|aab)$/i, Package, "bg-green/15 text-green"],
  [/\.(zip|rar|7z|tar|gz|tgz|xz|bz2|zst)$/i, FileArchive, "bg-yellow/15 text-yellow"],
  [/\.(txt|md|pdf|docx?|xlsx?|pptx?|csv|log|epub)$/i, FileText, "bg-blue/15 text-blue"],
  [/\.(json|xml|ya?ml|js|ts|py|sh|html|css|kt|java|c|cpp|rs|go|toml|ini|conf)$/i, FileCode, "bg-sapphire/15 text-sapphire"],
];

export function FileIcon({ entry, size = "size-10" }: { entry: FileEntry; size?: string }) {
  let Icon = File;
  let color = "bg-overlay0/20 text-overlay2";
  if (entry.isDir) {
    Icon = entry.type === "link" ? FolderSymlink : Folder;
    color = "bg-accent/15 text-accent";
  } else if (entry.type === "link") {
    Icon = Link2;
    color = "bg-flamingo/15 text-flamingo";
  } else {
    for (const [re, I, c] of groups) {
      if (re.test(entry.name)) {
        Icon = I;
        color = c;
        break;
      }
    }
  }
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-[50%] ${color}`}>
      <Icon className="size-[45%]" strokeWidth={2.2} />
    </span>
  );
}
