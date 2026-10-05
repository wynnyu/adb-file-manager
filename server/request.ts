import type { NextFunction, Request, Response } from "express";
import type { RootMethod } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";

type Handler = (req: Request, res: Response) => Promise<unknown>;

/** 把 async 路由的异常交给错误处理中间件，root 请求出错时先经 rootGuard 复查 */
export const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch((err) => rootGuard(req, err).then(next));

const isRootRequest = (req: Request) => {
  const flag = req.query.root ?? req.body?.root;
  return flag === "1" || flag === true;
};

/**
 * root 请求失败时复查一次 su：权限被撤销的话清掉缓存，
 * 并以 root_lost 返回，让前端退出 root 模式
 */
async function rootGuard(req: Request, err: unknown) {
  const serial = req.query.serial ?? req.body?.serial;
  if (!isRootRequest(req) || typeof serial !== "string") return err;
  try {
    rootCache.set(serial, await adb.rootMethod(serial));
    return err;
  } catch (e) {
    // 只有 su 检查本身失败才算 root 失效；设备断开等连接错误保持原样
    if (!(e instanceof adb.AdbError && e.code === "no_root")) return err;
    rootCache.delete(serial);
    return new adb.AdbError(e.message, 403, "root_lost");
  }
}

export function serialOf(req: Request): string {
  const s = req.query.serial ?? req.body?.serial;
  if (typeof s !== "string" || !s) throw new adb.AdbError(msg("missingSerial"), 400);
  return s;
}

const rootCache = new Map<string, RootMethod>();

/** 取设备的 root 方式，有缓存；fresh 为 true 时重新检测 */
export async function rootFor(serial: string, fresh = false) {
  let m = fresh ? undefined : rootCache.get(serial);
  if (!m) {
    rootCache.delete(serial);
    m = await adb.rootMethod(serial);
    rootCache.set(serial, m);
  }
  return m;
}

/** 请求带 root=1 时以 root 身份执行 */
export async function ctxOf(req: Request): Promise<adb.Ctx> {
  const serial = serialOf(req);
  const root = isRootRequest(req) ? await rootFor(serial) : false;
  return { serial, root };
}

export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  return [];
}

/** 取 paths 参数，必须是非空的绝对路径列表 */
export function pathsOf(v: unknown): string[] {
  const paths = asList(v).map(adb.assertAbs);
  if (!paths.length) throw new adb.AdbError(msg("missingPaths"), 400);
  return paths;
}

/** 取上传的 paths 字段：JSON 编码的相对路径数组，缺省时为空数组（使用 multipart 文件名） */
export function uploadPathsOf(v: unknown): string[] {
  if (v === undefined) return [];
  let rel: unknown;
  try {
    rel = JSON.parse(String(v));
  } catch {
    throw new adb.AdbError(msg("badUploadPaths"), 400);
  }
  if (!Array.isArray(rel) || !rel.every((p) => typeof p === "string")) {
    throw new adb.AdbError(msg("badUploadPaths"), 400);
  }
  return rel;
}
