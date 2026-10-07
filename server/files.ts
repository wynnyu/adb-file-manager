import posix from "node:path/posix";
import { Router } from "express";
import type { OkResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import * as fs from "./fs-cmds.ts";
import { assertNotInside, assertSafeTargets } from "./guard.ts";
import { ctxOf, pathsOf, wrap } from "./request.ts";

/** 设备上的文件操作：列目录、新建、重命名、删除、复制、移动 */
export function fileRoutes() {
  const router = Router();

  router.get(
    "/api/ls",
    wrap(async (req, res) => {
      const dir = adb.assertAbs(req.query.path);
      res.json(await fs.ls(await ctxOf(req), dir));
    }),
  );

  router.post(
    "/api/mkdir",
    wrap(async (req, res) => {
      await fs.mkdir(await ctxOf(req), adb.assertAbs(req.body.path));
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/api/rename",
    wrap(async (req, res) => {
      const from = adb.assertAbs(req.body.from);
      const to = adb.assertAbs(req.body.to);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, [from]);
      await fs.rename(ctx, from, to);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/api/delete",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, paths);
      await fs.remove(ctx, paths);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  // 复制 / 移动到目录：paths 是源，dest 是目标目录
  router.post(
    "/api/copy",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const dest = adb.assertAbs(req.body.dest);
      const ctx = await ctxOf(req);
      await assertNotInside(ctx, paths, dest);
      for (const p of paths) await fs.copyInto(ctx, p, dest);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/api/move",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const dest = adb.assertAbs(req.body.dest);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, paths);
      await assertNotInside(ctx, paths, dest);
      for (const p of paths) {
        // 已经在目标目录里的跳过
        if (posix.dirname(p) !== dest) await fs.rename(ctx, p, posix.join(dest, posix.basename(p)));
      }
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  return router;
}
