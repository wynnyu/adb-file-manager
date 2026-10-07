import type { ExecFileException } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  AdbError,
  AUTH_RETRY_DELAY,
  type AuthWatch,
  assertAbs,
  execError,
  pickAuthRetries,
  q,
  stageCleanupCmd,
} from "./adb.ts";

describe("assertAbs", () => {
  it("规范化路径", () => {
    expect(assertAbs("/sdcard/../data//local/")).toBe("/data/local/");
    expect(assertAbs("/sdcard/./DCIM")).toBe("/sdcard/DCIM");
  });

  it.each([["sdcard"], [""], ["/sdcard/\0x"], [undefined], [["/sdcard"]]])("拒绝 %j", (p) => {
    expect(() => assertAbs(p)).toThrow(AdbError);
  });
});

describe("q", () => {
  it("用单引号包住并转义其中的单引号", () => {
    expect(q("a b")).toBe("'a b'");
    expect(q("it's")).toBe(`'it'\\''s'`);
    expect(q("$(rm -rf /)")).toBe("'$(rm -rf /)'");
  });
});

describe("execError", () => {
  const failure = (props: Partial<ExecFileException>) =>
    Object.assign(new Error("Command failed"), props) as ExecFileException;

  it.each([
    ["超时被终止", failure({ killed: true, signal: "SIGTERM" }), "", 30_000, 504, "30 秒内未完成"],
    [
      "signal 取消不算超时",
      failure({ killed: true, signal: "SIGTERM", name: "AbortError" }),
      "",
      30_000,
      500,
      "Command failed",
    ],
    ["未设超时时被终止不算超时", failure({ killed: true, signal: "SIGTERM" }), "", 0, 500, "Command failed"],
    ["普通失败提取错误行", failure({ code: 1 }), "info\nadb: error: device offline\n", 30_000, 500, "device offline"],
  ])("%s", (_name, err, output, timeout, status, text) => {
    const e = execError(err, output, timeout);
    expect(e).toBeInstanceOf(AdbError);
    expect(e.status).toBe(status);
    expect(e.message).toContain(text);
  });
});

describe("stageCleanupCmd", () => {
  it("跳过当前进程的暂存目录，删除其余的 adbfm-*", () => {
    const cmd = stageCleanupCmd("abc");
    expect(cmd).toContain("for d in /data/local/tmp/adbfm-*;");
    expect(cmd).toContain(`case "$d" in /data/local/tmp/adbfm-abc-*) ;; *) rm -rf "$d" ;; esac`);
    expect(cmd.endsWith("; true")).toBe(true);
  });

  it("除参数外不含其他外部输入", () => {
    expect(stageCleanupCmd("x1")).toBe(stageCleanupCmd("abc").replaceAll("abc", "x1"));
  });
});

describe("pickAuthRetries", () => {
  const un = [{ serial: "A", state: "unauthorized" }];
  const ok = [{ serial: "A", state: "device" }];

  it("首次出现只记录，不重试", () => {
    const state = new Map<string, AuthWatch>();
    expect(pickAuthRetries(un, 1000, state)).toEqual([]);
    expect(state.get("A")).toEqual({ since: 1000, retried: false });
  });

  it.each([
    [AUTH_RETRY_DELAY - 1, []],
    [AUTH_RETRY_DELAY, ["A"]],
  ])("持续 %i 毫秒后的结果为 %j", (elapsed, expected) => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: false }]]);
    expect(pickAuthRetries(un, elapsed, state)).toEqual(expected);
  });

  it("超时后只重试一次", () => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: false }]]);
    expect(pickAuthRetries(un, AUTH_RETRY_DELAY, state)).toEqual(["A"]);
    expect(pickAuthRetries(un, AUTH_RETRY_DELAY * 3, state)).toEqual([]);
  });

  it.each([
    ["状态恢复", ok],
    ["设备消失", []],
  ])("%s后清除记录，再次待授权时重新计时", (_name, next) => {
    const state = new Map<string, AuthWatch>([["A", { since: 0, retried: true }]]);
    pickAuthRetries(next, 100_000, state);
    expect(state.has("A")).toBe(false);
    expect(pickAuthRetries(un, 200_000, state)).toEqual([]);
    expect(pickAuthRetries(un, 200_000 + AUTH_RETRY_DELAY, state)).toEqual(["A"]);
  });
});
