import posix from "node:path/posix";
import { Router } from "express";
import type {
  ArchiveEntry,
  ArchiveFormat,
  ArchiveListing,
  CompressResult,
  ExtractResult,
  JobRef,
} from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import * as fs from "./fs-cmds.ts";
import { msg } from "./i18n.ts";
import { startJob } from "./jobs.ts";
import { ctxOf, pathsOf, wrap } from "./request.ts";
import { compressZip } from "./zip.ts";

/** 预览最多返回的条目数，超出的部分截断 */
const LIST_LIMIT = 20000;

const ZIP_EXTS = /\.(zip|apk|apks|xapk|jar|aar)$/i;

/** 扩展名对应的格式，不支持（7z、rar、xz 等）时为 null；前端 lib/kinds.ts 的 archiveFormat 与此保持一致 */
export function archiveFormat(name: string): ArchiveFormat | null {
  if (ZIP_EXTS.test(name)) return "zip";
  if (/\.tar\.gz$|\.tgz$/i.test(name)) return "tgz";
  if (/\.tar\.bz2$|\.tbz2?$/i.test(name)) return "tbz";
  if (/\.tar$/i.test(name)) return "tar";
  return null;
}

/** 解压到文件夹时使用的名字：去掉 .tar.gz 这类复合扩展名，去完为空时保留原名 */
export function extractName(name: string) {
  const base = name.replace(/\.(tar\.gz|tar\.bz2|tgz|tbz2?|tar|zip|apk|apks|xapk|jar|aar)$/i, "");
  return base || name;
}

/** 校验请求里的压缩格式 */
function formatOf(v: unknown): ArchiveFormat {
  if (typeof v !== "string" || !Object.hasOwn(fs.ARCHIVE_EXT, v)) throw new adb.AdbError(msg("notArchive"), 415);
  return v as ArchiveFormat;
}

/** 压缩包放在哪里、包里的路径是什么 */
export interface PackPlan {
  /** 压缩包所在的目录，也是包内路径的起点 */
  base: string;
  /** 相对 base 的路径，没有重复，也没有互相包含 */
  names: string[];
}

/**
 * 规划压缩：去掉重复项和被其他所选项包含的项，以剩下各项的公共父目录为 base。
 * 公共父目录必然在所有所选项之外，压缩包不会落进它自己的源里。根目录没有可放压缩包的父目录，直接拒绝
 */
export function packBase(paths: string[]): PackPlan {
  const clean = [...new Set(paths.map((p) => p.replace(/\/+$/, "") || "/"))];
  if (clean.includes("/")) throw new adb.AdbError(msg("packRoot"), 400);
  const tops = clean.filter((p) => !clean.some((o) => o !== p && p.startsWith(`${o}/`)));
  const parents = tops.map((p) => posix.dirname(p).split("/").filter(Boolean));
  const common = parents[0].filter((seg, i) => parents.every((parts) => parts[i] === seg));
  const base = `/${common.join("/")}`;
  return { base, names: tops.map((p) => posix.relative(base, p)) };
}

/** 压缩包的文件名：单项沿用其名字（a.jpg 为 a.jpg.zip），多项统一为 Archive */
export function packName(names: string[], format: ArchiveFormat) {
  return `${names.length === 1 ? posix.basename(names[0]) : "Archive"}${fs.ARCHIVE_EXT[format]}`;
}

/** 去掉开头的 ./ 和末尾的 /；空串和 . 表示压缩包根，返回 null */
function cleanPath(raw: string) {
  let p = raw;
  while (p.startsWith("./")) p = p.slice(2);
  p = p.replace(/\/+$/, "");
  return p === "" || p === "." ? null : p;
}

const ZIP_LINE =
  /^\s*(\d+)\s+\S+\s+\d+\s+\S+\s+(\d{4}-\d\d-\d\d|\d\d-\d\d-\d{4})\s+(\d\d:\d\d(?::\d\d)?)\s+[0-9a-f]{8}\s+(.*)$/i;

/** 解析 unzip -lv 的输出：`Length Method Size Cmpr Date Time CRC Name`，表头、分隔线和汇总行不匹配而被跳过 */
export function parseZipList(out: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const line of out.split("\n")) {
    const m = ZIP_LINE.exec(line.replace(/\r$/, ""));
    if (!m) continue;
    const path = cleanPath(m[4]);
    if (path === null) continue;
    entries.push({ path, isDir: m[4].endsWith("/"), size: Number(m[1]), date: `${m[2]} ${m[3]}` });
  }
  return entries;
}

