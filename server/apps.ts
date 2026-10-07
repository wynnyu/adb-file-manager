import { Router } from "express";
import type { AppDetail, AppEntry, AppPermission, AppState } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg as t } from "./i18n.ts";
import { serialOf, wrap } from "./request.ts";

const SPLIT = "__ADBFM_SPLIT__";

const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;

/** 校验并返回包名；允许 android 这类单段包名。拼进命令时仍要经 adb.q() */
export function assertPackage(v: unknown): string {
  if (typeof v !== "string" || v.length > 255 || !PACKAGE_RE.test(v)) throw new adb.AdbError(t("badPackage"), 400);
  return v;
}

/**
 * 一次 shell 取四段，以 SPLIT 分隔：全部包（含已卸载，带路径和 uid）、系统包、已停用包、当前用户已安装的包。
 * 老系统的 pm 不认识 -U 时降级为不带 uid。pm 命令默认作用于用户 0
 */
export function listCmd() {
  return [
    "(pm list packages -f -U -u 2>/dev/null || pm list packages -f -u)",
    "pm list packages -s -u",
    "pm list packages -d",
    "pm list packages",
  ].join(`; echo ${SPLIT}; `);
}

/** 解析 pm list packages -f -U 的一行；路径里可能含 =，按最后一个 = 切 */
export function parsePackageLine(line: string): { pkg: string; path: string; uid?: number } | undefined {
  const m = /^package:(.+)=([^\s=]+)(?:\s+uid:(\d+))?/.exec(line.replace(/\r$/, ""));
  if (!m) return undefined;
  return { pkg: m[2], path: m[1], uid: m[3] === undefined ? undefined : Number(m[3]) };
}

/** pm list packages 不带 -f 时每行为 package:<包名> */
function pkgSet(part: string) {
  const set = new Set<string>();
  for (const line of part.split("\n")) {
    const m = /^package:(\S+)/.exec(line.replace(/\r$/, ""));
    if (m) set.add(m[1]);
  }
  return set;
}

/** 解析 listCmd 的输出，按包名排序 */
export function parseAppList(out: string): AppEntry[] {
  const [all = "", system = "", disabled = "", installed = ""] = out.split(SPLIT);
  const systemSet = pkgSet(system);
  const disabledSet = pkgSet(disabled);
  const installedSet = pkgSet(installed);
  const entries: AppEntry[] = [];
  for (const line of all.split("\n")) {
    const p = parsePackageLine(line);
    if (!p) continue;
    // 已安装集合为空多半是该条命令失败了，此时不把全部应用标成已卸载
    const state: AppState =
      installedSet.size > 0 && !installedSet.has(p.pkg)
        ? "uninstalled"
        : disabledSet.has(p.pkg)
          ? "disabled"
          : "enabled";
    const entry: AppEntry = { pkg: p.pkg, path: p.path, system: systemSet.has(p.pkg), state };
    if (p.uid !== undefined) entry.uid = p.uid;
    entries.push(entry);
  }
  return entries.sort((a, b) => (a.pkg < b.pkg ? -1 : a.pkg > b.pkg ? 1 : 0));
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/** 取某一行之后缩进更深的连续行（空行不中断） */
function childLines(lines: string[], at: number): string[] {
  const base = indentOf(lines[at]);
  const out: string[] = [];
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].trim() && indentOf(lines[i]) <= base) break;
    out.push(lines[i]);
  }
  return out;
}

/** 找到顶格的 header 行（如 Packages:）下的全部行 */
function section(lines: string[], header: string): string[] {
  const at = lines.findIndex((l) => l.trimEnd() === header);
  return at < 0 ? [] : childLines(lines, at);
}

/** 在一段行里找 Package [pkg] 的块，返回块内的行；找不到为 undefined */
function packageBlock(lines: string[], pkg: string): string[] | undefined {
  const at = lines.findIndex((l) => l.trimStart().startsWith(`Package [${pkg}]`));
  return at < 0 ? undefined : childLines(lines, at);
}

const permName = (line: string) => /^[^\s:,]+/.exec(line.trim())?.[0];

