import posix from "node:path/posix";
import { Router } from "express";
import type { DirUsage, FileStat, LinkInfo, OkResult, PartitionInfo } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { assertSafeTargets, isProtectedPath } from "./guard.ts";
import { msg as t } from "./i18n.ts";
import { ctxOf, pathsOf, wrap } from "./request.ts";

const NOFILE = "__ADBFM_NOFILE__";
const NOPERM = "__ADBFM_NOPERM__";
const LINK = "__ADBFM_LINK__";
const BROKEN = "__ADBFM_BROKEN__";
const MOUNTS = "__ADBFM_MOUNTS__";
const SPLIT = "__ADBFM_SPLIT__";

/** 递归统计的最长耗时，超过后放弃，避免占住 adb 连接 */
const USAGE_TIMEOUT = 120_000;

/**
 * stat 的格式依次降级：完整格式、不含 SELinux 上下文、只含基本字段。
 * 老设备的 stat 不认识的格式符会让整条命令失败，所以逐级重试
 */
const STAT_FORMATS = [
  "%F|%s|%Y|%Z|%a|%u|%g|%U|%G|%i|%h|%C",
  "%F|%s|%Y|%Z|%a|%u|%g|%U|%G|%i|%h",
  "%F|%s|%Y|%Z|%a|%u|%g",
];

/** 读取单个条目基本信息的设备端命令；符号链接不跟随，另外附上目标的信息 */
export function statCmd(p: string) {
  const tries = STAT_FORMATS.map((f) => `stat -c '${f}' ${adb.q(p)} 2>/dev/null`).join(" || ");
  return (
    `if [ ! -e ${adb.q(p)} ] && [ ! -L ${adb.q(p)} ]; then echo ${NOFILE}; ` +
    `else (${tries}) || echo ${NOPERM}; ` +
    `if [ -L ${adb.q(p)} ]; then echo ${LINK}; readlink ${adb.q(p)}; ` +
    `stat -L -c '%F|%s' ${adb.q(p)} 2>/dev/null || echo ${BROKEN}; fi; fi; ` +
    `echo ${MOUNTS}; df -k ${adb.q(p)} 2>/dev/null | tail -n 1; echo ${SPLIT}; cat /proc/mounts 2>/dev/null`
  );
}

const kindOf = (kind: string): FileStat["type"] =>
  kind === "directory" ? "dir" : kind === "symbolic link" ? "link" : "file";

/** 解析 statCmd 的输出；条目不存在或无权限时抛出 404 / 403 */
export function parseStat(out: string, p: string, root = false): Omit<FileStat, "protected"> {
  const [head = "", mountPart = ""] = out.split(MOUNTS);
  const lines = head.split("\n").map((l) => l.replace(/\r$/, ""));
  if (lines[0] === NOFILE) throw new adb.AdbError(t("noFile", { path: p }), 404);
  if (lines[0] === NOPERM) throw new adb.AdbError(t(root ? "noReadRoot" : "noRead", { path: p }), 403);
  const f = lines[0].split("|");
  if (f.length < 7) throw new adb.AdbError(t("adbFailed"));
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : undefined);
  const stat: Omit<FileStat, "protected"> = {
    name: posix.basename(p) || "/",
    path: p,
    type: kindOf(f[0]),
    size: num(f[1]) ?? 0,
    mtime: num(f[2]) ?? 0,
    ctime: num(f[3]) ?? 0,
    mode: Number.parseInt(f[4], 8) || 0,
    uid: num(f[5]) ?? 0,
    gid: num(f[6]) ?? 0,
    user: f[7] || undefined,
    group: f[8] || undefined,
    inode: num(f[9]),
    links: num(f[10]),
    // 上下文里可能含 |，取剩余部分
    context: f.slice(11).join("|") || undefined,
  };
  const at = lines.indexOf(LINK);
  if (at >= 0) stat.link = parseLink(p, lines[at + 1] ?? "", lines[at + 2] ?? BROKEN);
  const partition = parsePartition(mountPart);
  if (partition) stat.partition = partition;
  return stat;
}

function parseLink(p: string, target: string, resolvedStat: string): LinkInfo {
  const resolved = posix.resolve(posix.dirname(p), target);
  if (resolvedStat === BROKEN) return { target, resolved, broken: true };
  const [kind, size] = resolvedStat.split("|");
  return {
    target,
    resolved,
    broken: false,
    targetType: kind === "directory" ? "dir" : "file",
    targetSize: Number(size) || 0,
  };
}

