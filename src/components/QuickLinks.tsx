import { motion } from "motion/react";
import { useT } from "../i18n/index.tsx";
import type { MessageKey } from "../i18n/zh.ts";
import { Camera, Download, FileText, Home, Image, Music, Video } from "lucide-react";

const links: { label: MessageKey; path: string; Icon: typeof Home; color: string }[] = [
  { label: "quick.internal", path: "/sdcard", Icon: Home, color: "text-accent" },
  { label: "quick.downloads", path: "/sdcard/Download", Icon: Download, color: "text-blue" },
  { label: "quick.camera", path: "/sdcard/DCIM", Icon: Camera, color: "text-pink" },
  { label: "quick.pictures", path: "/sdcard/Pictures", Icon: Image, color: "text-flamingo" },
  { label: "quick.movies", path: "/sdcard/Movies", Icon: Video, color: "text-peach" },
  { label: "quick.music", path: "/sdcard/Music", Icon: Music, color: "text-teal" },
  { label: "quick.documents", path: "/sdcard/Documents", Icon: FileText, color: "text-yellow" },
];

export function QuickLinks({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const t = useT();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
      {links.map(({ label, path: p, Icon, color }) => {
        const active = path === p;
        return (
          <motion.button
            key={p}
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => onNavigate(p)}
            className={`group relative flex h-9 shrink-0 items-center gap-2 rounded-full bg-base pr-4 pl-1.5 text-sm font-semibold transition-colors ${
              active ? "text-text" : "text-subtext0 hover:bg-surface0 hover:text-text"
            }`}
          >
            {active && (
              <motion.span
                layoutId="quick-active"
                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                className="absolute inset-0 rounded-full bg-surface1"
              />
            )}
            <span
              className={`relative grid size-6 place-items-center rounded-[50%] bg-crust/60 ${color}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="relative">{t(label)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
