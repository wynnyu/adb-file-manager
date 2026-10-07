import { describe, expect, it } from "vitest";
import { groupInstall, isInstallable } from "./install.ts";

const f = (name: string) => ({ name });
const names = (groups: { name: string }[][]) => groups.map((g) => g.map((x) => x.name));

describe("isInstallable", () => {
  it.each(["a.apk", "A.APK", "app.apks", "game.xapk", "GAME.XAPK", "we ird.name.apk"])("接受 %s", (name) => {
    expect(isInstallable(name)).toBe(true);
  });

  it.each(["a.txt", "a.zip", "apk", "a.apk.bak", "a.aab", ""])("拒绝 %s", (name) => {
    expect(isInstallable(name)).toBe(false);
  });
});

describe("groupInstall", () => {
  it("每个文件单独一组，保持原顺序", () => {
    const { groups, unsupported } = groupInstall([f("a.apk"), f("b.apks"), f("c.xapk")]);
    expect(names(groups)).toEqual([["a.apk"], ["b.apks"], ["c.xapk"]]);
    expect(unsupported).toEqual([]);
  });

  it("同时选中 base.apk 与 split_*.apk 时合为一组", () => {
    const { groups } = groupInstall([f("split_config.xxhdpi.apk"), f("base.apk"), f("split_config.arm64_v8a.apk")]);
    expect(names(groups)).toEqual([["base.apk", "split_config.xxhdpi.apk", "split_config.arm64_v8a.apk"]]);
  });

  it("分包组之外的文件各自成组，分包组排在 base.apk 的位置", () => {
    const { groups } = groupInstall([f("x.apk"), f("base.apk"), f("y.apk"), f("split_a.apk")]);
    expect(names(groups)).toEqual([["x.apk"], ["base.apk", "split_a.apk"], ["y.apk"]]);
  });

  it("只有 base.apk 时单独安装", () => {
    expect(names(groupInstall([f("base.apk")]).groups)).toEqual([["base.apk"]]);
  });

  it("没有 base.apk 时 split_*.apk 各自成组", () => {
    expect(names(groupInstall([f("split_a.apk"), f("split_b.apk")]).groups)).toEqual([
      ["split_a.apk"],
      ["split_b.apk"],
    ]);
  });

  it("多个 base.apk 时只有第一个与分包成组", () => {
    const { groups } = groupInstall([f("base.apk"), f("split_a.apk"), f("base.apk")]);
    expect(names(groups)).toEqual([["base.apk", "split_a.apk"], ["base.apk"]]);
  });

  it("不支持的文件单独返回，不进入任何组", () => {
    const txt = f("a.txt");
    const { groups, unsupported } = groupInstall([txt, f("b.apk"), f("c.zip")]);
    expect(names(groups)).toEqual([["b.apk"]]);
    expect(unsupported.map((x) => x.name)).toEqual(["a.txt", "c.zip"]);
    expect(unsupported[0]).toBe(txt);
  });

  it("没有任何文件时为空", () => {
    expect(groupInstall([])).toEqual({ groups: [], unsupported: [] });
  });
});
