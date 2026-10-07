import { FolderOpen, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { MessageKey } from "../i18n/index.tsx";
import { FilesPage, UsageTip } from "./files/index.ts";

export type ModuleId = "files";

export interface ModuleDef {
  id: ModuleId;
  icon: LucideIcon;
  label: MessageKey;
  /** 模块的整页内容，切换模块时卸载 */
  Page: ComponentType;
  /** 设备在线时显示在传输队列里的提示卡片 */
  Tip?: ComponentType;
}

/** 模块注册表，顺序即导航顺序；新增模块在这里加一项 */
export const MODULES: ModuleDef[] = [
  { id: "files", icon: FolderOpen, label: "nav.files", Page: FilesPage, Tip: UsageTip },
];
