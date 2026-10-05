import {
  Archive,
  Book,
  Bookmark,
  Briefcase,
  Camera,
  Cloud,
  Code,
  Database,
  Download,
  FileText,
  Folder,
  Gamepad2,
  Heart,
  Home,
  Image,
  type LucideIcon,
  MessageCircle,
  Music,
  Package,
  Smartphone,
  Star,
  Terminal,
  Video,
} from "lucide-react";
import { type BookmarkColor, isImageIcon } from "../../lib/bookmarks.ts";

/** 书签可选的图标库；键名会存进 localStorage，改名前要考虑旧数据 */
export const ICON_LIBRARY: Record<string, LucideIcon> = {
  home: Home,
  folder: Folder,
  download: Download,
  camera: Camera,
  image: Image,
  video: Video,
  music: Music,
  "file-text": FileText,
  book: Book,
  bookmark: Bookmark,
  star: Star,
  heart: Heart,
  archive: Archive,
  package: Package,
  smartphone: Smartphone,
  gamepad: Gamepad2,
  message: MessageCircle,
  briefcase: Briefcase,
  code: Code,
  terminal: Terminal,
  database: Database,
  cloud: Cloud,
};

export const colorVar = (c: BookmarkColor) => `var(--color-${c})`;

/**
 * 书签图标：图标库里的图标按所选颜色着色；上传的图片铺满圆形容器，不着色。
 * className 控制图标库图标的尺寸
 */
export function BookmarkGlyph({ icon, color, className }: { icon: string; color: BookmarkColor; className: string }) {
  if (isImageIcon(icon))
    return <img src={icon} alt="" className="absolute inset-0 size-full rounded-[50%] object-cover" />;
  const Icon = ICON_LIBRARY[icon] ?? Bookmark;
  return <Icon className={className} style={{ color: colorVar(color) }} />;
}
