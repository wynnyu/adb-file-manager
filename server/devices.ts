import { Router } from "express";
import type { RootCheckResult, StorageInfo } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";
import { rootFor, serialOf, wrap } from "./request.ts";

export async function storage(ctx: adb.Ctx): Promise<StorageInfo> {
  const out = await adb.shell(ctx, "df -k /sdcard/ | tail -n 1");
  const [, total, , avail] = out.trim().split(/\s+/).map(Number);
  if (!total) throw new adb.AdbError(msg("noStorage"));
  return { total: total * 1024, free: avail * 1024 };
}

export function deviceRoutes() {
  const router = Router();

  router.get(
    "/",
    wrap(async (_req, res) => {
      res.json(await adb.devices());
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
