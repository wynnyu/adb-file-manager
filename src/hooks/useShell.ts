import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DialogState } from "../components/overlays/index.ts";
import type { ModuleNavState } from "../components/shell/index.ts";
import type { Target } from "../lib/index.ts";
import type { Device, StorageInfo } from "../types.ts";
import { useDevices, useStorage } from "./useDevices.ts";
import { useRootMode } from "./useRootMode.ts";
import { type Flash, type ToastState, useToast } from "./useToast.ts";
import { type Transfers, useTransfers } from "./useTransfers.ts";

/** 外壳提供给各模块的状态：设备、root、提示、对话框和传输队列 */
export interface Shell {
  devices: Device[];
  adbError: string | null;
  serial: string | null;
  setSerial: (serial: string) => void;
  /** 当前设备是否已连接且已授权 */
  online: boolean;
  storage: StorageInfo | null;
  refreshStorage: () => void;
  rootMode: boolean;
  askEnableRoot: () => void;
  disableRoot: () => void;
  /** 当前设备加 root 方式，没有设备时为 null；模块的请求都带着它 */
  target: Target | null;
  toast: ToastState | null;
  flash: Flash;
  dialog: DialogState | null;
  openDialog: (d: DialogState) => void;
  /** 传入打开的那个对话框时，只有它仍是当前对话框才关闭，避免误关随后打开的新对话框 */
  closeDialog: (d?: DialogState) => void;
  transfers: Transfers["transfers"];
  startTransfer: Transfers["startTransfer"];
  patchTransfer: Transfers["patchTransfer"];
  dismissTransfer: Transfers["dismissTransfer"];
  /** 模块导航；由 App 根据模块注册表提供，useShellState 不包含 */
  nav: ModuleNavState;
}

/** useShellState 管理的部分，App 再补上 nav 组成完整的 Shell */
export type ShellState = Omit<Shell, "nav">;

export const ShellContext = createContext<Shell | null>(null);

/** 读取外壳状态；只能在 ShellContext 内使用 */
export function useShell(): Shell {
  const shell = useContext(ShellContext);
  if (!shell) throw new Error("useShell must be used within a ShellContext provider");
  return shell;
}

/** 外壳自己的状态，由 App 调用一次并放进 ShellContext */
export function useShellState(): ShellState {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const closeDialog = useCallback((d?: DialogState) => setDialog((cur) => (d && cur !== d ? cur : null)), []);
  const { toast, flash } = useToast();
  const { transfers, startTransfer, patchTransfer, dismissTransfer } = useTransfers();

  const { devices, adbError, serial, setSerial } = useDevices();
  const online = devices.find((d) => d.serial === serial)?.mode === "system";
  const { storage, refreshStorage } = useStorage(serial, online);
  const { rootMode, askEnableRoot, disableRoot } = useRootMode({ serial, online, flash, openDialog: setDialog });
  const target = useMemo<Target | null>(() => (serial ? { serial, root: rootMode } : null), [serial, rootMode]);

  return useMemo(
    () => ({
      devices,
      adbError,
      serial,
      setSerial,
      online,
      storage,
      refreshStorage,
      rootMode,
      askEnableRoot,
      disableRoot,
      target,
      toast,
      flash,
      dialog,
      openDialog: setDialog,
      closeDialog,
      transfers,
      startTransfer,
      patchTransfer,
      dismissTransfer,
    }),
    [
      devices,
      adbError,
      serial,
      setSerial,
      online,
      storage,
      refreshStorage,
      rootMode,
      askEnableRoot,
      disableRoot,
      target,
      toast,
      flash,
      dialog,
      closeDialog,
      transfers,
      startTransfer,
      patchTransfer,
      dismissTransfer,
    ],
  );
}
