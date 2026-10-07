import { execFile } from "node:child_process";
import type { Device } from "../shared/types.d.ts";
import * as adb from "./adb.ts";

const FASTBOOT = process.env.FASTBOOT_PATH || "fastboot";

/** fastboot 命令都是短命令，设备无响应时不让它一直挂着 */
const TIMEOUT = 5_000;

/** fastboot 可执行文件不存在 */
class FastbootMissing extends Error {}

/** 运行 fastboot；getvar 的结果写在 stderr，所以返回合并后的输出 */
function run(args: string[], timeout = TIMEOUT): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(FASTBOOT, args, { maxBuffer: 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (!err) resolve(`${stdout}\n${stderr}`);
      else if (err.code === "ENOENT") reject(new FastbootMissing());
      else reject(adb.execError(err, stderr || stdout, timeout));
    });
  });
}

export interface FastbootDeviceLine {
  serial: string;
  state: string;
}

/** 解析 fastboot devices -l 的输出（`serial\tfastboot usb:...`），分隔符可能是制表符或空格 */
export function parseFastbootDevices(out: string): FastbootDeviceLine[] {
  const list: FastbootDeviceLine[] = [];
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\S+)\s+(\S+)/);
    if (m) list.push({ serial: m[1], state: m[2] });
  }
  return list;
}

/** 从 fastboot getvar 的输出中取变量值；不同版本的输出可能带 `(bootloader) ` 前缀 */
export function parseGetvar(out: string, key: string): string | undefined {
  for (const line of out.split("\n")) {
    const m = line
      .trim()
      .replace(/^\(bootloader\)\s*/, "")
      .match(/^([^:\s]+):\s*(.*)$/);
    if (m && m[1] === key) return m[2].trim();
  }
  return undefined;
}

interface Info {
  userspace: boolean;
  product: string;
}

/** 按 serial 缓存首次查询的结果，设备从列表消失时清除；缓存 Promise 以免并发的轮询重复查询 */
const infoCache = new Map<string, Promise<Info | null>>();

async function queryInfo(serial: string): Promise<Info | null> {
  const getvar = async (key: string) => {
    try {
      return parseGetvar(await run(["-s", serial, "getvar", key]), key);
    } catch {
      return undefined;
    }
  };
  // 依次查询而不是并发，避免同时打扰设备
  const userspace = await getvar("is-userspace");
  const product = await getvar("product");
  if (userspace === undefined && product === undefined) return null;
  return { userspace: userspace === "yes", product: product ?? "" };
}

function infoOf(serial: string) {
  let info = infoCache.get(serial);
  if (!info) {
    info = queryInfo(serial);
    infoCache.set(serial, info);
    // 一项都没查到时不缓存，下一次轮询再试
    void info.then((r) => {
      if (!r && infoCache.get(serial) === info) infoCache.delete(serial);
    });
  }
  return info;
}

/** fastboot 设备列表。fastboot 不存在时 missing 为 true；其他错误按没有设备处理，不影响 adb */
export async function devices(): Promise<{ devices: Device[]; missing: boolean }> {
  let lines: FastbootDeviceLine[];
  try {
    lines = parseFastbootDevices(await run(["devices", "-l"]));
  } catch (e) {
    return { devices: [], missing: e instanceof FastbootMissing };
  }
  const present = new Set(lines.map((l) => l.serial));
  for (const serial of infoCache.keys()) if (!present.has(serial)) infoCache.delete(serial);

  const list = await Promise.all(
    lines.map(async ({ serial, state }): Promise<Device> => {
      if (state !== "fastboot") return { serial, transport: "fastboot", mode: "offline", model: "", name: serial };
      const info = await infoOf(serial);
      return {
        serial,
        transport: "fastboot",
        mode: info?.userspace ? "fastbootd" : "bootloader",
        model: info?.product ?? "",
        name: adb.cachedName(serial) || info?.product || serial,
      };
    }),
  );
  return { devices: list, missing: false };
}
