import posix from "node:path/posix";
import { Router } from "express";
import type { OkResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { assertNotInside, assertSafeTargets } from "./guard.ts";
import { msg } from "./i18n.ts";
import { ctxOf, pathsOf, wrap } from "./request.ts";

/** 分栏视图预览：只放行浏览器能直接显示的图片 */
const PREVIEW_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** 设备上的文件操作：列目录、新建、重命名、删除、复制、移动、预览 */
export function fileRoutes() {
  const router = Router();

  router.get(
    "/api/ls",
    wrap(async (req, res) => {
      const dir = adb.assertAbs(req.query.path);
      res.json(await adb.ls(await ctxOf(req), dir));
    }),
  );

  router.post(
    "/api/mkdir",
    wrap(async (req, res) => {
      await adb.mkdir(await ctxOf(req), adb.assertAbs(req.body.path));
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
      await adb.rename(ctx, from, to);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/api/delete",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, paths);
      await adb.remove(ctx, paths);
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
      for (const p of paths) await adb.copyInto(ctx, p, dest);
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
        if (posix.dirname(p) !== dest) await adb.rename(ctx, p, posix.join(dest, posix.basename(p)));
      }
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.get(
    "/api/preview",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.query.path);
      const type = PREVIEW_TYPES[posix.extname(p).toLowerCase()];
      if (!type) throw new adb.AdbError(msg("notPreviewable"), 415);
      const child = adb.cat(await ctxOf(req), p);
      res.on("close", () => child.kill());
      res.setHeader("Content-Type", type);
      res.setHeader("X-Content-Type-Options", "nosniff");
      // SVG 里的脚本不许跑
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Cache-Control", "no-store");
      child.stdout.pipe(res);
    }),
  );

  return router;
}
