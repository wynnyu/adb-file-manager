import { AnimatePresence } from "motion/react";
import { Dialog, Toast, TransferQueue, UsageTip } from "./components/overlays/index.ts";
import { FilesPage } from "./FilesPage.tsx";
import { ShellContext, useShellState } from "./hooks/index.ts";

export default function App() {
  const shell = useShellState();
  const { online, transfers, dismissTransfer, toast, dialog, closeDialog } = shell;
  return (
    <ShellContext value={shell}>
      <FilesPage />

      <TransferQueue items={transfers} onDismiss={dismissTransfer}>
        {online && <UsageTip />}
      </TransferQueue>

      <Toast toast={toast} />

      <AnimatePresence mode="wait">
        {dialog && <Dialog key={dialog.title} state={dialog} onClose={() => closeDialog(dialog)} />}
      </AnimatePresence>
    </ShellContext>
  );
}
