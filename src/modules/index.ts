import { FolderOpen, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";
import type { MessageKey } from "../i18n/index.tsx";
import type { DeviceMode } from "../types.ts";
import { FilesPage, UsageTip } from "./files/index.ts";

export type ModuleId = "files";

export interface ModuleDef {
  id: ModuleId;
  icon: LucideIcon;
  label: MessageKey;
  /** 模块可用的设备模式；当前设备处于其他模式时页面显示模式提示 */
  modes: DeviceMode[];
  /** 模块的整页内容，切换模块时卸载 */
  Page: ComponentType;
  /** 设备在线时显示在传输队列里的提示卡片 */
  Tip?: ComponentType;
}

/** 模块注册表，顺序即导航顺序；新增模块在这里加一项 */
export const MODULES: ModuleDef[] = [
  { id: "files", icon: FolderOpen, label: "nav.files", modes: ["system"], Page: FilesPage, Tip: UsageTip },
];
