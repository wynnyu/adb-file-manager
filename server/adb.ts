import { execFile } from "node:child_process";
import path from "node:path/posix";

const ADB = process.env.ADB_PATH || "adb";
/** 提权命令前缀，默认 `su -c`（Magisk / KernelSU / APatch 通用） */
const SU = process.env.ADBFM_SU || "su -c";

export class AdbError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export interface Device {
  serial: string;
  state: string;
  model: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  type: "dir" | "file" | "link";
  isDir: boolean;
  size: number;
  mtime: number;
}

function run(args: string[], timeout = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { maxBuffer: 64 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr || stdout || err.message).trim();
        reject(new AdbError(cleanError(msg)));
      } else resolve(stdout);
    });
  });
}

function cleanError(msg: string) {
  const line = msg.split("\n").find((l) => /error|denied|no such|not found|failed/i.test(l));
  return (line ?? msg).replace(/^adb: (error: )?/, "").trim() || "adb 执行失败";
}

/** 单引号转义，用于拼接设备端 shell 命令 */
export function q(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function assertAbs(p: unknown): string {
  if (typeof p !== "string" || !p.startsWith("/") || p.includes("\0")) {
    throw new AdbError("路径必须是绝对路径", 400);
  }
  return path.normalize(p);
}

/**
 * 一次请求的设备上下文。
 * root: "adbd" = adbd 本身就是 root（adb root），"su" = 通过 su 提权，false = 普通 shell 用户
 */
export interface Ctx {
  serial: string;
  root: false | "adbd" | "su";
}

export function shell(ctx: Ctx, cmd: string) {
  const full = ctx.root === "su" ? `${SU} ${q(cmd)}` : cmd;
  return run(["-s", ctx.serial, "shell", full]);
}

/** 检测设备能否以 root 运行命令 */
export async function rootMethod(serial: string): Promise<"adbd" | "su"> {
  const plain = await shell({ serial, root: false }, "id -u").catch(() => "");
  if (plain.trim() === "0") return "adbd";
  const viaSu = await shell({ serial, root: "su" }, "id -u").catch((e: Error) => e.message);
  if (viaSu.trim() === "0") return "su";
  const msg = viaSu.trim();
  throw new AdbError(
    /not found|inaccessible/i.test(msg)
      ? "这台设备没有 root（找不到 su）"
      : /^\d+$/.test(msg)
        ? `su 没有切换到 root（uid=${msg}）`
        : `无法获取 root 权限：${msg || "su 被拒绝"}。请在手机的 root 管理器里给 Shell 授权`,
    403,
  );
}

const nameCache = new Map<string, string>();

export async function devices(): Promise<Device[]> {
  const out = await run(["devices", "-l"], 10_000);
  const list: Device[] = [];
  for (const line of out.split("\n").slice(1)) {
    const m = line.trim().match(/^(\S+)\s+(\S+)(.*)$/);
    if (!m) continue;
    const [, serial, state, rest] = m;
    const model = (rest.match(/model:(\S+)/)?.[1] ?? "").replace(/_/g, " ");
    let name = nameCache.get(serial);
    if (!name && state === "device") {
      try {
        const props = await shell(
          { serial, root: false },
          "getprop ro.product.marketname; getprop ro.product.vendor.marketname; getprop ro.product.brand",
        );
        const [market, vendorMarket, brand] = props.split("\n").map((s) => s.trim());
        name = market || vendorMarket || [brand, model].filter(Boolean).join(" ");
        nameCache.set(serial, name);
      } catch {
        /* 忽略，使用 model */
      }
    }
    list.push({ serial, state, model, name: name || model || serial });
  }
  return list;
}

const LINK_MARK = "__ADBFM_LINKDIRS__";

export async function ls(ctx: Ctx, dir: string): Promise<FileEntry[]> {
  // 末尾加 / 让 find 跟随 /sdcard 这类符号链接目录
  const base = dir === "/" ? "/" : dir + "/";
  const cmd =
    `find ${q(base)} -mindepth 1 -maxdepth 1 -exec stat -c '%F|%s|%Y|%n' {} + 2>/dev/null; ` +
    `echo ${LINK_MARK}; ` +
    `find ${q(base)} -mindepth 1 -maxdepth 1 -type l -exec sh -c 'for f; do [ -d "$f" ] && echo "$f"; done' _ {} + 2>/dev/null; ` +
    `if [ ! -d ${q(base)} ]; then echo __ADBFM_NOTDIR__; elif [ ! -r ${q(base)} ]; then echo __ADBFM_NOPERM__; fi`;
  const out = await shell(ctx, cmd);
  if (out.includes("__ADBFM_NOTDIR__")) throw new AdbError(`目录不存在：${dir}`, 404);
  if (out.includes("__ADBFM_NOPERM__")) {
    throw new AdbError(ctx.root ? `没有权限读取：${dir}` : `没有权限读取 ${dir}，可以开启 root 模式后再试`, 403);
  }
  const [statPart, linkPart = ""] = out.split(LINK_MARK);
  const linkDirs = new Set(linkPart.split("\n").map((s) => s.trim()).filter(Boolean));
  const entries: FileEntry[] = [];
  for (const line of statPart.split("\n")) {
    if (!line) continue;
    const parts = line.split("|");
    if (parts.length < 4) continue;
    const [kind, size, mtime] = parts;
    const full = parts.slice(3).join("|").replace(/\r$/, "");
    const p = path.normalize(full);
    const type = kind === "directory" ? "dir" : kind === "symbolic link" ? "link" : "file";
    entries.push({
      name: path.basename(p),
      path: p,
      type,
      isDir: type === "dir" || (type === "link" && linkDirs.has(full)),
      size: Number(size) || 0,
      mtime: Number(mtime) || 0,
    });
  }
  return entries;
}

export async function isDir(ctx: Ctx, p: string) {
  const out = await shell(ctx, `[ -d ${q(p)} ] && echo D || ([ -e ${q(p)} ] && echo F || echo N)`);
  const r = out.trim();
  if (r === "N") throw new AdbError(`文件不存在：${p}`, 404);
  return r === "D";
}

/** su 模式下 adb push/pull 本身没有 root 权限，先经 /data/local/tmp 中转 */
const stagingDir = () => `/data/local/tmp/adbfm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function push(ctx: Ctx, locals: string[], remoteDir: string) {
  if (ctx.root !== "su") {
    await run(["-s", ctx.serial, "push", ...locals, remoteDir + "/"]);
    return;
  }
  const stage = stagingDir();
  const user: Ctx = { serial: ctx.serial, root: false };
  try {
    await checked(user, `mkdir -p ${q(stage)}`);
    await run(["-s", ctx.serial, "push", ...locals, stage + "/"]);
    await checked(ctx, `mkdir -p ${q(remoteDir)} && cp -R ${q(stage)}/. ${q(remoteDir)}/`);
  } finally {
    await shell(ctx, `rm -rf ${q(stage)}`).catch(() => {});
  }
}

export async function pull(ctx: Ctx, remote: string, local: string) {
  if (ctx.root !== "su") {
    await run(["-s", ctx.serial, "pull", "-a", remote, local]);
    return;
  }
  const stage = stagingDir();
  try {
    await checked(
      ctx,
      `mkdir -p ${q(stage)} && cp -R ${q(remote)} ${q(stage)}/ && chmod -R a+rX ${q(stage)}`,
    );
    await run(["-s", ctx.serial, "pull", "-a", `${stage}/${path.basename(remote)}`, local]);
  } finally {
    await shell(ctx, `rm -rf ${q(stage)}`).catch(() => {});
  }
}

async function checked(ctx: Ctx, cmd: string) {
  const out = await shell(ctx, `${cmd} 2>&1 && echo __ADBFM_OK__`);
  if (!out.includes("__ADBFM_OK__")) throw new AdbError(cleanError(out.trim()), 400);
}

export const mkdir = (ctx: Ctx, p: string) => checked(ctx, `mkdir -p ${q(p)}`);
export const rename = (ctx: Ctx, from: string, to: string) =>
  checked(ctx, `[ ! -e ${q(to)} ] || { echo "目标已存在"; exit 1; }; mv ${q(from)} ${q(to)}`);
export const remove = (ctx: Ctx, paths: string[]) => checked(ctx, `rm -rf ${paths.map(q).join(" ")}`);

export async function storage(ctx: Ctx) {
  const out = await shell(ctx, "df -k /sdcard/ | tail -n 1");
  const [, total, , avail] = out.trim().split(/\s+/).map(Number);
  if (!total) throw new AdbError("无法读取存储空间");
  return { total: total * 1024, free: avail * 1024 };
}
