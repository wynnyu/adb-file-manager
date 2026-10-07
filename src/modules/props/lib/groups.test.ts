import { describe, expect, it } from "vitest";
import type { PropEntry } from "../../../types.ts";
import { countProps, filterProps, groupOf } from "./groups.ts";

const P = (key: string, value = ""): PropEntry => ({ key, value });

describe("groupOf", () => {
  it.each([
    ["ro.build.id", "ro"],
    ["persist.sys.language", "persist"],
    ["sys.boot_completed", "sys"],
    ["init.svc.adbd", "init"],
    ["init.svc_debug_pid.zygote", "init"],
    ["vendor.audio.x", "vendor"],
    ["debug.adbfm", "other"],
    ["dalvik.vm.heapsize", "other"],
    ["gsm.version.baseband", "other"],
    ["ro", "ro"],
    ["", "other"],
  ])("%s 属于 %s", (key, group) => {
    expect(groupOf(key)).toBe(group);
  });

  it.each(["constructor", "toString", "__proto__", "rox.a", "ro_x.a"])("%s 不会被误判为已有分组", (key) => {
    expect(groupOf(key)).toBe("other");
  });
});

describe("filterProps", () => {
  const props = [
    P("ro.build.id", "TQ3A"),
    P("persist.sys.language", "zh"),
    P("sys.boot", "1"),
    P("debug.x", "Ro-Value"),
  ];

  it("all 不按分组过滤", () => {
    expect(filterProps(props, "all", "")).toHaveLength(4);
  });

  it("按分组过滤", () => {
    expect(filterProps(props, "ro", "").map((p) => p.key)).toEqual(["ro.build.id"]);
    expect(filterProps(props, "other", "").map((p) => p.key)).toEqual(["debug.x"]);
  });

  it("搜索同时匹配键和值，不区分大小写，忽略首尾空白", () => {
    expect(filterProps(props, "all", " LANGUAGE ").map((p) => p.key)).toEqual(["persist.sys.language"]);
    expect(filterProps(props, "all", "tq3a").map((p) => p.key)).toEqual(["ro.build.id"]);
  });

  it("分组和搜索同时生效", () => {
    expect(filterProps(props, "ro", "ro").map((p) => p.key)).toEqual(["ro.build.id"]);
    expect(filterProps(props, "other", "ro").map((p) => p.key)).toEqual(["debug.x"]);
    expect(filterProps(props, "sys", "language")).toEqual([]);
  });
});

describe("countProps", () => {
  it("统计各分组数量，all 为总数", () => {
    const props = [P("ro.a"), P("ro.b"), P("persist.a"), P("sys.a"), P("init.svc.a"), P("vendor.a"), P("x.a")];
    expect(countProps(props)).toEqual({ all: 7, ro: 2, persist: 1, sys: 1, init: 1, vendor: 1, other: 1 });
  });

  it("空列表全为 0", () => {
    expect(countProps([])).toEqual({ all: 0, ro: 0, persist: 0, sys: 0, init: 0, vendor: 0, other: 0 });
  });
});
