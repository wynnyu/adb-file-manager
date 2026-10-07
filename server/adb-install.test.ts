import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type * as AdbModule from "./adb.ts";

let dir: string;
let adb: typeof AdbModule;

/** 用脚本冒充 adb：把收到的参数写进 args 文件，再按 MODE 文件的内容输出 */
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "adb-install-test-"));
  const script = path.join(dir, "adb");
  await fs.writeFile(script, `#!/bin/sh\necho "$@" > "${dir}/args"\ncat "${dir}/out"\n`, { mode: 0o755 });
  process.env.ADB_PATH = script;
  adb = await import("./adb.ts");
});

afterAll(async () => {
  delete process.env.ADB_PATH;
  await fs.rm(dir, { recursive: true, force: true });
});

const stub = (out: string) => fs.writeFile(path.join(dir, "out"), out);
const args = async () => (await fs.readFile(path.join(dir, "args"), "utf8")).trim();

describe("adb.install", () => {
  it("单个 APK 用 install -r", async () => {
    await stub("Performing Streamed Install\nSuccess\n");
    await adb.install("S1", ["/tmp/a.apk"]);
    expect(await args()).toBe("-s S1 install -r /tmp/a.apk");
  });

  it("多个 APK 用 install-multiple -r", async () => {
    await stub("Success\n");
    await adb.install("S1", ["/tmp/a.apk", "/tmp/b.apk"]);
    expect(await args()).toBe("-s S1 install-multiple -r /tmp/a.apk /tmp/b.apk");
  });

  it("老版本 adb 失败也返回 0：输出里没有 Success 时抛出错误", async () => {
    await stub(
      "Performing Streamed Install\nadb: failed to install a.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE]\n",
    );
    const err = await adb.install("S1", ["/tmp/a.apk"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(adb.AdbError);
    expect((err as Error).message).toContain("INSTALL_FAILED_VERSION_DOWNGRADE");
  });
});
