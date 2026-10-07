import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipArchive } from "archiver";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdbError } from "./adb.ts";
import { localApkName, readBundle } from "./bundle.ts";
import { msg } from "./i18n.ts";

let root: string;
let out: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "bundle-test-"));
  out = path.join(root, "out");
  await fs.mkdir(out);
});

afterEach(() => fs.rm(root, { recursive: true, force: true }));

/** 现场生成一个 zip，条目内容为字符串或 Buffer */
async function makeZip(files: Record<string, string | Buffer>) {
  const file = path.join(root, "pkg.zip");
  const zip = new ZipArchive();
  const done = pipeline(zip, createWriteStream(file));
  for (const [name, data] of Object.entries(files)) zip.append(data, { name });
  await zip.finalize();
  await done;
  return file;
}

const read = (file: string) => fs.readFile(file, "utf8");
const manifest = (m: object) => JSON.stringify(m);
const signal = () => new AbortController().signal;

/** 读取分包并期望以 AdbError 失败 */
async function failure(files: Record<string, string | Buffer>) {
  const err = await readBundle(await makeZip(files), out, signal()).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AdbError);
  return err as AdbError;
}

describe("localApkName", () => {
  it.each([
    [0, "base.apk", "0_base.apk"],
    [1, "split_config.arm64_v8a.apk", "1_split_config.arm64_v8a.apk"],
    [2, "we ird (1);rm.apk", "2_we_ird__1__rm.apk"],
    [3, "应用.apk", "3___.apk"],
  ])("%d、%s 转为 %s", (i, name, expected) => {
    expect(localApkName(i, name)).toBe(expected);
  });
});

