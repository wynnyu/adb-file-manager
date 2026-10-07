import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import posix from "node:path/posix";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";
import { AdbError } from "./adb.ts";
import { msg } from "./i18n.ts";

/** 安装包里的 OBB：local 是解出的本机路径，remote 是设备上的绝对路径 */
export interface BundleObb {
  local: string;
  remote: string;
}

export interface Bundle {
  /** 解到 dir 里的 APK，可直接交给 adb install-multiple */
  apks: string[];
  obb: BundleObb[];
  /** XAPK 清单里的包名 */
  pkg?: string;
}

/** 清单的大小上限，字节 */
const MANIFEST_LIMIT = 1024 * 1024;

/** 本机 APK 文件名：adb 会把文件名拼进设备端命令，只留安全字符；加序号避免重名 */
export const localApkName = (index: number, name: string) => `${index}_${name.replace(/[^A-Za-z0-9._-]/g, "_")}`;

const openZip = (file: string) =>
  new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, zip) => (err ? reject(err) : resolve(zip))),
  );

/** 读出全部条目（不含目录），打开 zip 时用了 lazyEntries，需逐个 readEntry */
const listEntries = (zip: yauzl.ZipFile) =>
  new Promise<Map<string, yauzl.Entry>>((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    zip.on("entry", (entry: yauzl.Entry) => {
      if (!entry.fileName.endsWith("/")) entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.once("end", () => resolve(entries));
    zip.once("error", reject);
    zip.readEntry();
  });

const openEntry = (zip: yauzl.ZipFile, entry: yauzl.Entry) =>
  new Promise<NodeJS.ReadableStream>((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))),
  );

async function extractEntry(zip: yauzl.ZipFile, entry: yauzl.Entry, dest: string, signal: AbortSignal) {
  await pipeline(await openEntry(zip, entry), createWriteStream(dest), { signal });
}

async function readText(zip: yauzl.ZipFile, entry: yauzl.Entry) {
  if (entry.uncompressedSize > MANIFEST_LIMIT) throw new AdbError(msg("bundleBroken", { reason: entry.fileName }), 400);
  const chunks: Buffer[] = [];
  for await (const chunk of await openEntry(zip, entry)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

/** target 是否在 dir 之内 */
const inside = (dir: string, target: string) => {
  const rel = path.relative(dir, target);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

interface Manifest {
  package_name?: unknown;
  expansions?: unknown;
}

/**
 * OBB 在设备上的路径：必须是 Android/obb/<包名>/ 下的相对路径，不含 ..、. 和空段。
 * 返回以 /sdcard/ 为前缀的绝对路径
 */
function obbRemote(installPath: unknown, pkg: unknown) {
  const unsafe = () => new AdbError(msg("bundleUnsafe"), 400);
  if (typeof installPath !== "string" || typeof pkg !== "string" || !pkg) throw unsafe();
  const parts = installPath.split("/");
  const ok =
    parts.length >= 4 &&
    parts[0] === "Android" &&
    parts[1] === "obb" &&
    parts[2] === pkg &&
    !parts.some((s) => s === "" || s === "." || s === ".." || s.includes("\0") || s.includes("\\"));
  if (!ok) throw unsafe();
  return posix.join("/sdcard", installPath);
}

/**
 * 读取 .apks 或 .xapk 分包，把 APK 和 OBB 解到 dir。
 * 只认根目录下的 *.apk（SAI 导出的 .apks 和 XAPK 都是这个结构）；含 toc.pb 的是 bundletool 产物，
 * 需按设备配置挑选分包，不支持。XAPK 的 manifest.json 声明 OBB，路径经校验后才解出
 */
export async function readBundle(file: string, dir: string, signal: AbortSignal): Promise<Bundle> {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(file);
  } catch (e) {
    throw new AdbError(msg("bundleBroken", { reason: (e as Error).message }), 400);
  }
  try {
    const entries = await listEntries(zip);
    if (entries.has("toc.pb")) throw new AdbError(msg("bundleUnsupported"), 400);
    const apkEntries = [...entries.values()].filter(
      (e) => !e.fileName.includes("/") && e.fileName.toLowerCase().endsWith(".apk"),
    );
    if (!apkEntries.length) throw new AdbError(msg("bundleEmpty"), 400);

    const manifestEntry = entries.get("manifest.json");
    let manifest: Manifest = {};
    if (manifestEntry) {
      try {
        manifest = JSON.parse(await readText(zip, manifestEntry)) as Manifest;
      } catch (e) {
        if (e instanceof AdbError) throw e;
        throw new AdbError(msg("bundleBroken", { reason: "manifest.json" }), 400);
      }
    }
    const pkg = typeof manifest.package_name === "string" ? manifest.package_name : undefined;

    // 先校验全部 OBB 路径再解压，校验不过时不留下半成品
    const expansions = Array.isArray(manifest.expansions) ? (manifest.expansions as Record<string, unknown>[]) : [];
    const planned = expansions.map((x) => {
      const remote = obbRemote(x?.install_path, pkg);
      const source = typeof x.file === "string" ? x.file : (x.install_path as string);
      const entry = entries.get(source) ?? entries.get(x.install_path as string);
      if (!entry) throw new AdbError(msg("bundleMissingEntry", { name: source }), 400);
      return { entry, remote };
    });

    const apks: string[] = [];
    for (const [i, entry] of apkEntries.entries()) {
      signal.throwIfAborted();
      const local = path.join(dir, localApkName(i, entry.fileName));
      if (!inside(dir, local)) throw new AdbError(msg("bundleUnsafe"), 400);
      await extractEntry(zip, entry, local, signal);
      apks.push(local);
    }

    const obb: BundleObb[] = [];
    for (const [i, { entry, remote }] of planned.entries()) {
      signal.throwIfAborted();
      // 本机文件名取设备端文件名，adb push 到目录时沿用它
      const local = path.join(dir, "obb", String(i), posix.basename(remote));
      if (!inside(dir, local)) throw new AdbError(msg("bundleUnsafe"), 400);
      await fs.mkdir(path.dirname(local), { recursive: true });
      await extractEntry(zip, entry, local, signal);
      obb.push({ local, remote });
    }
    return { apks, obb, pkg };
  } catch (e) {
    if (e instanceof AdbError || signal.aborted) throw e;
    throw new AdbError(msg("bundleBroken", { reason: (e as Error).message }), 400);
  } finally {
    zip.close();
  }
}
