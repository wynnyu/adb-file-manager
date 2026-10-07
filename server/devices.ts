import { Router } from "express";
import type { DeviceList, RootCheckResult, StorageInfo } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import * as fastboot from "./fastboot.ts";
import { msg } from "./i18n.ts";
import { rootFor, serialOf, wrap } from "./request.ts";

export async function storage(ctx: adb.Ctx): Promise<StorageInfo> {
  const out = await adb.shell(ctx, "df -k /sdcard/ | tail -n 1");
  const [, total, , avail] = out.trim().split(/\s+/).map(Number);
  if (!total) throw new adb.AdbError(msg("noStorage"));
  return { total: total * 1024, free: avail * 1024 };
}

/** 合并 adb 和 fastboot 的设备；同一 serial 两边都有时保留 adb 的。任一来源失败不影响另一个 */
export async function listDevices(): Promise<DeviceList> {
  const [a, f] = await Promise.allSettled([adb.devices(), fastboot.devices()]);
  const list: DeviceList = { devices: a.status === "fulfilled" ? [...a.value] : [] };
  if (a.status === "rejected") list.adbError = (a.reason as Error).message;
  if (f.status === "fulfilled") {
    const seen = new Set(list.devices.map((d) => d.serial));
    list.devices.push(...f.value.devices.filter((d) => !seen.has(d.serial)));
    if (f.value.missing) list.fastbootMissing = true;
  }
  return list;
}

export function deviceRoutes() {
  const router = Router();

  router.get(
    "/",
    wrap(async (_req, res) => {
      res.json(await listDevices());
    }),
  );

  router.post(
    "/reconnect",
    wrap(async (_req, res) => {
      await adb.reconnectOffline();
      res.json({ ok: true });
    }),
  );

  router.post(
    "/restart-server",
    wrap(async (_req, res) => {
      await adb.restartServer();
      res.json({ ok: true });
    }),
  );

  router.post(
    "/root-check",
    wrap(async (req, res) => {
      res.json({ method: await rootFor(serialOf(req), true) } satisfies RootCheckResult);
    }),
  );

  router.get(
    "/storage",
    wrap(async (req, res) => {
      res.json(await storage({ serial: serialOf(req), root: false }));
    }),
  );

  return router;
}
