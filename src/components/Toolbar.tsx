import { ArrowUp, ChevronDown, FolderPlus, FolderUp, RotateCw, Search, Upload, X } from "lucide-react";
import { motion } from "motion/react";
import { parentPath } from "../format.ts";
import { useT } from "../i18n/index.tsx";
import type { ViewMode } from "../types.ts";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import type { MenuState } from "./ContextMenu.tsx";
import { IconButton, spring } from "./ui.tsx";
import { ViewSwitch } from "./ViewSwitch.tsx";

/** 文件区上方的工具行：上一级、刷新、路径、筛选、显示方式、新建文件夹和上传 */
export function Toolbar({
  path,
  loading,
  filter,
  onFilterChange,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onMkdir,
  onUpload,
  onMenu,
}: {
  path: string;
  loading: boolean;
  filter: string;
  onFilterChange: (v: string) => void;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  onNavigate: (p: string) => void;
  onRefresh: () => void;
  onMkdir: () => void;
  onUpload: (kind: "files" | "folder") => void;
  onMenu: (menu: MenuState) => void;
}) {
  const t = useT();
  return (
    // 按容器宽度分档：路径 @4xl 起并入工具行，显示方式 @2xl 起展开，筛选 @md 起并入工具行
    <div className="@container flex flex-wrap items-center gap-2">
      <IconButton title={t("toolbar.up")} disabled={path === "/"} onClick={() => onNavigate(parentPath(path))}>
        <ArrowUp className="size-5" />
      </IconButton>
      <IconButton title={t("toolbar.refresh")} onClick={onRefresh}>
        <RotateCw className={`size-5 ${loading ? "animate-spin" : ""}`} />
      </IconButton>
      <div className="order-2 flex min-w-0 basis-full @4xl:order-none @4xl:basis-0 @4xl:flex-1">
        <Breadcrumbs path={path} onNavigate={onNavigate} />
      </div>
      <label className="order-1 flex h-10 basis-full items-center gap-2 rounded-full bg-base px-4 text-subtext0 focus-within:ring-2 focus-within:ring-accent/60 @md:order-none @md:min-w-28 @md:flex-1 @md:basis-0 @4xl:w-48 @4xl:flex-none">
        <Search className="size-4 shrink-0" />
        <input
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder={t("toolbar.filter")}
          className="w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted"
        />
        {filter && (
          <button
            type="button"
            onClick={() => onFilterChange("")}
            className="grid size-5 place-items-center rounded-[50%] hover:bg-surface0"
          >
            <X className="size-3.5" />
          </button>
        )}
      </label>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ViewSwitch view={view} onChange={onViewChange} onMenu={onMenu} />
        <IconButton title={t("toolbar.newFolder")} onClick={onMkdir}>
          <FolderPlus className="size-5" />
        </IconButton>
        <div className="flex shrink-0 rounded-full shadow-lg shadow-accent/15">
          <motion.button
            type="button"
            title={t("toolbar.uploadFiles")}
            aria-label={t("toolbar.uploadFiles")}
            whileTap={{ scale: 0.94 }}
            transition={spring}
            onClick={() => onUpload("files")}
            className="inline-flex h-10 items-center gap-2 rounded-l-full bg-accent pr-3 pl-3.5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-hover @sm:pl-4"
          >
            <Upload className="size-4" />
            <span className="hidden @sm:inline">{t("toolbar.upload")}</span>
          </motion.button>
          <motion.button
            type="button"
            title={t("toolbar.uploadMore")}
            aria-label={t("toolbar.uploadMore")}
            aria-haspopup="menu"
            whileTap={{ scale: 0.94 }}
            transition={spring}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onMenu({
                x: r.right,
                y: r.bottom + 6,
                align: "end",
                items: [
                  {
                    label: t("toolbar.uploadFiles"),
                    icon: <Upload className="size-4" />,
                    onSelect: () => onUpload("files"),
                  },
                  {
                    label: t("toolbar.uploadFolder"),
                    icon: <FolderUp className="size-4" />,
                    onSelect: () => onUpload("folder"),
                  },
                ],
              });
            }}
            className="grid h-10 w-9 place-items-center rounded-r-full border-l border-on-accent/20 bg-accent pr-1 text-on-accent transition-colors hover:bg-accent-hover"
          >
            <ChevronDown className="size-4" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