/** /proc/mounts 里挂载点中的空格等字符以八进制转义 */
const unescapeMount = (s: string) =>
  s.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(Number.parseInt(o, 8)));

/** 解析 df -k 的最后一行，再到 /proc/mounts 里按挂载点找文件系统类型；两段以 SPLIT 分隔 */
export function parsePartition(out: string): PartitionInfo | undefined {
  const [dfPart = "", mountsPart = ""] = out.split(SPLIT);
  const cols = dfPart.trim().split(/\s+/);
  // 文件系统 总量 已用 可用 使用率 挂载点；挂载点含空格时 df 会拆成多列，合并回去
  if (cols.length < 6) return undefined;
  const [device, total, , avail] = cols;
  const mount = cols.slice(5).join(" ");
  if (!/^\d+$/.test(total) || !/^\d+$/.test(avail) || !mount.startsWith("/")) return undefined;
  let fsType: string | undefined;
  for (const line of mountsPart.split("\n")) {
    const m = line.trim().split(/\s+/);
    // 同一挂载点可能被多次挂载，以最后一条为准
    if (m.length >= 3 && unescapeMount(m[1]) === mount) fsType = m[2];
  }
  return { mount, device, fsType, total: Number(total) * 1024, free: Number(avail) * 1024 };
}

export async function stat(ctx: adb.Ctx, p: string): Promise<FileStat> {
  const out = await adb.shell(ctx, statCmd(p));
  return { ...parseStat(out, p, Boolean(ctx.root)), protected: await isProtectedPath(ctx, p) };
}

/**
 * 递归统计文件夹：一遍 find 数子文件夹，一遍 find 取全部非目录条目的大小。
 * 错误行混在输出里，非数字行说明有子项读不了
 */
export function usageCmd(p: string) {
  const base = p === "/" ? "/" : `${p}/`;
  return (
    `find ${adb.q(base)} -type d 2>&1 | grep -c '^/'; echo ${SPLIT}; ` +
    `find ${adb.q(base)} ! -type d -exec stat -c %s {} + 2>&1`
  );
}

export function parseUsage(out: string): DirUsage {
  const [dirPart = "", sizePart = ""] = out.split(SPLIT);
  let size = 0;
  let files = 0;
  let partial = false;
  for (const raw of sizePart.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\d+$/.test(line)) {
      size += Number(line);
      files++;
    } else partial = true;
  }
  // grep -c 数到的目录包含自身
  const dirs = Math.max(0, (Number.parseInt(dirPart.trim(), 10) || 0) - 1);
  return { size, files, dirs, partial };
}

export async function usage(ctx: adb.Ctx, p: string, signal?: AbortSignal): Promise<DirUsage> {
  if (!(await adb.isDir(ctx, p))) throw new adb.AdbError(t("notDir", { path: p }), 400);
  return parseUsage(await adb.shell(ctx, usageCmd(p), { signal, timeout: USAGE_TIMEOUT }));
}

/** 属性相关接口：查看信息，修改权限和所有者 */
export function propertyRoutes() {
  const router = Router();

  router.get(
    "/api/stat",
    wrap(async (req, res) => {
      res.json(await stat(await ctxOf(req), adb.assertAbs(req.query.path)));
    }),
  );

  router.get(
    "/api/usage",
    wrap(async (req, res) => {
      // 客户端关闭页面或取消请求时终止设备上的 find
      const ac = new AbortController();
      res.on("close", () => {
        if (!res.writableEnded) ac.abort();
      });
      res.json(await usage(await ctxOf(req), adb.assertAbs(req.query.path), ac.signal));
    }),
  );

  router.post(
    "/api/chmod",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const mode = adb.parseModeInput(req.body.mode);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, paths, "change");
      await adb.chmod(ctx, paths, mode, req.body.recursive === true);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/api/chown",
    wrap(async (req, res) => {
      const paths = pathsOf(req.body.paths);
      const owner = adb.parseOwnerInput(req.body.owner);
      const group = adb.parseOwnerInput(req.body.group);
      if (!owner && !group) throw new adb.AdbError(t("missingOwner"), 400);
      const ctx = await ctxOf(req);
      await assertSafeTargets(ctx, paths, "change");
      await adb.chown(ctx, paths, owner, group, req.body.recursive === true);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  return router;
}
