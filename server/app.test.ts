import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { msg } from "./i18n.ts";

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
};

/** preview、archive、extract 会先按扩展名判断类型，需要给出对应类型的路径 */
const PATHS: Record<string, string> = {
  "/api/files/preview": "/sdcard/a.png",
  "/api/files/archive": "/sdcard/a.zip",
  "/api/files/extract": "/sdcard/a.zip",
};

async function call(method: "GET" | "POST", url: string) {
  const params = { ...PARAMS, path: PATHS[url] ?? PARAMS.path };
  const query = method === "GET" ? `?${new URLSearchParams({ path: params.path })}` : "";
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
