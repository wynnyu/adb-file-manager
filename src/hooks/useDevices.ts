import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/index.ts";
import type { Device, StorageInfo } from "../types.ts";

/** 每 2 秒轮询一次设备列表；当前设备断开后自动切到另一台已连接的设备 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [serial, setSerial] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const list = await api.devices();
        if (!alive) return;
        setAdbError(list.adbError ?? null);
        setDevices(list.devices);
        setSerial((cur) => {
          if (cur && list.devices.some((d) => d.serial === cur)) return cur;
          return (list.devices.find((d) => d.mode === "system") ?? list.devices[0])?.serial ?? cur;
        });
      } catch (e) {
        if (alive) setAdbError((e as Error).message);
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return { devices, adbError, serial, setSerial };
}

/** 设备共享存储的用量；设备离线时为 null */
export function useStorage(serial: string | null, online: boolean) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const refreshStorage = useCallback(() => {
    if (serial && online) api.storage(serial).then(setStorage, () => setStorage(null));
  }, [serial, online]);

  useEffect(() => {
    if (online) refreshStorage();
    else setStorage(null);
  }, [online, refreshStorage]);

  return { storage, refreshStorage };
}
