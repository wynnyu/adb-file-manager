import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ErrorResponse, RootCheckResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { fileRoutes } from "./files.ts";
import { localOnly } from "./guard.ts";
import { langMiddleware } from "./i18n.ts";
import { rootFor, serialOf, wrap } from "./request.ts";
import { transferRoutes } from "./transfer.ts";

/** 组装 HTTP 服务，不监听端口 */
export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use(localOnly);

  app.get(
    "/api/devices",
    wrap(async (_req, res) => {
      res.json(await adb.devices());
    }),
  );

  app.post(
    "/api/root-check",
    wrap(async (req, res) => {
      res.json({ method: await rootFor(serialOf(req), true) } satisfies RootCheckResult);
    }),
  );

  app.get(
    "/api/storage",
    wrap(async (req, res) => {
      res.json(await adb.storage({ serial: serialOf(req), root: false }));
    }),
  );

  app.use(fileRoutes());
  app.use(transferRoutes());

  // 编译后位于 dist/server/，前端产物在 dist/web/；开发时（tsx）该目录不存在，由 vite 提供页面
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
  if (existsSync(path.join(web, "index.html"))) {
    app.use(express.static(web));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(web, "index.html")));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof adb.AdbError ? err.status : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const code = err instanceof adb.AdbError ? err.code : undefined;
    res.status(status).json({ error: message, code } satisfies ErrorResponse);
  });

  return app;
}
