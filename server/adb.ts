import { execFile, spawn } from "node:child_process";
import path from "node:path/posix";
import type { ArchiveFormat, Device, ErrorCode, FileEntry, RootMethod, StorageInfo } from "../shared/types.d.ts";
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

function run(args: string[], timeout = 0, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { maxBuffer: 64 * 1024 * 1024, timeout, signal }, (err, stdout, stderr) => {
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

/** 在设备上执行命令；给出 signal 时可中途取消，timeout 单位毫秒，0 为不限 */
export function shell(ctx: Ctx, cmd: string, opts: { signal?: AbortSignal; timeout?: number } = {}) {
  const full = ctx.root === "su" ? `${SU} ${q(cmd)}` : cmd;
  return run(["-s", ctx.serial, "shell", full], opts.timeout, opts.signal);
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

/** 持续 unauthorized 多久后自动重新握手一次，留出时间让第一次弹窗正常显示和点击 */
export const AUTH_RETRY_DELAY = 8_000;

export interface AuthWatch {
  since: number;
  retried: boolean;
}

/**
 * 根据当前设备列表更新 unauthorized 的计时记录，返回本次需要重新握手的 serial。
 * 状态变化或设备消失时清除记录，重新插拔后会再重试一次。
 */
export function pickAuthRetries(list: Pick<Device, "serial" | "state">[], now: number, state: Map<string, AuthWatch>) {
  const pending = new Set(list.filter((d) => d.state === "unauthorized").map((d) => d.serial));
  for (const serial of state.keys()) if (!pending.has(serial)) state.delete(serial);
  const retry: string[] = [];
  for (const serial of pending) {
    const watch = state.get(serial);
    if (!watch) state.set(serial, { since: now, retried: false });
    else if (!watch.retried && now - watch.since >= AUTH_RETRY_DELAY) {
      watch.retried = true;
      retry.push(serial);
    }
  }
  return retry;
}

const authWatch = new Map<string, AuthWatch>();

/** 断开并重连 offline 和 unauthorized 的传输，设备会重新弹出授权提示，不影响已授权的设备 */
export async function reconnectOffline() {
  await run(["reconnect", "offline"], 10_000);
}

/** 重启 adb 服务；kill-server 在服务未运行时会报错，忽略即可 */
export async function restartServer() {
  await run(["kill-server"], 10_000).catch(() => {});
  await run(["start-server"], 15_000);
}

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
  if (pickAuthRetries(list, Date.now(), authWatch).length) reconnectOffline().catch(() => {});
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

/** 执行命令并要求成功，返回去掉成功标记后的输出 */
async function checked(ctx: Ctx, cmd: string) {
  // 包进子 shell：2>&1 作用于整条命令；命令里的 exit 只退出子 shell，
  // 整体总是返回 0（新版 adb 会透传退出码，否则会在这里之前就报错，拿不到下面的标记）
  const out = await shell(ctx, `(${cmd}) 2>&1 && echo __ADBFM_OK__; true`);
  if (out.includes("__ADBFM_EXISTS__")) throw new AdbError(t("targetExists"), 400);
  if (!out.includes("__ADBFM_OK__")) throw new AdbError(cleanError(out.trim()), 400);
  return out.replace("__ADBFM_OK__", "");
}

export const mkdir = (ctx: Ctx, p: string) => checked(ctx, `mkdir -p ${q(p)}`);
export const rename = (ctx: Ctx, from: string, to: string) =>
  checked(ctx, `[ ! -e ${q(to)} ] || { echo __ADBFM_EXISTS__; exit 1; }; mv ${q(from)} ${q(to)}`);
export const remove = (ctx: Ctx, paths: string[]) => checked(ctx, `rm -rf ${paths.map(q).join(" ")}`);

/** 修改权限位；mode 须已通过 parseModeInput 校验 */
export const chmod = (ctx: Ctx, paths: string[], mode: string, recursive: boolean) =>
  checked(ctx, `chmod ${recursive ? "-R " : ""}${mode} ${paths.map(q).join(" ")}`);

/** 修改所有者或用户组；owner 和 group 须已通过 parseOwnerInput 校验，至少给一个 */
export const chown = (
  ctx: Ctx,
  paths: string[],
  owner: string | undefined,
  group: string | undefined,
  recursive: boolean,
) =>
  checked(
    ctx,
    `chown ${recursive ? "-R " : ""}${q(`${owner ?? ""}${group ? `:${group}` : ""}`)} ${paths.map(q).join(" ")}`,
  );

/** 校验权限位输入，只接受 3 到 4 位八进制数字 */
export function parseModeInput(v: unknown): string {
  if (typeof v !== "string" || !/^[0-7]{3,4}$/.test(v)) throw new AdbError(t("badMode"), 400);
  return v;
}

/** 校验所有者或用户组输入：名称或数字 id，缺省时返回 undefined */
export function parseOwnerInput(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" || !/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(v)) throw new AdbError(t("badOwner"), 400);
  return v;
}

/**
 * 在 shell 中把变量 t 设为 destDir 下不重名的路径：重名时依次改成“名字 2.扩展名”“名字 3.扩展名”……。
 * src 是要放进去的源，为目录时名字里的点不算扩展名（com.example.app 不该变成 com.example 2.app）。
 * 给出 suffix 时以它作为扩展名，用于 .tar.gz 这类复合扩展名（a.tar.gz 重名后是 a 2.tar.gz）
 */
function uniqueTarget(destDir: string, name: string, src: string, suffix?: string) {
  const dot = name.lastIndexOf(".");
  const [base, ext] =
    suffix !== undefined && name.endsWith(suffix)
      ? [name.slice(0, name.length - suffix.length), suffix]
      : dot > 0
        ? [name.slice(0, dot), name.slice(dot)]
        : [name, ""];
  // 悬空的符号链接 -e 为假，但同样会挡住 cp 和 mv，要一并避开
  return (
    `b=${q(base)}; e=${q(ext)}; [ -d ${q(src)} ] && { b=${q(name)}; e=; }; ` +
    `t=${q(destDir)}/"$b$e"; i=2; while [ -e "$t" ] || [ -L "$t" ]; do t=${q(destDir)}/"$b $i$e"; i=$((i+1)); done`
  );
}

/** 复制到目标目录下；重名时依次改成“名字 2.扩展名”“名字 3.扩展名”……，从不覆盖 */
export function copyInto(ctx: Ctx, src: string, destDir: string) {
  return checked(ctx, `${uniqueTarget(destDir, path.basename(src), src)}; cp -R ${q(src)} "$t"`);
}

/** 压缩包里列目录、解压用的设备端命令；zip 用 unzip，其余用 toybox 的 tar */
const ARCHIVE_TOOL: Record<ArchiveFormat, string> = { zip: "unzip", tar: "tar", tgz: "tar", tbz: "tar" };
const TAR_FLAG: Record<ArchiveFormat, string> = { zip: "", tar: "", tgz: "z", tbz: "j" };

const EXIT_MARK = "__ADBFM_EXIT__";

/** 列出压缩包内容的原始输出，交给 archive.ts 解析 */
export async function listArchive(ctx: Ctx, p: string, format: ArchiveFormat) {
  const list = format === "zip" ? `unzip -lv ${q(p)}` : `tar -tv${TAR_FLAG[format]}f ${q(p)}`;
  // 标记写在命令之后：输出里可能含有文件名，退出码只能靠它之后的标记判断
  const out = await shell(ctx, `${list} 2>&1; echo ${EXIT_MARK}$?`);
  const at = out.lastIndexOf(EXIT_MARK);
  const body = at < 0 ? out : out.slice(0, at);
  const code = at < 0 ? 1 : Number.parseInt(out.slice(at + EXIT_MARK.length), 10);
  if (code === 0) return body;
  if (/not found/i.test(body)) throw new AdbError(t("archiveToolMissing", { tool: ARCHIVE_TOOL[format] }), 501);
  throw new AdbError(cleanError(body.trim()), 400);
}

const PATH_MARK = "__ADBFM_PATH__";

/**
 * 解压的设备端命令。先解到压缩包所在目录的暂存目录 stage，再按不重名的名字移到最终位置：
 * single 非空时移出 stage 下的这一项，否则把 stage 整个改名为 wrapper，最后删除暂存目录（失败时也删）。
 * tar 的 -o 不还原属主，root 模式下也不会产生奇怪的 uid
 */
export function extractCmd(p: string, format: ArchiveFormat, single: string | null, wrapper: string, stage: string) {
  const dir = path.dirname(p);
  const extract =
    format === "zip" ? `unzip -o -q ${q(p)} -d ${q(stage)}` : `tar -xo${TAR_FLAG[format]}f ${q(p)} -C ${q(stage)}`;
  const src = single === null ? stage : `${stage}/${single}`;
  return (
    `mkdir ${q(stage)} || exit 1; r=1; ` +
    `if ${extract}; then ${uniqueTarget(dir, single ?? wrapper, src)}; mv ${q(src)} "$t"; r=$?; fi; ` +
    `rm -rf ${q(stage)}; [ $r = 0 ] && echo ${PATH_MARK}"$t"; exit $r`
  );
}

/** 取出命令输出里由 PATH_MARK 标记的路径 */
function markedPath(out: string) {
  const line = out.split("\n").find((l) => l.startsWith(PATH_MARK));
  if (!line) throw new AdbError(t("adbFailed"));
  return line.slice(PATH_MARK.length).replace(/\r$/, "");
}

/** 解压压缩包，返回解出的文件夹或文件的路径；single 是压缩包里唯一的顶层项目名，没有则为 null */
export async function extract(ctx: Ctx, p: string, format: ArchiveFormat, single: string | null, wrapper: string) {
  const stage = path.join(path.dirname(p), `.adbfm-extract-${Math.random().toString(36).slice(2, 10)}`);
  return markedPath(await checked(ctx, extractCmd(p, format, single, wrapper, stage)));
}

/** 压缩包的扩展名，与前端 lib/kinds.ts 的 archiveFormat 识别的格式一致 */
export const ARCHIVE_EXT: Record<ArchiveFormat, string> = { zip: ".zip", tar: ".tar", tgz: ".tar.gz", tbz: ".tar.bz2" };

/**
 * tar 系格式压缩的设备端命令。先写到 base 下的暂存文件 stage，成功后按不重名的名字改名为 name，
 * 失败时删除暂存文件，不留下半个压缩包。names 是相对 base 的路径；toybox 的 tar 只认最后一个 -C，
 * 所以所有名称都以同一个 base 为准。chown 为 true 时把压缩包交给 base 的所有者，root 模式下避免生成 root 属主的文件
 */
export function packCmd(
  base: string,
  names: string[],
  format: ArchiveFormat,
  name: string,
  stage: string,
  chown: boolean,
) {
  const create = `tar -c${TAR_FLAG[format]}f ${q(stage)} -C ${q(base)} -- ${names.map(q).join(" ")}`;
  return (
    `r=1; if ${create}; then ${uniqueTarget(base, name, stage, ARCHIVE_EXT[format])}; mv ${q(stage)} "$t"; r=$?; fi; ` +
    `rm -f ${q(stage)}; ` +
    (chown ? `[ $r = 0 ] && chown "$(stat -c %u:%g ${q(base)})" "$t" 2>/dev/null; ` : "") +
    `[ $r = 0 ] && echo ${PATH_MARK}"$t"; exit $r`
  );
}

/** 在设备上把 base 下的 names 压缩为 tar 系格式，返回生成的压缩包路径 */
export async function pack(ctx: Ctx, base: string, names: string[], format: ArchiveFormat, name: string) {
  const stage = path.join(base, `.adbfm-pack-${Math.random().toString(36).slice(2, 10)}`);
  try {
    return markedPath(await checked(ctx, packCmd(base, names, format, name, stage, Boolean(ctx.root))));
  } catch (e) {
    if (e instanceof AdbError && /permission denied|read-only/i.test(e.message)) {
      throw new AdbError(t(ctx.root ? "packDeniedRoot" : "packDenied"), 403);
    }
    throw e;
  }
}

/** 设备上 dir 下不重名的文件名（不创建文件），suffix 是 name 末尾的扩展名 */
export async function uniqueName(ctx: Ctx, dir: string, name: string, suffix: string) {
  const out = await checked(ctx, `${uniqueTarget(dir, name, "", suffix)}; echo ${PATH_MARK}"$t"`);
  return path.basename(markedPath(out));
}

/** 解析 du -sk 的输出，返回各项占用的字节数之和；读不了的项没有输出，不计入 */
export function parseDu(out: string) {
  let kb = 0;
  for (const line of out.split("\n")) {
    const m = /^(\d+)\s/.exec(line);
    if (m) kb += Number(m[1]);
  }
  return kb * 1024;
}

/** 这些路径合计占用的字节数，用于压缩前估算电脑上需要的空间 */
export async function diskUsage(ctx: Ctx, paths: string[]) {
  return parseDu(await shell(ctx, `du -sk ${paths.map(q).join(" ")} 2>/dev/null`));
}

/** 路径之下 adb pull 会跳过的条目数：符号链接、套接字等既不是文件也不是目录的东西 */
export async function countSkipped(ctx: Ctx, paths: string[]) {
  const out = await shell(ctx, `find ${paths.map(q).join(" ")} ! -type d ! -type f 2>/dev/null | wc -l`);
  return Number.parseInt(out.trim(), 10) || 0;
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
