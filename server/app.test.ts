import fs from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { msg } from "./i18n.ts";
import { TMP } from "./tmp.ts";

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

/** 带上全部可能被前置校验用到的参数，只缺 serial，这样最先失败的就是 serial 校验 */
const PARAMS = {
  path: "/sdcard/a",
  paths: ["/sdcard/a"],
  from: "/sdcard/a",
  to: "/sdcard/b",
  dest: "/sdcard/b",
  mode: "644",
  owner: "root",
  format: "tgz",
  pkg: "com.example.app",
  key: "debug.adbfm.test",
  value: "1",
};

/** preview、archive、extract 会先按扩展名判断类型，需要给出对应类型的路径 */
const PATHS: Record<string, string> = {
  "/api/files/preview": "/sdcard/a.png",
  "/api/files/archive": "/sdcard/a.zip",
  "/api/files/extract": "/sdcard/a.zip",
};

async function call(method: "GET" | "POST", url: string) {
  const params = { ...PARAMS, path: PATHS[url] ?? PARAMS.path };
  const query = method === "GET" ? `?${new URLSearchParams({ path: params.path, pkg: params.pkg })}` : "";
  const res = await fetch(base + url + query, {
    method,
    headers: { "content-type": "application/json", "x-lang": "zh" },
    body: method === "POST" ? JSON.stringify(params) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as { error?: string } | null };
}

describe("createApp 的接口挂载", () => {
  it.each([
    ["GET", "/api/files/ls"],
    ["POST", "/api/files/mkdir"],
    ["POST", "/api/files/rename"],
    ["POST", "/api/files/delete"],
    ["POST", "/api/files/copy"],
    ["POST", "/api/files/move"],
    ["GET", "/api/files/preview"],
    ["GET", "/api/files/text"],
    ["GET", "/api/files/stat"],
    ["GET", "/api/files/usage"],
    ["POST", "/api/files/chmod"],
    ["POST", "/api/files/chown"],
    ["GET", "/api/files/archive"],
    ["POST", "/api/files/extract"],
    ["POST", "/api/files/compress"],
    ["POST", "/api/files/upload"],
    ["POST", "/api/files/pull"],
    ["GET", "/api/apps"],
    ["GET", "/api/apps/info"],
    ["POST", "/api/apps/uninstall"],
    ["POST", "/api/apps/uninstall-updates"],
    ["POST", "/api/apps/restore"],
    ["POST", "/api/apps/disable"],
    ["POST", "/api/apps/enable"],
    ["POST", "/api/apps/force-stop"],
    ["POST", "/api/apps/clear"],
    ["POST", "/api/apps/extract"],
    ["POST", "/api/apps/install"],
    ["GET", "/api/props"],
    ["POST", "/api/props/set"],
    ["POST", "/api/props/delete"],
    ["GET", "/api/devices/storage"],
    ["POST", "/api/devices/root-check"],
  ] as const)("%s %s 不带 serial 时返回 400", async (method, url) => {
    const { status, body } = await call(method, url);
    expect(status).toBe(400);
    expect(body?.error).toBe(msg("missingSerial"));
  });

  it("GET /api/files/fetch/:token 对不存在的 token 返回 404", async () => {
    const { status, body } = await call("GET", "/api/files/fetch/nope");
    expect(status).toBe(404);
    expect(body?.error).toBe(msg("downloadExpired"));
  });

  it("GET /api/apps/info 包名不合法时返回 400", async () => {
    const query = new URLSearchParams({ serial: "x", pkg: "com.a;rm -rf" });
    const res = await fetch(`${base}/api/apps/info?${query}`, { headers: { "x-lang": "zh" } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(msg("badPackage"));
  });

  it.each(["uninstall", "uninstall-updates", "restore", "disable", "enable", "force-stop", "clear", "extract"])(
    "POST /api/apps/%s 包名不合法时返回 400",
    async (action) => {
      const res = await fetch(`${base}/api/apps/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-lang": "zh" },
        body: JSON.stringify({ serial: "x", pkg: "com.a;rm -rf" }),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe(msg("badPackage"));
    },
  );

  describe("POST /api/apps/install 的前置校验", () => {
    async function install(names: string[], rawNames?: string) {
      const form = new FormData();
      form.append("names", rawNames ?? JSON.stringify(names));
      for (const _ of names) form.append("files", new Blob(["x"]), "blob");
      const before = await fs.readdir(TMP);
      const res = await fetch(`${base}/api/apps/install?serial=x`, {
        method: "POST",
        headers: { "x-lang": "zh" },
        body: form,
      });
      // 校验失败时 multer 存下的文件要同步删除
      expect(await fs.readdir(TMP)).toEqual(before);
      return { status: res.status, error: ((await res.json()) as { error: string }).error };
    }

    it.each([
      ["不支持的扩展名", ["a.txt"], "badInstallFile"],
      ["多个文件里混入不支持的", ["a.apk", "b.zip"], "badInstallFile"],
      [".apks 与其他文件同时选择", ["a.apks", "b.apk"], "installBundleAlone"],
      [".xapk 与其他文件同时选择", ["a.xapk", "b.xapk"], "installBundleAlone"],
    ] as const)("%s返回 400", async (_name, names, key) => {
      expect(await install([...names])).toEqual({ status: 400, error: msg(key) });
    });

    it("names 不是文件名数组的 JSON 时返回 400", async () => {
      expect(await install(["a.apk"], "{oops")).toEqual({ status: 400, error: msg("badInstallNames") });
      expect(await install(["a.apk"], "[1]")).toEqual({ status: 400, error: msg("badInstallNames") });
    });
  });

  it.each([
    ["GET", "/api/jobs/nope/events"],
    ["POST", "/api/jobs/nope/cancel"],
  ] as const)("%s %s 对不存在的任务返回 404", async (method, url) => {
    const { status, body } = await call(method, url);
    expect(status).toBe(404);
    expect(body?.error).toBe(msg("jobNotFound"));
  });

  it.each([
    ["GET", "/api/ls"],
    ["POST", "/api/mkdir"],
    ["POST", "/api/root-check"],
    ["GET", "/api/storage"],
    ["GET", "/api/fetch/nope"],
  ] as const)("旧路径 %s %s 返回 404", async (method, url) => {
    const { status } = await call(method, url);
    expect(status).toBe(404);
  });
});
