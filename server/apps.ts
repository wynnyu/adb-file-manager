import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import type {
  AppDetail,
  AppEntry,
  AppPermission,
  AppState,
  InstallResult,
  JobRef,
  OkResult,
  PullResult,
} from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { localApkName, readBundle } from "./bundle.ts";
import { assertNotCritical, type CurrentDefaults, criticalRole } from "./guard.ts";
import { msg as t } from "./i18n.ts";
import { startJob } from "./jobs.ts";
import { serialOf, wrap } from "./request.ts";
import { TMP, tmpDir } from "./tmp.ts";
import { registerPull } from "./transfer.ts";

const SPLIT = "__ADBFM_SPLIT__";

const PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/;

/** 校验并返回包名；允许 android 这类单段包名。拼进命令时仍要经 adb.q() */
export function assertPackage(v: unknown): string {
  if (typeof v !== "string" || v.length > 255 || !PACKAGE_RE.test(v)) throw new adb.AdbError(t("badPackage"), 400);
  return v;
}

/** 默认启动器：取 HOME 的解析结果的最后一行，形如 com.miui.home/.launcher.Launcher */
const LAUNCHER_CMD =
  "cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME 2>/dev/null | tail -n 1";
/** 当前输入法，形如 com.google.android.inputmethod.latin/...LatinIME，未设置时为 null */
const IME_CMD = "settings get secure default_input_method 2>/dev/null";

/**
 * 一次 shell 取六段，以 SPLIT 分隔：全部包（含已卸载，带路径和 uid）、系统包、已停用包、当前用户已安装的包、
 * 默认启动器、当前输入法。老系统的 pm 不认识 -U 时降级为不带 uid。pm 命令默认作用于用户 0
 */
export function listCmd() {
  return [
    "(pm list packages -f -U -u 2>/dev/null || pm list packages -f -u)",
    "pm list packages -s -u",
    "pm list packages -d",
    "pm list packages",
    LAUNCHER_CMD,
    IME_CMD,
  ].join(`; echo ${SPLIT}; `);
}

/** 只取默认启动器和输入法，操作接口据此在服务端复查关键包，不信任前端 */
export function defaultsCmd() {
  return [LAUNCHER_CMD, IME_CMD].join(`; echo ${SPLIT}; `) + "; true";
}

/** 从 组件名（包名/类名）取包名；输出为空、null 或不像组件名时为 undefined */
function componentPackage(out: string): string | undefined {
  return /^([A-Za-z][\w.]*)\//.exec(out.trim())?.[1];
}

/** 解析启动器、输入法两段输出 */
export function parseDefaults(launcherOut = "", imeOut = ""): CurrentDefaults {
  return { launcher: componentPackage(launcherOut), ime: componentPackage(imeOut) };
}

