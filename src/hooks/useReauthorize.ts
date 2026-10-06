import { useCallback, useState } from "react";
import { api } from "../lib/index.ts";

export type ReauthorizeAction = "reconnect" | "restart";

/** 设备待授权时的两个补救操作：重新请求授权、重启 adb 服务。设备状态由 useDevices 的轮询刷新 */
export function useReauthorize() {
  const [pending, setPending] = useState<ReauthorizeAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async (action: ReauthorizeAction) => {
    setPending(action);
    setError(null);
    try {
      await (action === "reconnect" ? api.reconnectDevices() : api.restartAdb());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(null);
    }
  }, []);

  const reconnect = useCallback(() => start("reconnect"), [start]);
  const restart = useCallback(() => start("restart"), [start]);

  return { pending, error, reconnect, restart };
}
