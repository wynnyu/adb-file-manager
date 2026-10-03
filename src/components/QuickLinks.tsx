import { motion } from "motion/react";
import { Camera, Download, FileText, Home, Image, Music, Video } from "lucide-react";

const links = [
  { label: "内部存储", path: "/sdcard", Icon: Home, color: "text-accent" },
  { label: "下载", path: "/sdcard/Download", Icon: Download, color: "text-blue" },
  { label: "相机", path: "/sdcard/DCIM", Icon: Camera, color: "text-pink" },
  { label: "图片", path: "/sdcard/Pictures", Icon: Image, color: "text-flamingo" },
  { label: "视频", path: "/sdcard/Movies", Icon: Video, color: "text-peach" },
  { label: "音乐", path: "/sdcard/Music", Icon: Music, color: "text-teal" },
  { label: "文档", path: "/sdcard/Documents", Icon: FileText, color: "text-yellow" },
];

export function QuickLinks({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
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
              className={`relative grid size-6 place-items-center rounded-[50%] bg-crust/60 transition-transform duration-300 group-hover:rotate-[-12deg] group-hover:scale-110 ${color}`}
            >
              <Icon className="size-3.5" />
            </span>
            <span className="relative">{label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