const TAR_LINE = /^([-dlhcbps])\S{9}\S*\s+\S+\s+(\d+)\s+(\d{4}-\d\d-\d\d)\s+(\d\d:\d\d(?::\d\d)?)\s(.*)$/;

/** 解析 toybox tar -tv 的输出：`模式 属主/组 大小 日期 时间 名称`，符号链接为 `名称 -> 目标`，硬链接为 `名称 link to 目标` */
export function parseTarList(out: string): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  for (const line of out.split("\n")) {
    const m = TAR_LINE.exec(line.replace(/\r$/, ""));
    if (!m) continue;
    const [, type, size, day, time] = m;
    let name = m[5];
    let link: string | undefined;
    if (type === "l") {
      const at = name.indexOf(" -> ");
      if (at >= 0) {
        link = name.slice(at + 4);
        name = name.slice(0, at);
      }
    } else if (type === "h") {
      const at = name.indexOf(" link to ");
      if (at >= 0) name = name.slice(0, at);
    }
    const path = cleanPath(name);
    if (path === null) continue;
    entries.push({
      path,
      isDir: type === "d" || name.endsWith("/"),
      size: Number(size),
      date: `${day} ${time}`,
      ...(link === undefined ? {} : { link }),
    });
  }
  return entries;
}

/**
 * 拒绝会写到目标文件夹之外的条目：绝对路径、含 .. 的路径（zip-slip），
 * 以及位于某个符号链接条目之下的路径（先放一个指向外面的链接，再往链接里写文件）
 */
export function assertSafeEntries(entries: ArchiveEntry[]) {
  const links = new Set(entries.filter((e) => e.link !== undefined).map((e) => e.path));
  for (const { path } of entries) {
    const segments = path.split("/");
    const unsafe =
      path.startsWith("/") ||
      segments.includes("..") ||
      segments.some((_, i) => i < segments.length - 1 && links.has(segments.slice(0, i + 1).join("/")));
    if (unsafe) throw new adb.AdbError(msg("unsafeArchive"), 400);
  }
}

/** 压缩包里唯一的顶层项目名；有多个顶层项目或为空时为 null */
export function topLevelSingle(entries: ArchiveEntry[]) {
  const tops = new Set(entries.map((e) => e.path.split("/")[0]));
  return tops.size === 1 ? [...tops][0] : null;
}

/** 读出压缩包的全部条目 */
async function listEntries(ctx: adb.Ctx, p: string, format: ArchiveFormat) {
  const out = await fs.listArchive(ctx, p, format);
  return format === "zip" ? parseZipList(out) : parseTarList(out);
}

/** 压缩包：预览内容、在设备上解压、压缩 */
export function archiveRoutes() {
  const router = Router();

  router.get(
    "/archive",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.query.path);
      const format = archiveFormat(p);
      if (!format) throw new adb.AdbError(msg("notArchive"), 415);
      const ctx = await ctxOf(req);
      // 先确认文件存在且可读，否则列不出内容会被当成空压缩包
      await fs.fileSize(ctx, p);
      const entries = await listEntries(ctx, p, format);
      res.json({
        format,
        entries: entries.slice(0, LIST_LIMIT),
        truncated: entries.length > LIST_LIMIT,
      } satisfies ArchiveListing);
    }),
  );

  router.post(
    "/extract",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.body.path);
      const format = archiveFormat(p);
      if (!format) throw new adb.AdbError(msg("notArchive"), 415);
      const ctx = await ctxOf(req);
      await fs.fileSize(ctx, p);
      const entries = await listEntries(ctx, p, format);
      assertSafeEntries(entries);
      const result = await fs.extract(ctx, p, format, topLevelSingle(entries), extractName(posix.basename(p)));
      res.json({ path: result } satisfies ExtractResult);
    }),
  );

  router.post(
    "/compress",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const format = formatOf(req.body.format);
      const ctx = await ctxOf(req);
      const { base, names } = packBase(paths);
      // 先确认都存在，不存在时给出明确的 404，而不是工具的报错
      for (const n of names) await fs.isDir(ctx, posix.join(base, n));
      const name = packName(names, format);
      const ref = startJob<CompressResult>(req, async (job) => {
        if (format === "zip") {
          const result = await compressZip(ctx, base, names, name, job);
          return result.skipped ? result : { path: result.path };
        }
        // tar 系在设备上执行，没有进度，进行中不能取消
        job.phase("compressing", { cancelable: false });
        return { path: await fs.pack(ctx, base, names, format, name) };
      });
      res.json(ref satisfies JobRef);
    }),
  );

  return router;
}