/** 读取设备当前的默认启动器和输入法 */
export async function currentDefaults(ctx: adb.Ctx): Promise<CurrentDefaults> {
  const [launcher, ime] = (await adb.shell(ctx, defaultsCmd())).split(SPLIT);
  return parseDefaults(launcher, ime);
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
  const [all = "", system = "", disabled = "", installed = "", launcherOut, imeOut] = out.split(SPLIT);
  const defaults = parseDefaults(launcherOut, imeOut);
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
    const critical = criticalRole(p.pkg, defaults);
    if (critical) entry.critical = critical;
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

/** pm、am 的失败输出：每项取出原因。输出里先出现的优先 */
const PM_FAILURES: RegExp[] = [
  /Failure\s*\[([^\]]*)\]/,
  /^Error:\s*(.+)/,
  /^(Failed\b.*)/,
  /(.*(?:doesn't exist|Unknown package).*)/,
  /(.*SecurityException.*)/,
];

/** 从 pm 的输出里找失败的原因；没有失败迹象时为 undefined。老版本的 pm 失败时也可能返回 0 */
export function pmFailure(out: string): string | undefined {
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    for (const re of PM_FAILURES) {
      const m = re.exec(line);
      if (m) return m[1].trim() || line;
    }
  }
  return undefined;
}

/** 执行 pm / am 命令：退出码和输出里的失败信息都算失败，以 400 和原因报出 */
export async function pmRun(ctx: adb.Ctx, cmd: string) {
  let out: string;
  try {
    out = await adb.checked(ctx, cmd, adb.QUICK_TIMEOUT);
  } catch (e) {
    const reason = e instanceof adb.AdbError && e.status === 400 ? pmFailure(e.message) : undefined;
    if (reason) throw new adb.AdbError(t("pmFailed", { reason }), 400);
    throw e;
  }
  const reason = pmFailure(out);
  if (reason) throw new adb.AdbError(t("pmFailed", { reason }), 400);
}

/** installFailure 里有专门文案的失败代码 */
const INSTALL_FAILURES = {
  INSTALL_FAILED_VERSION_DOWNGRADE: "installDowngrade",
  INSTALL_FAILED_UPDATE_INCOMPATIBLE: "installIncompatible",
  INSTALL_FAILED_INSUFFICIENT_STORAGE: "installNoSpace",
  INSTALL_FAILED_NO_MATCHING_ABIS: "installNoAbi",
  INSTALL_FAILED_OLDER_SDK: "installOldSdk",
  INSTALL_FAILED_USER_RESTRICTED: "installRestricted",
} as const;

/** 把 adb install 的失败输出转为用户能看懂的说明：常见的代码有专门的文案，其余带上代码原文 */
export function installFailure(message: string): string {
  const code = /INSTALL_(?:PARSE_)?FAILED_[A-Z0-9_]+/.exec(message)?.[0];
  if (code && Object.hasOwn(INSTALL_FAILURES, code)) return t(INSTALL_FAILURES[code as keyof typeof INSTALL_FAILURES]);
  return t("installFailed", { code: code ?? (message.trim() || t("adbFailed")) });
}

/** 可安装的文件类型；.apks 和 .xapk 是分包 */
const INSTALL_EXTS = [".apk", ".apks", ".xapk"];
const BUNDLE_EXTS = [".apks", ".xapk"];

/** 取上传的 names 字段：JSON 编码的文件名数组，缺省时为空数组（使用 multipart 文件名） */
function installNamesOf(v: unknown): string[] {
  if (v === undefined) return [];
  let names: unknown;
  try {
    names = JSON.parse(String(v));
  } catch {
    throw new adb.AdbError(t("badInstallNames"), 400);
  }
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) {
    throw new adb.AdbError(t("badInstallNames"), 400);
  }
  return names;
}

interface AppOp {
  /** 设备端命令；body 是请求体，布尔参数需严格为 true */
  cmd: (pkg: string, body: Record<string, unknown>) => string;
  /** 目标是关键包时要求 force */
  guarded?: boolean;
  /** 执行前的额外检查 */
  before?: (ctx: adb.Ctx, pkg: string) => Promise<void>;
}

/** 只作用于用户 0；卸载更新要求该应用确实被更新过 */
const APP_OPS: Record<string, AppOp> = {
  uninstall: {
    guarded: true,
    cmd: (pkg, b) =>
      `pm uninstall${b.keepData === true ? " -k" : ""}${b.user0 === true ? " --user 0" : ""} ${adb.q(pkg)}`,
  },
  "uninstall-updates": {
    guarded: true,
    cmd: (pkg) => `pm uninstall ${adb.q(pkg)}`,
    async before(ctx, pkg) {
      const out = await adb.shell(ctx, `dumpsys package ${adb.q(pkg)}`);
      if (!parseAppDetail(out, pkg).updatedSystem) throw new adb.AdbError(t("notUpdatedSystem"), 400);
    },
  },
  restore: { cmd: (pkg) => `cmd package install-existing ${adb.q(pkg)} || pm install-existing ${adb.q(pkg)}` },
  disable: { guarded: true, cmd: (pkg) => `pm disable-user --user 0 ${adb.q(pkg)}` },
  enable: { cmd: (pkg) => `pm enable ${adb.q(pkg)}` },
  "force-stop": { cmd: (pkg) => `am force-stop ${adb.q(pkg)}` },
  clear: { guarded: true, cmd: (pkg) => `pm clear ${adb.q(pkg)}` },
};

/** 包的全部 APK 路径：分包应用有多个。pm path 取不到时（已为用户卸载的系统应用）退回 pm list 里的主 APK */
async function apkPaths(ctx: adb.Ctx, pkg: string): Promise<string[]> {
  const paths = (await adb.shell(ctx, `pm path ${adb.q(pkg)}`))
    .split("\n")
    .map((l) => /^package:(.+\.apk)\s*$/.exec(l.replace(/\r$/, ""))?.[1])
    .filter((p): p is string => !!p);
  if (paths.length) return paths;
  const listed = (await adb.shell(ctx, `pm list packages -f -u ${adb.q(pkg)}`))
    .split("\n")
    .map(parsePackageLine)
    .find((p) => p?.pkg === pkg);
  if (!listed) throw new adb.AdbError(t("noPackage", { pkg }), 404);
  return [listed.path];
}

