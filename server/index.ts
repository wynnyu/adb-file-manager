#!/usr/bin/env node
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { ZipArchive } from "archiver";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import posix from "node:path/posix";
import { fileURLToPath } from "node:url";
import * as adb from "./adb.ts";

const PORT = Number(process.env.PORT) || 3001;
const HOST = "127.0.0.1";
const TMP = path.join(os.tmpdir(), "adb-file-manager");
await fs.mkdir(TMP, { recursive: true });

const app = express();
app.use(express.json());

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function isLocalOrigin(origin: string) {
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && LOCAL_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

// 只接受本机访问：Host 校验防 DNS rebinding，Origin / Sec-Fetch-Site 校验防其他网页跨站提交（CSRF）
app.use((req, res, next) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.includes(host)) {
    res.status(403).json({ error: "forbidden host" });
    return;
  }
  const origin = req.headers.origin;
  const site = req.headers["sec-fetch-site"];
  if ((origin !== undefined && !isLocalOrigin(origin)) || (site !== undefined && site !== "same-origin" && site !== "none")) {
    res.status(403).json({ error: "forbidden origin" });
    return;
  }
  next();
});

type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

function serialOf(req: Request): string {
  const s = req.query.serial ?? req.body?.serial;
  if (typeof s !== "string" || !s) throw new adb.AdbError("缺少 serial 参数", 400);
  return s;
}

const rootCache = new Map<string, "adbd" | "su">();

async function rootFor(serial: string) {
  let m = rootCache.get(serial);
  if (!m) {
    m = await adb.rootMethod(serial);
    rootCache.set(serial, m);
  }
  return m;
}

/** 请求带 root=1 时以 root 身份执行 */
async function ctxOf(req: Request): Promise<adb.Ctx> {
  const serial = serialOf(req);
  const flag = req.query.root ?? req.body?.root;
  const root = flag === "1" || flag === true ? await rootFor(serial) : false;
  return { serial, root };
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  return [];
}

/** 拒绝删除 / 移动根目录或一级目录（/sdcard、/system …） */
function assertSafeTarget(p: string) {
  if (p.split("/").filter(Boolean).length < 2) {
    throw new adb.AdbError(`为安全起见，不允许操作 ${p}`, 400);
  }
}

async function tmpDir() {
  return fs.mkdtemp(path.join(TMP, "job-"));
}

app.get(
  "/api/devices",
  wrap(async (_req, res) => {
    res.json(await adb.devices());
  }),
);

app.get(
  "/api/ls",
  wrap(async (req, res) => {
    const dir = adb.assertAbs(req.query.path);
    res.json(await adb.ls(await ctxOf(req), dir));
  }),
);

app.post(
  "/api/root-check",
  wrap(async (req, res) => {
    const serial = serialOf(req);
    rootCache.delete(serial);
    res.json({ method: await rootFor(serial) });
  }),
);

app.get(
  "/api/storage",
  wrap(async (req, res) => {
    res.json(await adb.storage({ serial: serialOf(req), root: false }));
  }),
);

const upload = multer({ dest: TMP });

app.post(
  "/api/upload",
  upload.array("files"),
  wrap(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const stage = await tmpDir();
    try {
      const ctx = await ctxOf(req);
      const dest = adb.assertAbs(req.query.path);
      if (!files.length) throw new adb.AdbError("没有收到文件", 400);
      // 文件名用单独的 JSON 字段传，避免 multipart 文件名的编码问题；保留文件夹结构
      const rel: string[] = JSON.parse(String(req.body.paths ?? "[]"));
      const tops = new Set<string>();
      for (const [i, f] of files.entries()) {
        const parts = (rel[i] || f.originalname).split("/").filter((s) => s && s !== "." && s !== "..");
        if (!parts.length) continue;
        const target = path.join(stage, ...parts);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.rename(f.path, target);
        tops.add(path.join(stage, parts[0]));
      }
      await adb.mkdir(ctx, dest);
      await adb.push(ctx, [...tops], dest);
      res.json({ ok: true, count: files.length });
    } finally {
      await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
      await fs.rm(stage, { recursive: true, force: true });
    }
  }),
);

