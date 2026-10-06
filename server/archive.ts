import posix from "node:path/posix";
import { Router } from "express";
import type { ArchiveEntry, ArchiveFormat, ArchiveListing, ExtractResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";
import { ctxOf, wrap } from "./request.ts";

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
  const out = await adb.listArchive(ctx, p, format);
  return format === "zip" ? parseZipList(out) : parseTarList(out);
}

/** 压缩包：预览内容、在设备上解压 */
export function archiveRoutes() {
  const router = Router();

  router.get(
    "/api/archive",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.query.path);
      const format = archiveFormat(p);
      if (!format) throw new adb.AdbError(msg("notArchive"), 415);
      const ctx = await ctxOf(req);
      // 先确认文件存在且可读，否则列不出内容会被当成空压缩包
      await adb.fileSize(ctx, p);
      const entries = await listEntries(ctx, p, format);
      res.json({
        format,
        entries: entries.slice(0, LIST_LIMIT),
        truncated: entries.length > LIST_LIMIT,
      } satisfies ArchiveListing);
    }),
  );

  router.post(
    "/api/extract",
    wrap(async (req, res) => {
      const p = adb.assertAbs(req.body.path);
      const format = archiveFormat(p);
      if (!format) throw new adb.AdbError(msg("notArchive"), 415);
      const ctx = await ctxOf(req);
      await adb.fileSize(ctx, p);
      const entries = await listEntries(ctx, p, format);
      assertSafeEntries(entries);
      const result = await adb.extract(ctx, p, format, topLevelSingle(entries), extractName(posix.basename(p)));
      res.json({ path: result } satisfies ExtractResult);
    }),
  );

  return router;
}
