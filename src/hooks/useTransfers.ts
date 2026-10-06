import { useCallback, useState } from "react";
import type { Transfer } from "../types.ts";

/** 传输队列：完成的任务 4 秒后自动移除，失败的和带说明的留到手动关闭 */
export function useTransfers() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const startTransfer = useCallback((t: Omit<Transfer, "id">) => {
    const id = crypto.randomUUID();
    setTransfers((list) => [...list, { ...t, id }]);
    return id;
  }, []);

  const patchTransfer = useCallback((id: string, patch: Partial<Transfer>) => {
    setTransfers((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.status === "done" && !patch.note) {
      setTimeout(() => setTransfers((list) => list.filter((t) => t.id !== id)), 4000);
    }
  }, []);

  const dismissTransfer = useCallback((id: string) => setTransfers((list) => list.filter((t) => t.id !== id)), []);

  return { transfers, startTransfer, patchTransfer, dismissTransfer };
}

export type Transfers = ReturnType<typeof useTransfers>;
