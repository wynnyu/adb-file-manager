import { Router } from "express";
import type { OkResult, PropEntry, PropList } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { assertPropForce, propRisk } from "./guard.ts";
import { msg as t } from "./i18n.ts";
import { ctxOf, wrap } from "./request.ts";

const SPLIT = "__ADBFM_SPLIT__";
/** resetprop 不存在时由 RESETPROP 函数输出，propFailure 据此识别 */
const NO_RESETPROP = "__ADBFM_NO_RESETPROP__";

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\-:@]*$/;
const KEY_MAX = 128;
const VALUE_MAX = 4096;

/** 校验并返回属性名；控制属性（ctl.*、sys.powerctl）会启停服务或重启设备，直接拒绝。拼进命令时仍要经 adb.q() */
export function assertPropKey(v: unknown): string {
  if (typeof v !== "string" || v.length > KEY_MAX || !KEY_RE.test(v)) throw new adb.AdbError(t("badPropKey"), 400);
  if (v.startsWith("ctl.") || v === "sys.powerctl") throw new adb.AdbError(t("propControl"), 400);
  return v;
}

/** 校验并返回属性值：字符串，不含空字符和换行；允许为空 */
export function assertPropValue(v: unknown): string {
  if (typeof v !== "string" || v.length > VALUE_MAX || /[\0\r\n]/.test(v))
    throw new adb.AdbError(t("badPropValue"), 400);
  return v;
}

