import { describe, expect, it } from "vitest";
import { AdbError } from "./adb.ts";
import {
  assertPropKey,
  assertPropValue,
  deleteCmd,
  listCmd,
  parseList,
  parseProps,
  propFailure,
  RESETPROP,
  setCmd,
} from "./props.ts";

describe("parseProps", () => {
  it("解析 [key]: [value] 并按键名排序", () => {
    const out = "[sys.b]: [2]\n[persist.a]: [1]\n[ro.c]: [x y]\n";
    expect(parseProps(out)).toEqual([
      { key: "persist.a", value: "1" },
      { key: "ro.c", value: "x y" },
      { key: "sys.b", value: "2" },
    ]);
  });

  it("空值解析为空串", () => {
    expect(parseProps("[a.b]: []\n")).toEqual([{ key: "a.b", value: "" }]);
  });

  it("值里含 ] 和 [ 时保持原样", () => {
    expect(parseProps("[a]: [x]y]\n[b]: [[z]]\n[c]: [k]: [v]\n")).toEqual([
      { key: "a", value: "x]y" },
      { key: "b", value: "[z]" },
      { key: "c", value: "k]: [v" },
    ]);
  });

  it("多行值并入上一项", () => {
    const out = "[a.cert]: [line1\nline2\n]\n[b]: [1]\n";
    expect(parseProps(out)).toEqual([
      { key: "a.cert", value: "line1\nline2\n" },
      { key: "b", value: "1" },
    ]);
  });

  it("兼容 CRLF，忽略开头的杂行和空输出", () => {
    expect(parseProps("[a]: [1]\r\n[b]: [2]\r\n")).toEqual([
      { key: "a", value: "1" },
      { key: "b", value: "2" },
    ]);
    expect(parseProps("noise\n")).toEqual([]);
    expect(parseProps("")).toEqual([]);
  });
});

describe("listCmd 与 parseList", () => {
  it("非 root 只有 getprop", () => {
    expect(listCmd(false)).toBe("getprop");
    expect(parseList("[a]: [1]\n")).toEqual({ props: [{ key: "a", value: "1" }], resetprop: false });
  });

  it("root 追加 resetprop 检测，输出 yes 时可用", () => {
    expect(listCmd(true)).toContain("getprop; echo __ADBFM_SPLIT__;");
    expect(parseList("[a]: [1]\n__ADBFM_SPLIT__\nyes\n")).toEqual({
      props: [{ key: "a", value: "1" }],
      resetprop: true,
    });
    expect(parseList("[a]: [1]\n__ADBFM_SPLIT__\n\n").resetprop).toBe(false);
  });
});

describe("assertPropKey", () => {
  it.each(["debug.adbfm.test", "ro.build.version.sdk", "persist.sys.a-b", "vendor.x:y@z", "_a", "a"])(
    "接受 %s",
    (key) => {
      expect(assertPropKey(key)).toBe(key);
    },
  );

  it.each([
    ["空串", ""],
    ["以点开头", ".a"],
    ["以连字符开头", "-n"],
    ["含空格", "a b"],
    ["含单引号", "a'b"],
    ["含分号", "a;reboot"],
    ["含换行", "a\nb"],
    ["超长", "a".repeat(129)],
    ["非字符串", 1],
    ["缺省", undefined],
  ])("拒绝%s，返回 400", (_name, key) => {
    try {
      assertPropKey(key);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AdbError);
      expect((e as AdbError).status).toBe(400);
    }
  });

  it.each(["ctl.start", "ctl.restart", "ctl.stop", "sys.powerctl"])("拒绝控制属性 %s", (key) => {
    expect(() => assertPropKey(key)).toThrow(AdbError);
  });

  it("只拒绝 sys.powerctl 本身，不误伤相近的键", () => {
    expect(assertPropKey("sys.powerctl.x")).toBe("sys.powerctl.x");
    expect(assertPropKey("ctlx.a")).toBe("ctlx.a");
  });
});

describe("assertPropValue", () => {
  it.each(["", "1", "hello world", "a'b", "$(reboot)", "中文"])("接受 %j", (v) => {
    expect(assertPropValue(v)).toBe(v);
  });

  it.each([
    ["换行", "a\nb"],
    ["回车", "a\rb"],
    ["空字符", "a\0b"],
    ["超长", "a".repeat(4097)],
    ["非字符串", 1],
    ["缺省", undefined],
  ])("拒绝%s，返回 400", (_name, v) => {
    try {
      assertPropValue(v);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AdbError);
      expect((e as AdbError).status).toBe(400);
    }
  });
});

describe("setCmd 与 deleteCmd", () => {
  it("setprop 的键和值都经单引号转义", () => {
    expect(setCmd("debug.a", "it's $(x)", false)).toBe("setprop 'debug.a' 'it'\\''s $(x)'");
    expect(setCmd("debug.a", "", false)).toBe("setprop 'debug.a' ''");
  });

  it("ro.* 经 resetprop 函数，值同样转义", () => {
    const cmd = setCmd("ro.adbfm.test", "a b'c", true);
    expect(cmd.startsWith(RESETPROP)).toBe(true);
    expect(cmd.endsWith("; adbfm_resetprop 'ro.adbfm.test' 'a b'\\''c'")).toBe(true);
  });

  it("删除用 -d，persist.* 加 -p", () => {
    expect(deleteCmd("ro.adbfm.test")).toMatch(/; adbfm_resetprop -d 'ro\.adbfm\.test'$/);
    expect(deleteCmd("persist.adbfm.test")).toMatch(/; adbfm_resetprop -p -d 'persist\.adbfm\.test'$/);
  });

  it("RESETPROP 依次尝试 PATH、ksu、ap、magisk，都没有时输出标记并返回 127", () => {
    const order = [
      "command -v resetprop",
      "/data/adb/ksu/bin/resetprop",
      "/data/adb/ap/bin/resetprop",
      "magisk resetprop",
    ];
    const positions = order.map((s) => RESETPROP.indexOf(s));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(RESETPROP).toContain("return 127");
  });
});

describe("propFailure", () => {
  it.each([
    ["Failed to set property 'persist.x' to '1'. See dmesg for error reason.", "Failed to set property"],
    ["setprop: failed to set property 'a' to 'b'", "failed to set property"],
    ["could not set property 'a'", "could not set property"],
    ["property value too long", "too long"],
    ["Error: invalid property name", "invalid property"],
    ["__ADBFM_NO_RESETPROP__", "resetprop not found"],
  ])("识别 %s", (out, part) => {
    expect(propFailure(out)).toContain(part);
  });

  it("取到包含原因的整行", () => {
    expect(propFailure("ok\nFailed to set property 'a' to 'b'.\n")).toBe("Failed to set property 'a' to 'b'.");
  });

  it.each(["", "\n", "ok"])("没有失败迹象时为 undefined：%j", (out) => {
    expect(propFailure(out)).toBeUndefined();
  });
});
