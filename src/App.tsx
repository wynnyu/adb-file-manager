import { AnimatePresence } from "motion/react";
import { useCallback, useMemo } from "react";
import { Dialog, Toast, TransferQueue } from "./components/overlays/index.ts";
import type { ModuleNavItem } from "./components/shell/index.ts";
import { ShellContext, useShellState } from "./hooks/index.ts";
import { usePref } from "./lib/index.ts";
import { MODULES, type ModuleId } from "./modules/index.ts";

const NAV_ITEMS: ModuleNavItem[] = MODULES.map(({ id, icon, label }) => ({ id, icon, label }));

export default function App() {
  const state = useShellState();
  const [moduleId, setModuleId] = usePref<ModuleId>("afm.module", "files");
  // 存储的 id 无效（模块被移除、偏好被改动）时回退到第一个模块
  const current = MODULES.find((m) => m.id === moduleId) ?? MODULES[0];
  const onChange = useCallback(
    (id: string) => {
      const next = MODULES.find((m) => m.id === id);
      if (next) setModuleId(next.id);
    },
    [setModuleId],
  );
  const nav = useMemo(() => ({ items: NAV_ITEMS, current: current.id, onChange }), [current.id, onChange]);
  const shell = useMemo(() => ({ ...state, nav }), [state, nav]);
  const { online, transfers, dismissTransfer, toast, dialog, closeDialog } = state;
  const { Page, Tip } = current;

  return (
    <ShellContext value={shell}>
      <Page />

      <TransferQueue items={transfers} onDismiss={dismissTransfer}>
        {online && Tip && <Tip />}
      </TransferQueue>

      <Toast toast={toast} />

      <AnimatePresence mode="wait">
        {dialog && <Dialog key={dialog.title} state={dialog} onClose={() => closeDialog(dialog)} />}
      </AnimatePresence>
    </ShellContext>
  );
}
