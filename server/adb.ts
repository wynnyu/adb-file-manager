import { type ChildProcessByStdio, type ExecFileException, execFile, spawn } from "node:child_process";
import path from "node:path/posix";
import type { Readable } from "node:stream";
import type { Device, DeviceMode, ErrorCode, RootMethod } from "../shared/types.d.ts";
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

/**
 * 短命令的默认超时（毫秒）。设备无响应时 ls、root 检测这类命令不会一直挂着。
 * 新增的长命令（传输、递归操作、大目录统计）必须显式传 timeout: 0 表示不限
 */
export const QUICK_TIMEOUT = 30_000;

/** 把 execFile 的失败转为 AdbError；到时被 SIGTERM 终止算超时，signal 取消（AbortError）不算 */
export function execError(err: ExecFileException, output: string, timeout: number) {
  if (err.killed && err.signal === "SIGTERM" && timeout > 0 && err.name !== "AbortError") {
    return new AdbError(t("adbTimeout", { seconds: timeout / 1000 }), 504);
  }
  return new AdbError(cleanError((output || err.message).trim()));
}

function run(args: string[], timeout = QUICK_TIMEOUT, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { maxBuffer: 64 * 1024 * 1024, timeout, signal }, (err, stdout, stderr) => {
      if (err) reject(execError(err, stderr || stdout, timeout));
      else resolve(stdout);
    });
  });
}

/** 同 run，但以 Buffer 返回 stdout，用于读取文件内容 */
function runBuffer(args: string[], timeout = QUICK_TIMEOUT): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(ADB, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (err) reject(execError(err, stderr.toString(), timeout));
      else resolve(stdout);
    });
  });
}

