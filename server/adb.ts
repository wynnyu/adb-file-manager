import { execFile, spawn } from "node:child_process";
import path from "node:path/posix";
import type { Device, ErrorCode, FileEntry, RootMethod, StorageInfo } from "../shared/types.d.ts";
import { msg as t } from "./i18n.ts";

const ADB = process.env.ADB_PATH || "adb";
/** 提权命令前缀，默认 `su -c`（Magisk / KernelSU / APatch 通用） */
const SU = process.env.ADBFM_SU || "su -c";

export class AdbError extends Error {
  constructor(
    message: string,
    public status = 500,
    /** 给前端识别的错误类型，例如 root_lost */
    public code?: ErrorCode,
  ) {
    super(message);
  }
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

/** 同 run，但以 Buffer 返回 stdout，用于读取文件内容 */
function runBuffer(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new AdbError(cleanError((stderr.toString() || err.message).trim())));
      else resolve(stdout);
    });
  });
}

function cleanError(msg: string) {
  const line = msg.split("\n").find((l) => /error|denied|no such|not found|failed/i.test(l));
  return (line ?? msg).replace(/^adb: (error: )?/, "").trim() || t("adbFailed");
}

/** 单引号转义，用于拼接设备端 shell 命令 */
export function q(s: string) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function assertAbs(p: unknown): string {
  if (typeof p !== "string" || !p.startsWith("/") || p.includes("\0")) {
    throw new AdbError(t("pathNotAbsolute"), 400);
  }
  return path.normalize(p);
}

/**
 * 一次请求的设备上下文。
 * root: "adbd" = adbd 本身就是 root（adb root），"su" = 通过 su 提权，false = 普通 shell 用户
 */
export interface Ctx {
  serial: string;
  root: false | RootMethod;
}

export function shell(ctx: Ctx, cmd: string) {
  const full = ctx.root === "su" ? `${SU} ${q(cmd)}` : cmd;
  return run(["-s", ctx.serial, "shell", full]);
}