/** 应用相关接口：列表、详情和操作。都作用于用户 0，不需要 root */
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

  for (const [name, op] of Object.entries(APP_OPS)) {
    router.post(
      `/${name}`,
      wrap(async (req, res) => {
        const ctx: adb.Ctx = { serial: serialOf(req), root: false };
        const pkg = assertPackage(req.body.pkg);
        // 关键包由服务端对照设备当前的启动器和输入法复查，不信任前端的判断
        if (op.guarded) assertNotCritical(criticalRole(pkg, await currentDefaults(ctx)), req.body.force);
        await op.before?.(ctx, pkg);
        await pmRun(ctx, op.cmd(pkg, req.body));
        res.json({ ok: true } satisfies OkResult);
      }),
    );
  }

  // 提取 APK：单个直接流式取回，分包逐个 pull 后打成 .apks（可用本工具重新安装）
  router.post(
    "/extract",
    wrap(async (req, res) => {
      const ctx: adb.Ctx = { serial: serialOf(req), root: false };
      const pkg = assertPackage(req.body.pkg);
      const paths = await apkPaths(ctx, pkg);
      const ref = startJob<PullResult>(req, async (job) => {
        if (paths.length === 1) return registerPull({ kind: "stream", ctx, path: paths[0] }, `${pkg}.apk`);
        job.phase("pulling");
        const dir = await tmpDir();
        try {
          for (const [i, p] of paths.entries()) {
            await adb.pull(ctx, p, dir, job.signal);
            job.progress((i + 1) / paths.length);
          }
        } catch (e) {
          await fs.rm(dir, { recursive: true, force: true });
          throw e;
        }
        return registerPull({ kind: "zip", dir }, `${pkg}.apks`);
      });
      res.json(ref satisfies JobRef);
    }),
  );

  // 安装：先上传到电脑临时目录，再作为任务执行（解包、adb install、推送 OBB）
  const upload = multer({ dest: TMP });
  router.post(
    "/install",
    upload.array("files"),
    wrap(async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const cleanup = (dir?: string) =>
        Promise.all([
          ...files.map((f) => fs.rm(f.path, { force: true })),
          dir ? fs.rm(dir, { recursive: true, force: true }) : undefined,
        ]);
      let started = false;
      try {
        const serial = serialOf(req);
        if (!files.length) throw new adb.AdbError(t("noFilesReceived"), 400);
        // 文件名用单独的 JSON 字段传，避免 multipart 文件名的编码问题
        const given = installNamesOf(req.body.names);
        const names = files.map((f, i) => given[i] || f.originalname);
        const exts = names.map((n) => path.extname(n).toLowerCase());
        if (!exts.every((e) => INSTALL_EXTS.includes(e))) throw new adb.AdbError(t("badInstallFile"), 400);
        const bundle = exts.some((e) => BUNDLE_EXTS.includes(e));
        if (bundle && files.length > 1) throw new adb.AdbError(t("installBundleAlone"), 400);

        const ref = startJob<InstallResult>(req, async (job) => {
          let dir: string | undefined;
          try {
            dir = await tmpDir();
            let apks: string[];
            let obb: { local: string; remote: string }[] = [];
            if (bundle) {
              job.phase("preparing");
              ({ apks, obb } = await readBundle(files[0].path, dir, job.signal));
            } else {
              // adb 按文件名识别 APK，multer 存下的文件没有扩展名，改名后再装
              const root = dir;
              apks = await Promise.all(
                files.map(async (f, i) => {
                  const local = path.join(root, localApkName(i, names[i]));
                  await fs.rename(f.path, local);
                  return local;
                }),
              );
            }
            // 装进设备后不能中途取消，否则可能留下装了一半的应用
            job.phase("installing", { cancelable: false });
            try {
              await adb.install(serial, apks, job.signal);
            } catch (e) {
              throw e instanceof adb.AdbError ? new adb.AdbError(installFailure(e.message), 400) : e;
            }
            if (!obb.length) return {};
            job.phase("pushing");
            const ctx: adb.Ctx = { serial, root: false };
            for (const [i, o] of obb.entries()) {
              const remoteDir = path.posix.dirname(o.remote);
              await adb.checked(ctx, `mkdir -p ${adb.q(remoteDir)}`, adb.QUICK_TIMEOUT, job.signal);
              await adb.push(ctx, [o.local], remoteDir, job.signal);
              job.progress((i + 1) / obb.length);
            }
            return { obb: obb.length };
          } finally {
            await cleanup(dir);
          }
        });
        started = true;
        res.json(ref satisfies JobRef);
      } finally {
        // 任务启动后由任务负责清理；启动前出错在这里同步清理
        if (!started) await cleanup();
      }
    }),
  );

  return router;
}
