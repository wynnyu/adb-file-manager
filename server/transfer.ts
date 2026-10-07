import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import posix from "node:path/posix";
import { ZipArchive } from "archiver";
import { Router } from "express";
import multer from "multer";
import type { PullResult, UploadResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import * as cmds from "./fs-cmds.ts";
import { msg } from "./i18n.ts";
import { ctxOf, pathsOf, uploadPathsOf, wrap } from "./request.ts";
import { TMP, tmpDir } from "./tmp.ts";

type PullSource =
  /** 取回时直接 exec-out cat，不落盘 */
  | { kind: "stream"; ctx: adb.Ctx; path: string }
  /** 已 pull 到 dir，取回时打包 dir 下全部内容为 zip */
  | { kind: "zip"; dir: string };
type PullJob = PullSource & { name: string; timer: NodeJS.Timeout };
const jobs = new Map<string, PullJob>();

function dropJob(token: string) {
  const job = jobs.get(token);
  if (!job) return;
  jobs.delete(token);
  clearTimeout(job.timer);
  if (job.kind === "zip") {
    fs.rm(job.dir, { recursive: true, force: true }).catch((e) => console.warn(`清理临时目录失败：${e.message}`));
  }
}

/** 下载的文件名：单个文件用原名，其余打包为 zip，以所选目录名或所在目录名命名 */
export function downloadName(paths: string[], single: boolean) {
  if (single) return posix.basename(paths[0]);
  if (paths.length === 1) return `${posix.basename(paths[0]) || "root"}.zip`;
  return `${posix.basename(posix.dirname(paths[0])) || "files"}.zip`;
}

/** 上传先落到电脑临时目录再 adb push；下载中单个文件经 exec-out 流式返回，目录和多选先 adb pull 到临时目录再打包 */
export function transferRoutes() {
  const router = Router();
  const upload = multer({ dest: TMP });

  router.post(
    "/upload",
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
        await cmds.mkdir(ctx, dest);
        await adb.push(ctx, [...tops], dest);
        res.json({ ok: true, count: files.length } satisfies UploadResult);
      } finally {
        await Promise.all(files.map((f) => fs.rm(f.path, { force: true })));
        if (stage) await fs.rm(stage, { recursive: true, force: true });
      }
    }),
  );

  // 第一步：登记一次性 token。单个文件不落盘，目录和多选 adb pull 到电脑临时目录
  router.post(
    "/pull",
    wrap(async (req, res) => {
      const ctx = await ctxOf(req);
      const paths = pathsOf(req.body.paths);
      const single = paths.length === 1 && !(await cmds.isDir(ctx, paths[0]));
      const name = downloadName(paths, single);
      let job: PullSource;
      if (single) {
        // 先确认文件存在且可读，404 / 403 在这一步以 JSON 返回
        await cmds.fileSize(ctx, paths[0]);
        job = { kind: "stream", ctx, path: paths[0] };
      } else {
        const dir = await tmpDir();
        try {
          for (const p of paths) await adb.pull(ctx, p, dir);
        } catch (e) {
          await fs.rm(dir, { recursive: true, force: true });
          throw e;
        }
        job = { kind: "zip", dir };
      }
      const token = randomUUID();
      jobs.set(token, { ...job, name, timer: setTimeout(() => dropJob(token), 30 * 60_000) });
      res.json({ token, name } satisfies PullResult);
    }),
  );

  // 第二步：浏览器下载（单个文件流式返回，目录/多选打包 zip），完成后清理
  router.get(
    "/fetch/:token",
    wrap(async (req, res) => {
      const token = String(req.params.token);
      const job = jobs.get(token);
      if (!job) throw new adb.AdbError(msg("downloadExpired"), 404);
      res.on("close", () => dropJob(token));
      if (job.kind === "stream") {
        // su 模式下 cat 已经通过 exec-out 提权，不需要经过设备上的暂存目录
        res.setHeader("Content-Length", await cmds.fileSize(job.ctx, job.path));
        res.attachment(job.name);
        const child = cmds.cat(job.ctx, job.path);
        res.on("close", () => child.kill());
        child.stdout.pipe(res);
        return;
      }
      res.attachment(job.name);
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