interface PullJob {
  dir: string;
  name: string;
  /** 单个文件时为本地路径；否则打包 dir 下全部内容为 zip */
  file?: string;
  timer: NodeJS.Timeout;
}
const jobs = new Map<string, PullJob>();

function dropJob(token: string) {
  const job = jobs.get(token);
  if (!job) return;
  jobs.delete(token);
  clearTimeout(job.timer);
  void fs.rm(job.dir, { recursive: true, force: true });
}

// 第一步：adb pull 到电脑临时目录，返回一次性 token
app.post(
  "/api/pull",
  wrap(async (req, res) => {
    const ctx = await ctxOf(req);
    const paths = asList(req.body.paths).map(adb.assertAbs);
    if (!paths.length) throw new adb.AdbError("缺少 paths 参数", 400);
    const dir = await tmpDir();
    try {
      const single = paths.length === 1 && !(await adb.isDir(ctx, paths[0]));
      for (const p of paths) await adb.pull(ctx, p, dir);
      const token = randomUUID();
      const job: PullJob = {
        dir,
        name: single
          ? posix.basename(paths[0])
          : paths.length === 1
            ? `${posix.basename(paths[0]) || "root"}.zip`
            : `${posix.basename(posix.dirname(paths[0])) || "files"}.zip`,
        timer: setTimeout(() => dropJob(token), 30 * 60_000),
      };
      if (single) job.file = path.join(dir, job.name);
      jobs.set(token, job);
      res.json({ token, name: job.name });
    } catch (e) {
      await fs.rm(dir, { recursive: true, force: true });
      throw e;
    }
  }),
);

// 第二步：浏览器下载（文件直传，目录/多选打包 zip），完成后清理
app.get(
  "/api/fetch/:token",
  wrap(async (req, res) => {
    const token = String(req.params.token);
    const job = jobs.get(token);
    if (!job) throw new adb.AdbError("下载已过期，请重试", 404);
    res.on("close", () => dropJob(token));
    res.attachment(job.name);
    if (job.file) {
      res.setHeader("Content-Length", (await fs.stat(job.file)).size);
      createReadStream(job.file).pipe(res);
      return;
    }
    const zip = new ZipArchive({ zlib: { level: 1 } });
    zip.on("error", (e) => res.destroy(e));
    zip.pipe(res);
    for (const entry of await fs.readdir(job.dir, { withFileTypes: true })) {
      const full = path.join(job.dir, entry.name);
      if (entry.isDirectory()) zip.directory(full, entry.name);
      else zip.file(full, { name: entry.name });
    }
    await zip.finalize();
  }),
);

app.post(
  "/api/mkdir",
  wrap(async (req, res) => {
    await adb.mkdir(await ctxOf(req), adb.assertAbs(req.body.path));
    res.json({ ok: true });
  }),
);

app.post(
  "/api/rename",
  wrap(async (req, res) => {
    const from = adb.assertAbs(req.body.from);
    const to = adb.assertAbs(req.body.to);
    assertSafeTarget(from);
    await adb.rename(await ctxOf(req), from, to);
    res.json({ ok: true });
  }),
);

app.post(
  "/api/delete",
  wrap(async (req, res) => {
    const paths = asList(req.body.paths).map(adb.assertAbs);
    if (!paths.length) throw new adb.AdbError("缺少 paths 参数", 400);
    paths.forEach(assertSafeTarget);
    await adb.remove(await ctxOf(req), paths);
    res.json({ ok: true });
  }),
);

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
  res.status(status).json({ error: message });
});

app.listen(PORT, HOST, (err?: Error) => {
  if (err) {
    console.error(
      (err as NodeJS.ErrnoException).code === "EADDRINUSE"
        ? `端口 ${PORT} 已被占用，可以用 PORT=<端口> 换一个`
        : err.message,
    );
    process.exit(1);
  }
  console.log(`ADB File Manager → http://${HOST}:${PORT}`);
});
