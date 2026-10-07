import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ErrorResponse } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { archiveRoutes } from "./archive.ts";
import { attrRoutes } from "./attrs.ts";
import { deviceRoutes } from "./devices.ts";
import { fileRoutes } from "./files.ts";
import { localOnly } from "./guard.ts";
import { langMiddleware } from "./i18n.ts";
import { jobRoutes } from "./jobs.ts";
import { previewRoutes } from "./preview.ts";
import { transferRoutes } from "./transfer.ts";

/** 组装 HTTP 服务，不监听端口 */
export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(langMiddleware);
  app.use(localOnly);

  app.use("/api/devices", deviceRoutes());
  app.use("/api/files", fileRoutes(), previewRoutes(), archiveRoutes(), attrRoutes(), transferRoutes());
  app.use("/api/jobs", jobRoutes());

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