describe("readBundle", () => {
  it("读取 SAI 风格的 .apks：解出根目录下的全部 APK，内容一致", async () => {
    const file = await makeZip({
      "base.apk": "BASE",
      "split_config.arm64_v8a.apk": "ABI",
      "split_config.xxhdpi.apk": "DPI",
      "meta.sai_v2.json": "{}",
    });
    const bundle = await readBundle(file, out, signal());
    expect(bundle.apks.map((p) => path.basename(p)).sort()).toEqual([
      "0_base.apk",
      "1_split_config.arm64_v8a.apk",
      "2_split_config.xxhdpi.apk",
    ]);
    expect(await Promise.all(bundle.apks.map(read))).toEqual(["BASE", "ABI", "DPI"]);
    expect(bundle.obb).toEqual([]);
    expect(bundle.pkg).toBeUndefined();
  });

  it("读取带 OBB 的 .xapk：OBB 解到本机，目标为 /sdcard/Android/obb/<包名>/", async () => {
    const obb = Buffer.from([0, 1, 2, 3, 255]);
    const file = await makeZip({
      "com.x.apk": "APK",
      "config.arm64_v8a.apk": "ABI",
      "manifest.json": manifest({
        package_name: "com.x",
        expansions: [
          {
            file: "Android/obb/com.x/main.1.com.x.obb",
            install_location: "EXTERNAL_STORAGE",
            install_path: "Android/obb/com.x/main.1.com.x.obb",
          },
        ],
      }),
      "Android/obb/com.x/main.1.com.x.obb": obb,
    });
    const bundle = await readBundle(file, out, signal());
    expect(bundle.pkg).toBe("com.x");
    expect(bundle.apks).toHaveLength(2);
    expect(bundle.obb).toHaveLength(1);
    expect(bundle.obb[0].remote).toBe("/sdcard/Android/obb/com.x/main.1.com.x.obb");
    // adb push 到目录时沿用本机文件名，必须与设备端文件名一致
    expect(path.basename(bundle.obb[0].local)).toBe("main.1.com.x.obb");
    expect(await fs.readFile(bundle.obb[0].local)).toEqual(obb);
    expect(bundle.obb[0].local.startsWith(out + path.sep)).toBe(true);
  });

  it("清单没有 file 字段时按 install_path 找条目", async () => {
    const p = "Android/obb/com.x/patch.2.com.x.obb";
    const file = await makeZip({
      "a.apk": "A",
      "manifest.json": manifest({ package_name: "com.x", expansions: [{ install_path: p }] }),
      [p]: "OBB",
    });
    const bundle = await readBundle(file, out, signal());
    expect(await read(bundle.obb[0].local)).toBe("OBB");
  });

  it("没有 manifest.json 的 XAPK 只装 APK", async () => {
    const bundle = await readBundle(await makeZip({ "a.apk": "A" }), out, signal());
    expect(bundle.apks).toHaveLength(1);
    expect(bundle.obb).toEqual([]);
  });

  it("含 toc.pb 的 bundletool 产物不支持", async () => {
    const err = await failure({ "toc.pb": "x", "splits/base-master.apk": "A", "standalones/s.apk": "B" });
    expect(err.message).toBe(msg("bundleUnsupported"));
    expect(err.status).toBe(400);
  });

  it.each([
    ["含 ..", "Android/obb/com.x/../../evil.obb"],
    ["含 .. 但规范化后仍在目录内", "Android/obb/com.x/a/../b.obb"],
    ["绝对路径", "/Android/obb/com.x/a.obb"],
    ["不在 obb 下", "Android/data/com.x/a.obb"],
    ["是其他应用的目录", "Android/obb/com.other/a.obb"],
    ["只到包目录", "Android/obb/com.x"],
    ["含空段", "Android/obb/com.x//a.obb"],
    ["含反斜杠", "Android/obb/com.x/a\\..\\b.obb"],
    ["含当前目录段", "Android/obb/com.x/./a.obb"],
  ])("拒绝 install_path %s，且不解出任何文件", async (_name, installPath) => {
    const err = await failure({
      "a.apk": "A",
      "manifest.json": manifest({ package_name: "com.x", expansions: [{ file: "o.obb", install_path: installPath }] }),
      "o.obb": "OBB",
    });
    expect(err.message).toBe(msg("bundleUnsafe"));
    expect(await fs.readdir(out)).toEqual([]);
  });

  it.each([
    ["缺少包名", { expansions: [{ install_path: "Android/obb/com.x/a.obb" }] }],
    ["包名为 ..", { package_name: "..", expansions: [{ install_path: "Android/obb/../a.obb" }] }],
    ["install_path 不是字符串", { package_name: "com.x", expansions: [{ install_path: 1 }] }],
    ["条目不是对象", { package_name: "com.x", expansions: [null] }],
  ])("拒绝清单%s", async (_name, m) => {
    const err = await failure({ "a.apk": "A", "manifest.json": manifest(m) });
    expect(err.message).toBe(msg("bundleUnsafe"));
  });

  it("清单列出的 OBB 不在包里时报错", async () => {
    const err = await failure({
      "a.apk": "A",
      "manifest.json": manifest({
        package_name: "com.x",
        expansions: [{ file: "gone.obb", install_path: "Android/obb/com.x/gone.obb" }],
      }),
    });
    expect(err.message).toBe(msg("bundleMissingEntry", { name: "gone.obb" }));
  });

  it("只有子目录里的 APK 或没有 APK 时报空包", async () => {
    expect((await failure({ "splits/a.apk": "A", "readme.txt": "x" })).message).toBe(msg("bundleEmpty"));
    expect((await failure({ "readme.txt": "x" })).message).toBe(msg("bundleEmpty"));
  });

  it("清单不是合法 JSON 时报无法读取", async () => {
    const err = await failure({ "a.apk": "A", "manifest.json": "{not json" });
    expect(err.message).toBe(msg("bundleBroken", { reason: "manifest.json" }));
  });

  it("不是 zip 时报无法读取", async () => {
    const file = path.join(root, "junk.apks");
    await fs.writeFile(file, "this is not a zip file");
    const err = await readBundle(file, out, signal()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AdbError);
    expect((err as AdbError).message).toContain(msg("bundleBroken", { reason: "" }));
  });

  it("文件名里的特殊字符不会进入本机路径", async () => {
    const bundle = await readBundle(await makeZip({ "we ird (1);x.apk": "A" }), out, signal());
    expect(path.basename(bundle.apks[0])).toBe("0_we_ird__1__x.apk");
  });

  it("signal 已取消时中止，不解出文件", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readBundle(await makeZip({ "a.apk": "A" }), out, controller.signal)).rejects.toThrow();
    expect(await fs.readdir(out)).toEqual([]);
  });
});
