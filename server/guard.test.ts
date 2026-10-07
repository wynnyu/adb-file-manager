import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AdbError } from "./adb.ts";
import { assertNotCritical, assertPropForce, criticalRole, isProtected, localOnly, propRisk } from "./guard.ts";
import { msg } from "./i18n.ts";

describe("isProtected", () => {
  it.each([
    "/",
    "/sdcard",
    "/data",
    "/system",
    "/storage",
    "/storage/emulated",
    "/storage/self",
    "/storage/1234-ABCD",
    "/storage/emulated/0",
    "/storage/emulated/10",
    "/storage/self/primary",
    "/mnt",
    "/mnt/user",
    "/mnt/user/0",
    "/mnt/user/0/emulated",
    "/mnt/user/0/emulated/0",
    "/mnt/media_rw/1234-ABCD",
    "/mnt/pass_through/0/emulated/0",
  ])("拒绝 %s", (p) => {
    expect(isProtected(p)).toBe(true);
  });

  it.each([
    "/sdcard/DCIM",
    "/sdcard/Download/a.txt",
    "/storage/emulated/0/Download",
    "/storage/self/primary/Music",
    "/storage/1234-ABCD/Music",
    "/data/local/tmp",
    "/data/data/com.example.app",
    "/mnt/user/0/emulated/0/DCIM",
    "/mnt/media_rw/1234-abcd/Music",
  ])("允许 %s", (p) => {
    expect(isProtected(p)).toBe(false);
  });
});

describe("localOnly", () => {
  function check(headers: Record<string, string>) {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();
    localOnly({ headers } as unknown as Request, res as unknown as Response, next as NextFunction);
    return { res, next };
  }

  it.each<Record<string, string>>([
    { host: "localhost:3001" },
    { host: "127.0.0.1:3001", origin: "http://localhost:5173", "sec-fetch-site": "same-origin" },
    { host: "[::1]:3001", "sec-fetch-site": "none" },
  ])("放行本机请求 %o", (headers) => {
    const { res, next } = check(headers);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    [{ host: "evil.example:3001" }, "forbiddenHost"],
    [{ host: "localhost:3001", origin: "http://evil.example" }, "forbiddenOrigin"],
    [{ host: "localhost:3001", "sec-fetch-site": "cross-site" }, "forbiddenOrigin"],
  ] as const)("拒绝 %o，返回 403 和本地化的错误信息", (headers, key) => {
    const { res, next } = check(headers);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: msg(key) });
  });
});

describe("criticalRole", () => {
  it.each([
    ["android", "core"],
    ["com.android.systemui", "systemui"],
    ["com.android.settings", "settings"],
    ["com.android.phone", "core"],
    ["com.android.providers.settings", "core"],
    ["com.android.shell", "core"],
    ["com.android.server.telecom", "core"],
    ["com.android.packageinstaller", "core"],
    ["com.google.android.packageinstaller", "core"],
    ["com.android.permissioncontroller", "core"],
    ["com.google.android.permissioncontroller", "core"],
  ])("静态表中的 %s 是 %s", (pkg, role) => {
    expect(criticalRole(pkg)).toBe(role);
  });

  it("按当前启动器和输入法判断", () => {
    const current = { launcher: "com.miui.home", ime: "com.sohu.inputmethod.sogou" };
    expect(criticalRole("com.miui.home", current)).toBe("launcher");
    expect(criticalRole("com.sohu.inputmethod.sogou", current)).toBe("ime");
    expect(criticalRole("com.miui.home")).toBeUndefined();
  });

  it("静态表优先于启动器和输入法", () => {
    expect(criticalRole("com.android.settings", { launcher: "com.android.settings" })).toBe("settings");
  });

  it.each(["com.example.app", "constructor", "toString", "__proto__"])("%s 不是关键包", (pkg) => {
    expect(criticalRole(pkg, { launcher: "com.miui.home" })).toBeUndefined();
  });
});

describe("assertNotCritical", () => {
  it("关键包没有 force 时返回 409", () => {
    for (const force of [undefined, false, "true", 1]) {
      try {
        assertNotCritical("systemui", force);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AdbError);
        expect((e as AdbError).status).toBe(409);
        expect((e as AdbError).message).toBe(msg("criticalPackage"));
      }
    }
  });

  it("关键包带 force: true 时放行", () => {
    expect(() => assertNotCritical("launcher", true)).not.toThrow();
  });

  it("非关键包始终放行", () => {
    expect(() => assertNotCritical(undefined, undefined)).not.toThrow();
  });
});

describe("propRisk", () => {
  it.each([
    ["ro.debuggable", "ro"],
    ["ro.build.fingerprint", "ro"],
    ["sys.usb.config", "adb"],
    ["persist.sys.usb.config", "adb"],
    ["service.adb.root", "adb"],
    ["service.adb.tcp.port", "adb"],
    ["persist.adb.tcp.port", "adb"],
    ["persist.service.adb.enable", "adb"],
  ])("%s 的风险是 %s", (key, risk) => {
    expect(propRisk(key)).toBe(risk);
  });

  it.each(["debug.adbfm.test", "persist.sys.language", "sys.usb.state", "constructor", "ro"])("%s 没有风险", (key) => {
    expect(propRisk(key)).toBeUndefined();
  });
});

describe("assertPropForce", () => {
  it.each([
    ["ro", "propRiskRo"],
    ["adb", "propRiskAdb"],
    ["delete", "propRiskDelete"],
  ] as const)("%s 风险没有 force 时返回 409 和 needs_force", (risk, key) => {
    for (const force of [undefined, false, "true", 1]) {
      try {
        assertPropForce(risk, force);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AdbError);
        expect((e as AdbError).status).toBe(409);
        expect((e as AdbError).code).toBe("needs_force");
        expect((e as AdbError).message).toBe(msg(key));
      }
    }
  });

  it("带 force: true 时放行", () => {
    expect(() => assertPropForce("ro", true)).not.toThrow();
  });

  it("没有风险时始终放行", () => {
    expect(() => assertPropForce(undefined, undefined)).not.toThrow();
  });
});
