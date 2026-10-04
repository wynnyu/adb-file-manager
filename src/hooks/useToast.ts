import { useCallback, useState } from "react";

export interface ToastState {
  msg: string;
  tone: "error" | "info";
}

export type Flash = (msg: string, tone?: ToastState["tone"]) => void;

/** 顶部的短暂提示：错误显示 4 秒，普通信息 2.5 秒 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const flash = useCallback<Flash>((msg, tone = "error") => {
    const next = { msg, tone };
    setToast(next);
    setTimeout(() => setToast((t) => (t === next ? null : t)), tone === "info" ? 2500 : 4000);
  }, []);

  return { toast, flash };
}
