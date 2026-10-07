import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/index.ts";
import type { Device, StorageInfo } from "../types.ts";

/** 当前设备消失后保留选择的时间（毫秒）。重启进系统到 adbd 启动常需 30 到 60 秒 */
export const REBOOT_GRACE = 90_000;

/** 优先系统模式的设备，否则第一台 */
const firstChoice = (list: Device[]) => (list.find((d) => d.mode === "system") ?? list[0])?.serial ?? null;

/**
 * 根据最新的设备列表决定选中哪台设备。goneSince 是当前设备从列表消失的时刻，返回更新后的值。
 * 消失后在 REBOOT_GRACE 内保留选择；超时后切到其他设备，没有任何设备时继续保留
 */
export function pickSerial(
  cur: string | null,
  list: Device[],
  goneSince: number | null,
  now: number,
): { serial: string | null; goneSince: number | null } {
  if (!cur) return { serial: firstChoice(list), goneSince: null };
  if (list.some((d) => d.serial === cur)) return { serial: cur, goneSince: null };
  const since = goneSince ?? now;
  if (now - since < REBOOT_GRACE || list.length === 0) return { serial: cur, goneSince: since };
  return { serial: firstChoice(list), goneSince: null };
}

/**
 * 每 2 秒轮询一次设备列表。当前设备消失后先保留选择，等它以别的模式（例如 fastboot）或重启后重新出现，
 * 超过 REBOOT_GRACE 才切到另一台设备
 */
export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [adbError, setAdbError] = useState<string | null>(null);
  const [fastbootMissing, setFastbootMissing] = useState(false);
  const [serial, setSerialState] = useState<string | null>(null);
  const [lastSeen, setLastSeen] = useState<Device | null>(null);
  const [reconnecting, setReconnecting] = useState(false);
  // poll 在定时器里运行，用 ref 读取最新的选择和消失时刻，避免在 setState 的更新函数里产生副作用
  const serialRef = useRef<string | null>(null);
  const goneSinceRef = useRef<number | null>(null);

  const setSerial = useCallback((next: string) => {
    serialRef.current = next;
    goneSinceRef.current = null;
    setSerialState(next);
    setReconnecting(false);
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const list = await api.devices();
        if (!alive) return;
        const now = Date.now();
        const next = pickSerial(serialRef.current, list.devices, goneSinceRef.current, now);
        const current = list.devices.find((d) => d.serial === next.serial);
        serialRef.current = next.serial;
        goneSinceRef.current = next.goneSince;
        setAdbError(list.adbError ?? null);
        setFastbootMissing(list.fastbootMissing ?? false);
        setDevices(list.devices);
        setSerialState(next.serial);
        if (current) setLastSeen(current);
        setReconnecting(!current && next.goneSince !== null && now - next.goneSince < REBOOT_GRACE);
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

  const current = devices.find((d) => d.serial === serial) ?? null;
  const device = current ?? (reconnecting && lastSeen?.serial === serial ? lastSeen : null);

  return { devices, device, reconnecting, adbError, fastbootMissing, serial, setSerial };
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