/** 一个权限列表标题（如 requested permissions:）下的权限行，及各行是否带 granted=true */
function permItems(lines: string[], header: string): { name: string; granted?: boolean }[] {
  const at = lines.findIndex((l) => l.trim() === header);
  if (at < 0) return [];
  const items: { name: string; granted?: boolean }[] = [];
  for (const line of childLines(lines, at)) {
    const name = permName(line);
    if (!name) continue;
    const g = /\bgranted=(true|false)/.exec(line);
    items.push({ name, granted: g ? g[1] === "true" : undefined });
  }
  return items;
}

/** 解析 dumpsys package <包名> 的输出；找不到该包时抛出 404 */
export function parseAppDetail(out: string, pkg: string): AppDetail {
  const lines = out.split("\n").map((l) => l.replace(/\r$/, ""));
  const block = packageBlock(section(lines, "Packages:"), pkg);
  if (!block) throw new adb.AdbError(t("noPackage", { pkg }), 404);
  const updatedSystem = packageBlock(section(lines, "Hidden system packages:"), pkg) !== undefined;

  // 只看块内第一层的字段行，避免权限等子块里的同名内容干扰
  const top = block.filter((l) => l.trim()).reduce((min, l) => Math.min(min, indentOf(l)), Number.POSITIVE_INFINITY);
  const fields = block.filter((l) => l.trim() && indentOf(l) === top).map((l) => l.trim());
  const line = (key: string) => fields.find((l) => l.startsWith(`${key}=`));
  const val = (key: string) => {
    const v = line(key)
      ?.slice(key.length + 1)
      .trim();
    return v && v !== "null" ? v : undefined;
  };
  const num = (s: string | undefined) => (s !== undefined && /^\d+$/.test(s) ? Number(s) : undefined);
  const tok = (key: string, name: string) => {
    const m = new RegExp(`(?:^|\\s)${name}=(\\d+)`).exec(line(key) ?? "");
    return m ? Number(m[1]) : undefined;
  };

  const flagText = /^\[(.*)\]$/.exec(val("pkgFlags") ?? "")?.[1] ?? "";
  const detail: AppDetail = {
    pkg,
    versionName: val("versionName"),
    versionCode: tok("versionCode", "versionCode"),
    minSdk: tok("versionCode", "minSdk"),
    targetSdk: tok("versionCode", "targetSdk"),
    firstInstall: val("firstInstallTime"),
    lastUpdate: val("lastUpdateTime"),
    installer: val("installerPackageName"),
    codePath: val("codePath"),
    dataDir: val("dataDir"),
    abi: val("primaryCpuAbi"),
    uid: num(val("userId")),
    flags: flagText.split(/\s+/).filter(Boolean),
    updatedSystem,
    permissions: [],
  };

  const perms = new Map<string, AppPermission>();
  const put = (name: string, runtime: boolean, granted?: boolean) => {
    const cur = perms.get(name);
    if (!cur) perms.set(name, { name, runtime, ...(granted === undefined ? {} : { granted }) });
    else {
      cur.runtime = runtime;
      if (granted !== undefined) cur.granted = granted;
    }
  };
  for (const p of permItems(block, "requested permissions:")) put(p.name, false);
  // 老系统（6.0 之前）只有已授予列表，不区分运行时权限
  for (const p of permItems(block, "grantedPermissions:")) put(p.name, false, true);
  for (const p of permItems(block, "install permissions:")) put(p.name, false, p.granted ?? true);
  const user0 = block.findIndex((l) => /^\s*User 0:/.test(l));
  if (user0 >= 0) {
    for (const p of permItems(childLines(block, user0), "runtime permissions:")) put(p.name, true, p.granted ?? true);
  }
  detail.permissions = [...perms.values()];

  // 去掉值为 undefined 的字段，响应里只保留解析到的
  return Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== undefined)) as unknown as AppDetail;
}

/** 应用相关接口：列表和详情。只读，不需要 root */
export function appRoutes() {
  const router = Router();

  router.get(
    "/",
    wrap(async (req, res) => {
      res.json(parseAppList(await adb.shell({ serial: serialOf(req), root: false }, listCmd())));
    }),
  );

  router.get(
    "/info",
    wrap(async (req, res) => {
      const serial = serialOf(req);
      const pkg = assertPackage(req.query.pkg);
      res.json(parseAppDetail(await adb.shell({ serial, root: false }, `dumpsys package ${adb.q(pkg)}`), pkg));
    }),
  );

  return router;
}