export function cleanError(msg: string) {
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

/** 在设备上执行命令；给出 signal 时可中途取消，timeout 单位毫秒，缺省为 QUICK_TIMEOUT，0 为不限 */
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

/** 已缓存的设备名称，供 fastboot 模块复用（设备进 bootloader 后 adb 取不到名称） */
export const cachedName = (serial: string) => nameCache.get(serial);

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
export function pickAuthRetries(list: Pick<Device, "serial" | "mode">[], now: number, state: Map<string, AuthWatch>) {
  const pending = new Set(list.filter((d) => d.mode === "unauthorized").map((d) => d.serial));
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

/** adb devices 的状态转为设备模式：未列出的状态（offline、authorizing、connecting、no permissions、host 等）一律视为 offline */
export function adbMode(state: string): DeviceMode {
  switch (state) {
    case "device":
      return "system";
    case "recovery":
    case "sideload":
    case "bootloader":
    case "unauthorized":
      return state;
    default:
      return "offline";
  }
}

export interface AdbDeviceLine {
  serial: string;
  state: string;
  model: string;
}

/** 解析 adb devices -l 的输出；状态可能含空格（no permissions），因此只取 serial 后的第一个词作为状态 */
export function parseAdbDevices(out: string): AdbDeviceLine[] {
  const list: AdbDeviceLine[] = [];
  for (const line of out.split("\n").slice(1)) {
    const m = line.trim().match(/^(\S+)\s+(\S+)(.*)$/);
    if (!m) continue;
    const [, serial, state, rest] = m;
    const model = (rest.match(/model:(\S+)/)?.[1] ?? "").replace(/_/g, " ");
    list.push({ serial, state, model });
  }
  return list;
}

export async function devices(): Promise<Device[]> {
  const out = await run(["devices", "-l"], 10_000);
  const list: Device[] = [];
  for (const { serial, state, model } of parseAdbDevices(out)) {
    const mode = adbMode(state);
    if (mode === "system") cleanStagesOnce({ serial, root: false });
    let name = nameCache.get(serial);
    if (!name && mode === "system") {
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
    list.push({ serial, transport: "adb", mode, model, name: name || model || serial });
  }
  if (pickAuthRetries(list, Date.now(), authWatch).length) reconnectOffline().catch(() => {});
  return list;
}

/** 本进程的标识，写进暂存目录名，清理时据此区分以前的进程留下的目录和本进程正在使用的目录 */
const BOOT = Math.random().toString(36).slice(2, 8);

/** su 模式下 adb push/pull 本身没有 root 权限，先经 /data/local/tmp 中转 */
const stagingDir = () =>
  `/data/local/tmp/adbfm-${BOOT}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 清理暂存目录的设备端命令：删除除 boot 对应进程之外留下的 adbfm-*，总是成功返回。boot 只来自内部，不含外部输入 */
export function stageCleanupCmd(boot: string) {
  const dir = "/data/local/tmp";
  return (
    `for d in ${dir}/adbfm-*; do [ -e "$d" ] || continue; ` +
    `case "$d" in ${dir}/adbfm-${boot}-*) ;; *) rm -rf "$d" ;; esac; done 2>/dev/null; true`
  );
}

const cleaned = new Set<string>();

/**
 * 清理以前的进程留下的暂存目录，每个设备和 root 方式只执行一次，不阻塞调用方。
 * push 的暂存目录归 shell 用户所有，普通用户即可删除；pull 的由 root 创建，需要 su 才能删
 */
export function cleanStagesOnce(ctx: Ctx) {
  const key = `${ctx.serial}|${ctx.root}`;
  if (cleaned.has(key)) return;
  cleaned.add(key);
  shell(ctx, stageCleanupCmd(BOOT), { timeout: 0 }).catch(() => {});
}

/** signal 取消传输；su 模式下收尾用的 rm 不带 signal，取消后也会清理暂存目录 */
export async function push(ctx: Ctx, locals: string[], remoteDir: string, signal?: AbortSignal) {
  if (ctx.root !== "su") {
    await run(["-s", ctx.serial, "push", ...locals, remoteDir + "/"], 0, signal);
    return;
  }
  const stage = stagingDir();
  const user: Ctx = { serial: ctx.serial, root: false };
  try {
    await checked(user, `mkdir -p ${q(stage)}`);
    await run(["-s", ctx.serial, "push", ...locals, stage + "/"], 0, signal);
    await checked(ctx, `mkdir -p ${q(remoteDir)} && cp -R ${q(stage)}/. ${q(remoteDir)}/`, 0, signal);
  } finally {
    await shell(ctx, `rm -rf ${q(stage)}`, { timeout: 0 }).catch(() => {});
  }
}

/** signal 取消传输；su 模式下收尾用的 rm 不带 signal，取消后也会清理暂存目录 */
export async function pull(ctx: Ctx, remote: string, local: string, signal?: AbortSignal) {
  if (ctx.root !== "su") {
    await run(["-s", ctx.serial, "pull", "-a", remote, local], 0, signal);
    return;
  }
  const stage = stagingDir();
  try {
    await checked(
      ctx,
      `mkdir -p ${q(stage)} && cp -R ${q(remote)} ${q(stage)}/ && chmod -R a+rX ${q(stage)}`,
      0,
      signal,
    );
    await run(["-s", ctx.serial, "pull", "-a", `${stage}/${path.basename(remote)}`, local], 0, signal);
  } finally {
    await shell(ctx, `rm -rf ${q(stage)}`, { timeout: 0 }).catch(() => {});
  }
}

/** checked 成功时命令输出里的标记，也会被 checked 从返回值中去掉 */
export const OK_MARK = "__ADBFM_OK__";
/** 命令检测到目标已存在时输出的标记，checked 据此抛出 targetExists */
export const EXISTS_MARK = "__ADBFM_EXISTS__";

/** 执行命令并要求成功，返回去掉成功标记后的输出；默认不限时，短命令传第三个参数，长命令可传 signal 取消 */
export async function checked(ctx: Ctx, cmd: string, timeout = 0, signal?: AbortSignal) {
  // 包进子 shell：2>&1 作用于整条命令；命令里的 exit 只退出子 shell，
  // 整体总是返回 0（新版 adb 会透传退出码，否则会在这里之前就报错，拿不到下面的标记）
  const out = await shell(ctx, `(${cmd}) 2>&1 && echo ${OK_MARK}; true`, { timeout, signal });
  if (out.includes(EXISTS_MARK)) throw new AdbError(t("targetExists"), 400);
  if (!out.includes(OK_MARK)) throw new AdbError(cleanError(out.trim()), 400);
  return out.replace(OK_MARK, "");
}

/** exec-out 的参数：su 模式下包上提权前缀；exec-out 不经过 pty，二进制内容不会被改写 */
const execOut = (ctx: Ctx, cmd: string) => ["-s", ctx.serial, "exec-out", ctx.root === "su" ? `${SU} ${q(cmd)}` : cmd];

/** 以字节流执行设备端命令（adb exec-out），不经过电脑临时目录；stderr 丢弃 */
export function execOutStream(ctx: Ctx, cmd: string): ChildProcessByStdio<null, Readable, null> {
  return spawn(ADB, execOut(ctx, cmd), { stdio: ["ignore", "pipe", "ignore"] });
}

/** 执行设备端命令（adb exec-out），以 Buffer 返回 stdout */
export const execOutBuffer = (ctx: Ctx, cmd: string) => runBuffer(execOut(ctx, cmd));