/** 检测设备能否以 root 运行命令 */
export async function rootMethod(serial: string): Promise<RootMethod> {
  // 普通 shell 都跑不通说明是连接问题（设备断开、未授权），原样抛出，不当成“没有 root”
  const plain = await shell({ serial, root: false }, "id -u");
  if (plain.trim() === "0") return "adbd";
  const viaSu = await shell({ serial, root: "su" }, "id -u").catch((e: Error) => e.message);
  if (viaSu.trim() === "0") return "su";
  const out = viaSu.trim();
  throw new AdbError(
    /su: (inaccessible or )?not found/i.test(out)
      ? t("noSu")
      : /^\d+$/.test(out)
        ? t("suNotRoot", { uid: out })
        : t("rootDenied", { msg: out || t("suRefused") }),
    403,
    "no_root",
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

export const LINK_MARK = "__ADBFM_LINKDIRS__";

export async function ls(ctx: Ctx, dir: string): Promise<FileEntry[]> {
  // 末尾加 / 让 find 跟随 /sdcard 这类符号链接目录
  const base = dir === "/" ? "/" : dir + "/";
  const cmd =
    `find ${q(base)} -mindepth 1 -maxdepth 1 -exec stat -c '%F|%s|%Y|%X|%n' {} + 2>/dev/null; ` +
    `echo ${LINK_MARK}; ` +
    `find ${q(base)} -mindepth 1 -maxdepth 1 -type l -exec sh -c 'for f; do [ -d "$f" ] && echo "$f"; done' _ {} + 2>/dev/null; ` +
    `if [ ! -d ${q(base)} ]; then echo __ADBFM_NOTDIR__; elif [ ! -r ${q(base)} ]; then echo __ADBFM_NOPERM__; fi`;
  const out = await shell(ctx, cmd);
  if (out.includes("__ADBFM_NOTDIR__")) throw new AdbError(t("noDir", { path: dir }), 404);
  if (out.includes("__ADBFM_NOPERM__")) {
    throw new AdbError(t(ctx.root ? "noReadRoot" : "noRead", { path: dir }), 403);
  }
  return parseLs(out);
}

/** 解析 ls 的输出：每行 `类型|大小|mtime|atime|路径`，LINK_MARK 之后是指向目录的符号链接 */
export function parseLs(out: string): FileEntry[] {
  const [statPart, linkPart = ""] = out.split(LINK_MARK);
  const linkDirs = new Set(
    linkPart
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const entries: FileEntry[] = [];
  for (const line of statPart.split("\n")) {
    if (!line) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const [kind, size, mtime, atime] = parts;
    const full = parts.slice(4).join("|").replace(/\r$/, "");
    const p = path.normalize(full);
    const type = kind === "directory" ? "dir" : kind === "symbolic link" ? "link" : "file";
    entries.push({
      name: path.basename(p),
      path: p,
      type,
      isDir: type === "dir" || (type === "link" && linkDirs.has(full)),
      size: Number(size) || 0,
      mtime: Number(mtime) || 0,
      atime: Number(atime) || 0,
    });
  }
  return entries;
}

export async function isDir(ctx: Ctx, p: string) {
  const out = await shell(ctx, `[ -d ${q(p)} ] && echo D || ([ -e ${q(p)} ] && echo F || echo N)`);
  const r = out.trim();
  if (r === "N") throw new AdbError(t("noFile", { path: p }), 404);
  return r === "D";
}

/** 解析符号链接后的真实路径（readlink -f），不存在的路径原样返回 */
export async function realpaths(ctx: Ctx, paths: string[]): Promise<string[]> {
  // 每个路径固定输出一行，解析失败时为空行
  const out = await shell(ctx, paths.map((p) => `echo "$(readlink -f ${q(p)} 2>/dev/null)"`).join("; "));
  const lines = out.split("\n").map((l) => l.replace(/\r$/, ""));
  return paths.map((p, i) => (lines[i]?.startsWith("/") ? path.normalize(lines[i]) : p));
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
    await checked(ctx, `mkdir -p ${q(stage)} && cp -R ${q(remote)} ${q(stage)}/ && chmod -R a+rX ${q(stage)}`);
    await run(["-s", ctx.serial, "pull", "-a", `${stage}/${path.basename(remote)}`, local]);
  } finally {
    await shell(ctx, `rm -rf ${q(stage)}`).catch(() => {});
  }
}

async function checked(ctx: Ctx, cmd: string) {
  // 包进子 shell：2>&1 作用于整条命令；命令里的 exit 只退出子 shell，
  // 整体总是返回 0（新版 adb 会透传退出码，否则会在这里之前就报错，拿不到下面的标记）
  const out = await shell(ctx, `(${cmd}) 2>&1 && echo __ADBFM_OK__; true`);
  if (out.includes("__ADBFM_EXISTS__")) throw new AdbError(t("targetExists"), 400);
  if (!out.includes("__ADBFM_OK__")) throw new AdbError(cleanError(out.trim()), 400);
}

export const mkdir = (ctx: Ctx, p: string) => checked(ctx, `mkdir -p ${q(p)}`);
export const rename = (ctx: Ctx, from: string, to: string) =>
  checked(ctx, `[ ! -e ${q(to)} ] || { echo __ADBFM_EXISTS__; exit 1; }; mv ${q(from)} ${q(to)}`);
export const remove = (ctx: Ctx, paths: string[]) => checked(ctx, `rm -rf ${paths.map(q).join(" ")}`);

/** 复制到目标目录下；重名时依次改成“名字 2.扩展名”“名字 3.扩展名”……，从不覆盖 */
export function copyInto(ctx: Ctx, src: string, destDir: string) {
  const name = path.basename(src);
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  // 目录名里的点不算扩展名（com.example.app 不该变成 com.example 2.app）
  return checked(
    ctx,
    `b=${q(base)}; e=${q(ext)}; [ -d ${q(src)} ] && { b=${q(name)}; e=; }; ` +
      `t=${q(destDir)}/"$b$e"; i=2; while [ -e "$t" ]; do t=${q(destDir)}/"$b $i$e"; i=$((i+1)); done; ` +
      `cp -R ${q(src)} "$t"`,
  );
}

/** exec-out 的参数：su 模式下包上提权前缀；exec-out 不经过 pty，二进制内容不会被改写 */
const execOut = (ctx: Ctx, cmd: string) => ["-s", ctx.serial, "exec-out", ctx.root === "su" ? `${SU} ${q(cmd)}` : cmd];

/** 文件中的一段字节，start 和 end 都包含在内 */
export interface ByteRange {
  start: number;
  end: number;
}

/**
 * 读取文件的设备端命令。给出 range 时只读这一段，数字来自 parseRange，保证是非负整数。
 * 分段读取用 dd 直接跳到起点，不必像 tail 那样从头读到起点；
 * Android 10 之前的 toybox dd 不认识 skip_bytes，会立即失败且没有输出，这时退回 tail 和 head
 */
export function catCmd(p: string, range?: ByteRange) {
  // exec-out 会把设备端的 stderr 混进输出，错误信息不能当成文件内容
  if (!range) return `cat ${q(p)} 2>/dev/null`;
  const len = range.end - range.start + 1;
  return (
    `dd if=${q(p)} bs=65536 skip=${range.start} count=${len} iflag=skip_bytes,count_bytes 2>/dev/null || ` +
    `tail -c +${range.start + 1} ${q(p)} 2>/dev/null | head -c ${len}`
  );
}

/** 以字节流读取设备上的文件（adb exec-out，不经过电脑临时目录） */
export function cat(ctx: Ctx, p: string, range?: ByteRange) {
  return spawn(ADB, execOut(ctx, catCmd(p, range)), { stdio: ["ignore", "pipe", "ignore"] });
}

/** 读取文件开头的 n 个字节 */
export const head = (ctx: Ctx, p: string, n: number) => runBuffer(execOut(ctx, `head -c ${n} ${q(p)} 2>/dev/null`));

/** 文件大小，符号链接取目标的大小；不存在或不可读时抛出 404 / 403 */
export async function fileSize(ctx: Ctx, p: string) {
  const out = await shell(
    ctx,
    `if [ ! -e ${q(p)} ]; then echo __ADBFM_NOFILE__; elif [ ! -r ${q(p)} ]; then echo __ADBFM_NOPERM__; ` +
      `else stat -L -c %s ${q(p)}; fi`,
  );
  if (out.includes("__ADBFM_NOFILE__")) throw new AdbError(t("noFile", { path: p }), 404);
  if (out.includes("__ADBFM_NOPERM__")) throw new AdbError(t(ctx.root ? "noReadRoot" : "noRead", { path: p }), 403);
  const size = Number(out.trim());
  if (!Number.isSafeInteger(size) || size < 0) throw new AdbError(cleanError(out.trim()));
  return size;
}

export async function storage(ctx: Ctx): Promise<StorageInfo> {
  const out = await shell(ctx, "df -k /sdcard/ | tail -n 1");
  const [, total, , avail] = out.trim().split(/\s+/).map(Number);
  if (!total) throw new AdbError(t("noStorage"));
  return { total: total * 1024, free: avail * 1024 };
}
