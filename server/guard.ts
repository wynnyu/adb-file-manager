import posix from "node:path/posix";
import type { NextFunction, Request, Response } from "express";
import type { ErrorResponse } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function isLocalOrigin(origin: string) {
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && LOCAL_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/** 只接受本机访问：Host 校验防 DNS rebinding，Origin / Sec-Fetch-Site 校验防其他网页跨站提交（CSRF） */
export function localOnly(req: Request, res: Response, next: NextFunction) {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  if (!LOCAL_HOSTS.includes(host)) {
    res.status(403).json({ error: msg("forbiddenHost") } satisfies ErrorResponse);
    return;
  }
  const origin = req.headers.origin;
  const site = req.headers["sec-fetch-site"];
  if (
    (origin !== undefined && !isLocalOrigin(origin)) ||
    (site !== undefined && site !== "same-origin" && site !== "none")
  ) {
    res.status(403).json({ error: msg("forbiddenOrigin") } satisfies ErrorResponse);
    return;
  }
  next();
}

/**
 * 删除 / 移动前不允许碰的路径。会按原路径和 readlink -f 后的真实路径各查一次，
 * 所以 /sdcard、/storage/emulated/0、/storage/self/primary 是一回事。
 * /data 本身属于一级目录受保护，/data 下面的内容不做限制
 */
const PROTECTED: RegExp[] = [
  /^\/[^/]*$/, // 根目录和一级目录：/system、/data、/sdcard、/storage 等
  /^\/storage\/[^/]+$/, // /storage/emulated、/storage/self、SD 卡根目录
  /^\/storage\/(emulated|self)\/[^/]+$/, // 各用户的内部存储根目录
];

export function isProtected(p: string) {
  if (PROTECTED.some((re) => re.test(p))) return true;
  // /mnt 下是各种挂载点，只允许操作某个存储（emulated/N 或 SD 卡）里面的内容
  return p.startsWith("/mnt/") && !/\/(emulated\/\d+|[0-9A-F]{4}-[0-9A-F]{4})\/./i.test(p);
}

/** 路径本身或其真实路径是否受保护 */
export async function isProtectedPath(ctx: adb.Ctx, p: string) {
  const [real] = await adb.realpaths(ctx, [p]);
  return isProtected(p) || isProtected(real);
}

/** purpose 决定报错文案：delete 为删除或移动，change 为修改权限或所有者 */
export async function assertSafeTargets(ctx: adb.Ctx, paths: string[], purpose: "delete" | "change" = "delete") {
  const real = await adb.realpaths(ctx, paths);
  paths.forEach((p, i) => {
    if (isProtected(p) || isProtected(real[i])) {
      const shown = real[i] !== p ? msg("resolvesTo", { path: p, real: real[i] }) : p;
      throw new adb.AdbError(msg(purpose === "delete" ? "protectedPath" : "protectedChange", { shown }), 400);
    }
  });
}

/** 目标目录不能是源本身或它的子目录（按真实路径判断） */
export async function assertNotInside(ctx: adb.Ctx, sources: string[], dest: string) {
  const [realDest, ...realSrc] = await adb.realpaths(ctx, [dest, ...sources]);
  realSrc.forEach((s, i) => {
    if (realDest === s || realDest.startsWith(s + "/")) {
      throw new adb.AdbError(msg("intoItself", { name: posix.basename(sources[i]) }), 400);
    }
  });
}