const PROP_LINE = /^\[([^\]]*)\]: \[(.*)$/;

/** 解析 getprop 的输出：每项形如 [key]: [value]，多行值的后续行不以 [ 开头，并入上一项；按键名排序 */
export function parseProps(out: string): PropEntry[] {
  const raw: { key: string; value: string }[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = PROP_LINE.exec(line);
    if (m) raw.push({ key: m[1], value: m[2] });
    else if (raw.length && line !== "") raw[raw.length - 1].value += `\n${line}`;
  }
  // 每项的值末尾都带着结束的 ]
  return raw
    .map(({ key, value }) => ({ key, value: value.endsWith("]") ? value.slice(0, -1) : value }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * 设备端的 resetprop 函数：依次尝试 PATH 中的 resetprop、KernelSU、APatch 的安装位置和 magisk resetprop，
 * 都没有时输出标记并返回 127。/data/adb 只有 root 能访问，非 root 时自然找不到
 */
export const RESETPROP = [
  "adbfm_resetprop() {",
  'if command -v resetprop >/dev/null 2>&1; then resetprop "$@";',
  'elif [ -x /data/adb/ksu/bin/resetprop ]; then /data/adb/ksu/bin/resetprop "$@";',
  'elif [ -x /data/adb/ap/bin/resetprop ]; then /data/adb/ap/bin/resetprop "$@";',
  'elif command -v magisk >/dev/null 2>&1; then magisk resetprop "$@";',
  `else echo ${NO_RESETPROP}; return 127; fi; }`,
].join(" ");

/** 检测 resetprop 是否可用：不存在时函数返回 127，其他退出码（包括 -h 的用法提示）都算存在 */
const DETECT_RESETPROP = `${RESETPROP}; adbfm_resetprop -h >/dev/null 2>&1; [ $? -ne 127 ] && echo yes; true`;

/** 列出全部属性；root 时追加 resetprop 检测，两段以 SPLIT 分隔 */
export function listCmd(root: boolean) {
  return root ? `getprop; echo ${SPLIT}; ${DETECT_RESETPROP}` : "getprop";
}

/** 解析 listCmd 的输出 */
export function parseList(out: string): PropList {
  const [props, detect = ""] = out.split(SPLIT);
  return { props: parseProps(props), resetprop: detect.trim() === "yes" };
}

/** 设置属性的命令：ro.* 只能经 resetprop，其余用 setprop */
export function setCmd(key: string, value: string, viaResetprop: boolean) {
  return viaResetprop
    ? `${RESETPROP}; adbfm_resetprop ${adb.q(key)} ${adb.q(value)}`
    : `setprop ${adb.q(key)} ${adb.q(value)}`;
}

/** 删除属性的命令：只有 resetprop 能删除，persist.* 加 -p 一并清除保存的值 */
export function deleteCmd(key: string) {
  const flags = key.startsWith("persist.") ? "-p -d" : "-d";
  return `${RESETPROP}; adbfm_resetprop ${flags} ${adb.q(key)}`;
}

/** setprop、resetprop 的失败输出，先出现的优先 */
const PROP_FAILURES: RegExp[] = [
  /failed to set property.*/i,
  /could not set property.*/i,
  /property value too long.*/i,
  /(.*(?:invalid|bad) property.*)/i,
  /(.*SecurityException.*)/,
];

/** 从 setprop、resetprop 的输出里找失败的原因；没有失败迹象时为 undefined。老版本的 setprop 被拒时也可能返回 0 */
export function propFailure(out: string): string | undefined {
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (line.includes(NO_RESETPROP)) return "resetprop not found";
    for (const re of PROP_FAILURES) {
      const m = re.exec(line);
      if (m) return (m[1] ?? m[0]).trim() || line;
    }
  }
  return undefined;
}

/** 执行设置或删除命令：退出码和输出里的失败信息都算失败，以 400 和原因报出 */
async function propRun(ctx: adb.Ctx, cmd: string) {
  let out: string;
  try {
    out = await adb.checked(ctx, cmd, adb.QUICK_TIMEOUT);
  } catch (e) {
    const reason = e instanceof adb.AdbError && e.status === 400 ? propFailure(e.message) : undefined;
    if (reason) throw new adb.AdbError(t("propFailed", { reason }), 400);
    throw e;
  }
  const reason = propFailure(out);
  if (reason) throw new adb.AdbError(t("propFailed", { reason }), 400);
}

/** 回读属性的当前值，不存在时为空串 */
async function readProp(ctx: adb.Ctx, key: string) {
  return (await adb.shell(ctx, `getprop ${adb.q(key)}`)).replace(/\r?\n$/, "");
}

function assertRoot(ctx: adb.Ctx) {
  if (!ctx.root) throw new adb.AdbError(t("propNeedsRoot"), 400);
}

async function assertResetprop(ctx: adb.Ctx) {
  const out = await adb.shell(ctx, DETECT_RESETPROP);
  if (out.trim() !== "yes") throw new adb.AdbError(t("noResetprop"), 400);
}

/** 系统属性接口：列表、修改、删除。非 root 只能 setprop 非 ro 属性，ro.* 和删除需要 root 下的 resetprop */
export function propRoutes() {
  const router = Router();

  router.get(
    "/",
    wrap(async (req, res) => {
      const ctx = await ctxOf(req);
      res.json(parseList(await adb.shell(ctx, listCmd(!!ctx.root))) satisfies PropList);
    }),
  );

  router.post(
    "/set",
    wrap(async (req, res) => {
      const key = assertPropKey(req.body.key);
      const value = assertPropValue(req.body.value);
      const ctx = await ctxOf(req);
      const ro = key.startsWith("ro.");
      if (ro) {
        assertRoot(ctx);
        await assertResetprop(ctx);
      }
      assertPropForce(propRisk(key), req.body.force);
      await propRun(ctx, setCmd(key, value, ro));
      // 老版本的 setprop 被拒时可能仍返回 0，回读校验
      if ((await readProp(ctx, key)).trim() !== value.trim()) throw new adb.AdbError(t("propNotApplied"), 400);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  router.post(
    "/delete",
    wrap(async (req, res) => {
      const key = assertPropKey(req.body.key);
      const ctx = await ctxOf(req);
      assertRoot(ctx);
      await assertResetprop(ctx);
      assertPropForce(propRisk(key) ?? "delete", req.body.force);
      await propRun(ctx, deleteCmd(key));
      if ((await readProp(ctx, key)) !== "") throw new adb.AdbError(t("propNotApplied"), 400);
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  return router;
}
