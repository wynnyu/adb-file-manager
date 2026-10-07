import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DialogState } from "../components/overlays/index.ts";
import type { ModuleNavState } from "../components/shell/index.ts";
import type { Target } from "../lib/index.ts";
import type { Device, DeviceMode, StorageInfo } from "../types.ts";
import { useDevices, useStorage } from "./useDevices.ts";
import { useRootMode } from "./useRootMode.ts";
import { type Tasks, useTasks } from "./useTasks.ts";
import { type Flash, type ToastState, useToast } from "./useToast.ts";

/** 外壳提供给各模块的状态：设备、root、提示、对话框和传输队列 */
export interface Shell {
  devices: Device[];
  /** 当前设备；重新连接的宽限期内是它最近一次出现时的条目，没有选中设备时为 null */
  device: Device | null;
  /** 当前设备已消失，正在等它重启或换模式后重新出现 */
  reconnecting: boolean;
  adbError: string | null;
  /** 电脑上找不到 fastboot，fastboot 设备无法检测 */
  fastbootMissing: boolean;
  serial: string | null;
  setSerial: (serial: string) => void;
  /** 当前设备能否执行 adb shell（adb 连接、系统模式、不在重新连接中），存储用量和 root 依赖它，与当前模块无关 */
  adbReady: boolean;
  /** 当前设备是否可供当前模块使用：设备模式在模块的 modes 内；由 App 按当前模块计算，useShellState 不包含 */
  online: boolean;
  /** 当前模块可用的设备模式；由 App 提供，useShellState 不包含 */
  modes: DeviceMode[];
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
  tasks: Tasks["tasks"];
  startTask: Tasks["startTask"];
  patchTask: Tasks["patchTask"];
  dismissTask: Tasks["dismissTask"];
  /** 模块导航；由 App 根据模块注册表提供，useShellState 不包含 */
  nav: ModuleNavState;
}

/** useShellState 管理的部分，App 再补上 nav、online 和 modes 组成完整的 Shell */
export type ShellState = Omit<Shell, "nav" | "online" | "modes">;

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
  const { tasks, startTask, patchTask, dismissTask } = useTasks();

  const { devices, device, reconnecting, adbError, fastbootMissing, serial, setSerial } = useDevices();
  const adbReady = !reconnecting && device?.transport === "adb" && device.mode === "system";
  const { storage, refreshStorage } = useStorage(serial, adbReady);
  const { rootMode, askEnableRoot, disableRoot } = useRootMode({
    serial,
    online: adbReady,
    flash,
    openDialog: setDialog,
  });
  const target = useMemo<Target | null>(() => (serial ? { serial, root: rootMode } : null), [serial, rootMode]);

  return useMemo(
    () => ({
      devices,
      device,
      reconnecting,
      adbError,
      fastbootMissing,
      serial,
      setSerial,
      adbReady,
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
      tasks,
      startTask,
      patchTask,
      dismissTask,
    }),
    [
      devices,
      device,
      reconnecting,
      adbError,
      fastbootMissing,
      serial,
      setSerial,
      adbReady,
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
      tasks,
      startTask,
      patchTask,
      dismissTask,
    ],
  );
}
