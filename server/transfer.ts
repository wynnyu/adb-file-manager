import { randomUUID } from "node:crypto";
import { createReadStream, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import posix from "node:path/posix";
import { ZipArchive } from "archiver";
import { Router } from "express";
import multer from "multer";
import type { PullResult, UploadResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";
import { ctxOf, pathsOf, uploadPathsOf, wrap } from "./request.ts";

const TMP = path.join(os.tmpdir(), "adb-file-manager");

async function tmpDir() {
  return fs.mkdtemp(path.join(TMP, "job-"));
}

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
  fs.rm(job.dir, { recursive: true, force: true }).catch((e) => console.warn(`清理临时目录失败：${e.message}`));
}

/** 上传和下载：文件都先落到电脑临时目录，再 adb push / pull */
export function transferRoutes() {
  mkdirSync(TMP, { recursive: true });
  const router = Router();
  const upload = multer({ dest: TMP });

  router.post(
    "/api/upload",
    upload.array("files"),
    wrap(async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      // 建临时目录也可能失败，放进 try 里保证 multer 存下的文件总会删除
      let stage: string | undefined;
      try {
        const ctx = await ctxOf(req);
        const dest = adb.assertAbs(req.query.path);
        if (!files.length) throw new adb.AdbError(msg("noFilesReceived"), 400);
        // 文件名用单独的 JSON 字段传，避免 multipart 文件名的编码问题；保留文件夹结构
        const rel = uploadPathsOf(req.body.paths);
        stage = await tmpDir();
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
        res.json({ ok: true, count: files.length } satisfies UploadResult);
      } finally {
        await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
        if (stage) await fs.rm(stage, { recursive: true, force: true });
      }
    }),
  );

  // 第一步：adb pull 到电脑临时目录，返回一次性 token
  router.post(
    "/api/pull",
    wrap(async (req, res) => {
      const ctx = await ctxOf(req);
      const paths = pathsOf(req.body.paths);
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
        res.json({ token, name: job.name } satisfies PullResult);
      } catch (e) {
        await fs.rm(dir, { recursive: true, force: true });
        throw e;
      }
    }),
  );

  // 第二步：浏览器下载（文件直传，目录/多选打包 zip），完成后清理
  router.get(
    "/api/fetch/:token",
    wrap(async (req, res) => {
      const token = String(req.params.token);
      const job = jobs.get(token);
      if (!job) throw new adb.AdbError(msg("downloadExpired"), 404);
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

  return router;
}
