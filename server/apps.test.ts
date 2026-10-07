import { describe, expect, it } from "vitest";
import { AdbError } from "./adb.ts";
import {
  assertPackage,
  defaultsCmd,
  installFailure,
  listCmd,
  parseAppDetail,
  parseAppList,
  parseDefaults,
  parsePackageLine,
  pmFailure,
} from "./apps.ts";
import { msg } from "./i18n.ts";

describe("assertPackage", () => {
  it.each(["android", "com.foo_bar.x1", "a.b.c", "Com.Foo"])("接受 %s", (pkg) => {
    expect(assertPackage(pkg)).toBe(pkg);
  });

  it.each([
    ["空串", ""],
    ["数字开头", "1abc"],
    ["段首为数字", "com.1abc"],
    ["含命令注入", "com.a;rm -rf"],
    ["含单引号", "com.a'b"],
    ["含连续的点", "com..a"],
    ["以点结尾", "com.a."],
    ["含空格", "com.a b"],
    ["含连字符", "com.a-b"],
    ["超长", `a.${"b".repeat(255)}`],
    ["非字符串", 42],
    ["缺省", undefined],
  ])("拒绝%s", (_name, pkg) => {
    expect(() => assertPackage(pkg)).toThrow(AdbError);
    try {
      assertPackage(pkg);
    } catch (e) {
      expect((e as AdbError).status).toBe(400);
    }
  });
});

describe("listCmd", () => {
  it("六段以分隔符隔开，且带 -U 的命令失败时降级", () => {
    const cmd = listCmd();
    expect(cmd.split("__ADBFM_SPLIT__")).toHaveLength(6);
    expect(cmd).toContain("pm list packages -f -U -u 2>/dev/null || pm list packages -f -u");
  });

  it("末两段取默认启动器和当前输入法", () => {
    const [, , , , launcher, ime] = listCmd().split("__ADBFM_SPLIT__");
    expect(launcher).toContain(
      "resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME",
    );
    expect(ime).toContain("settings get secure default_input_method");
  });
});

describe("defaultsCmd", () => {
  it("只含启动器和输入法两段", () => {
    expect(defaultsCmd().split("__ADBFM_SPLIT__")).toHaveLength(2);
  });
});

describe("parseDefaults", () => {
  it.each([
    [
      "com.miui.home/.launcher.Launcher\r\n",
      "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME\n",
      "com.miui.home",
      "com.google.android.inputmethod.latin",
    ],
    ["", "null\n", undefined, undefined],
    ["android/com.android.internal.app.ResolverActivity", "", "android", undefined],
    ["No activity found", "null", undefined, undefined],
  ])("解析 %j 和 %j", (launcherOut, imeOut, launcher, ime) => {
    expect(parseDefaults(launcherOut, imeOut)).toEqual({ launcher, ime });
  });

  it("缺省时都为 undefined", () => {
    expect(parseDefaults()).toEqual({ launcher: undefined, ime: undefined });
  });
});

describe("pmFailure", () => {
  it.each([
    ["Failure [DELETE_FAILED_DEVICE_POLICY_MANAGER]", "DELETE_FAILED_DEVICE_POLICY_MANAGER"],
    ["Failure [-1000]\r\n", "-1000"],
    [
      "Error: java.lang.IllegalArgumentException: Unknown package: com.x",
      "java.lang.IllegalArgumentException: Unknown package: com.x",
    ],
    ["Failed", "Failed"],
    ["Package com.x doesn't exist", "Package com.x doesn't exist"],
    ["Unknown package: com.x", "Unknown package: com.x"],
    [
      "java.lang.SecurityException: Shell cannot change component state",
      "java.lang.SecurityException: Shell cannot change component state",
    ],
    ["Package com.x new state: disabled-user\nFailure [BAD]", "BAD"],
  ])("从 %j 找到失败原因", (out, reason) => {
    expect(pmFailure(out)).toBe(reason);
  });

  it.each(["Success", "Package com.x new state: enabled", "Package com.x installed for user: 0", ""])(
    "%j 没有失败迹象",
    (out) => {
      expect(pmFailure(out)).toBeUndefined();
    },
  );
});

describe("installFailure", () => {
  it.each([
    ["adb: failed to install a.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE]", "installDowngrade"],
    [
      "Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.x signatures do not match previously installed version]",
      "installIncompatible",
    ],
    ["Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]", "installNoSpace"],
    ["Failure [INSTALL_FAILED_NO_MATCHING_ABIS: Failed to extract native libraries, res=-113]", "installNoAbi"],
    ["Failure [INSTALL_FAILED_OLDER_SDK]", "installOldSdk"],
    ["Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]", "installRestricted"],
  ] as const)("%s 映射到专门的文案 %s", (message, key) => {
    expect(installFailure(message)).toBe(msg(key));
  });

  it.each([
    ["Failure [INSTALL_FAILED_DUPLICATE_PERMISSION: x]", "INSTALL_FAILED_DUPLICATE_PERMISSION"],
    ["Failure [INSTALL_PARSE_FAILED_NO_CERTIFICATES]", "INSTALL_PARSE_FAILED_NO_CERTIFICATES"],
    ["Failure [INSTALL_FAILED_ABORTED]", "INSTALL_FAILED_ABORTED"],
  ])("%s 带上失败代码", (message, code) => {
    expect(installFailure(message)).toBe(msg("installFailed", { code }));
  });

  it("没有失败代码时带上原文，原文为空时用通用说明", () => {
    expect(installFailure("error: device offline")).toBe(msg("installFailed", { code: "error: device offline" }));
    expect(installFailure("  ")).toBe(msg("installFailed", { code: msg("adbFailed") }));
  });
});

describe("parsePackageLine", () => {
  it.each([
    [
      "package:/data/app/~~x/com.foo-1/base.apk=com.foo uid:10123",
      "com.foo",
      "/data/app/~~x/com.foo-1/base.apk",
      10123,
    ],
    ["package:/system/app/Foo/Foo.apk=com.foo", "com.foo", "/system/app/Foo/Foo.apk", undefined],
    ["package:/data/app/a=b/base.apk=com.foo uid:5", "com.foo", "/data/app/a=b/base.apk", 5],
    ["package:/system/app/Foo/Foo.apk=com.foo uid:1000\r", "com.foo", "/system/app/Foo/Foo.apk", 1000],
  ])("解析 %s", (line, pkg, path, uid) => {
    expect(parsePackageLine(line)).toEqual({ pkg, path, uid });
  });

  it("无法识别的行返回 undefined", () => {
    expect(parsePackageLine("Error: something")).toBeUndefined();
    expect(parsePackageLine("package:com.foo")).toBeUndefined();
  });
});

const SPLIT = "__ADBFM_SPLIT__";
const LIST = [
  "package:/data/app/~~a/com.user.app-1/base.apk=com.user.app uid:10100",
  "package:/system/app/Sys/Sys.apk=com.sys.on uid:1000",
  "package:/system/app/Off/Off.apk=com.sys.off uid:10050",
  "package:/system/app/Gone/Gone.apk=com.sys.gone uid:10051",
  "package:/data/app/~~b/com.a.first-1/base.apk=com.a.first uid:10101",
  SPLIT,
  "package:com.sys.on",
  "package:com.sys.off",
  "package:com.sys.gone",
  SPLIT,
  "package:com.sys.off",
  SPLIT,
  "package:com.user.app",
  "package:com.sys.on",
  "package:com.sys.off",
  "package:com.a.first",
  "",
].join("\r\n");

describe("parseAppList", () => {
  const list = parseAppList(LIST);

  it("按包名排序", () => {
    expect(list.map((a) => a.pkg)).toEqual([
      "com.a.first",
      "com.sys.gone",
      "com.sys.off",
      "com.sys.on",
      "com.user.app",
    ]);
  });

  it("合并系统标记和三种状态", () => {
    expect(list.find((a) => a.pkg === "com.user.app")).toEqual({
      pkg: "com.user.app",
      path: "/data/app/~~a/com.user.app-1/base.apk",
      uid: 10100,
      system: false,
      state: "enabled",
    });
    expect(list.find((a) => a.pkg === "com.sys.on")).toMatchObject({ system: true, state: "enabled" });
    expect(list.find((a) => a.pkg === "com.sys.off")).toMatchObject({ system: true, state: "disabled" });
    expect(list.find((a) => a.pkg === "com.sys.gone")).toMatchObject({ system: true, state: "uninstalled" });
  });

  it("没有 uid 时不带该字段", () => {
    const out = ["package:/system/app/A/A.apk=com.a", SPLIT, SPLIT, SPLIT, "package:com.a"].join("\n");
    expect(parseAppList(out)).toEqual([{ pkg: "com.a", path: "/system/app/A/A.apk", system: false, state: "enabled" }]);
  });

  it("按静态表、默认启动器和输入法标出关键包", () => {
    const out = [
      [
        "package:/system/app/A/A.apk=android",
        "package:/system/priv-app/UI/UI.apk=com.android.systemui",
        "package:/system/app/H/H.apk=com.miui.home",
        "package:/system/app/K/K.apk=com.google.android.inputmethod.latin",
        "package:/data/app/b/base.apk=com.user.app",
      ].join("\n"),
      "",
      "",
      "package:android",
      "com.miui.home/.launcher.Launcher",
      "com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME",
    ].join(`\n${SPLIT}\n`);
    const critical = Object.fromEntries(parseAppList(out).map((a) => [a.pkg, a.critical]));
    expect(critical).toEqual({
      android: "core",
      "com.android.systemui": "systemui",
      "com.miui.home": "launcher",
      "com.google.android.inputmethod.latin": "ime",
      "com.user.app": undefined,
    });
    expect(parseAppList(out).find((a) => a.pkg === "com.user.app")).not.toHaveProperty("critical");
  });

  it("已安装集合为空时不把应用标成已卸载", () => {
    const out = ["package:/system/app/A/A.apk=com.a", SPLIT, SPLIT, SPLIT, ""].join("\n");
    expect(parseAppList(out)[0].state).toBe("enabled");
  });
});

const PKG = "com.example.app";

const ANDROID13 = `
Activity Resolver Table:
  Non-Data Actions:
      android.intent.action.MAIN:
        1234 ${PKG}/.Main filter 5678

Packages:
  Package [com.other.app] (1111):
    userId=10001
    versionName=9.9
  Package [${PKG}] (abc123):
    userId=10150
    pkg=Package{def ${PKG}}
    codePath=/data/app/~~xyz/${PKG}-uvw
    resourcePath=/data/app/~~xyz/${PKG}-uvw
    primaryCpuAbi=arm64-v8a
    secondaryCpuAbi=null
    versionCode=123 minSdk=24 targetSdk=33
    versionName=1.2.3
    splits=[base]
    flags=[ SYSTEM HAS_CODE ]
    dataDir=/data/user/0/${PKG}
    timeStamp=2023-01-01 10:00:00
    lastUpdateTime=2023-02-01 11:22:33
    firstInstallTime=2023-01-01 10:00:00
    installerPackageName=null
    installPermissionsFixed=true
    pkgFlags=[ SYSTEM HAS_CODE ALLOW_CLEAR_USER_DATA ]
    requested permissions:
      android.permission.INTERNET
      android.permission.CAMERA
      android.permission.READ_CONTACTS: restricted=true
      android.permission.CUSTOM_ONLY
    install permissions:
      android.permission.INTERNET: granted=true
      android.permission.WAKE_LOCK: granted=true
    User 0: ceDataInode=1234 installed=true hidden=false suspended=false
      gids=[3003]
      runtime permissions:
        android.permission.CAMERA: granted=true, flags=[ USER_SET ]
        android.permission.READ_CONTACTS: granted=false, flags=[ ]
  Package [com.later.app] (2222):
    userId=10002

Hidden system packages:
  Package [${PKG}] (hidden):
    userId=10150
    versionName=1.0.0
`;

describe("parseAppDetail", () => {
  it("解析 Android 13 风格的输出", () => {
    expect(parseAppDetail(ANDROID13, PKG)).toEqual({
      pkg: PKG,
      versionName: "1.2.3",
      versionCode: 123,
      minSdk: 24,
      targetSdk: 33,
      firstInstall: "2023-01-01 10:00:00",
      lastUpdate: "2023-02-01 11:22:33",
      codePath: `/data/app/~~xyz/${PKG}-uvw`,
      dataDir: `/data/user/0/${PKG}`,
      abi: "arm64-v8a",
      uid: 10150,
      flags: ["SYSTEM", "HAS_CODE", "ALLOW_CLEAR_USER_DATA"],
      updatedSystem: true,
      permissions: [
        { name: "android.permission.INTERNET", runtime: false, granted: true },
        { name: "android.permission.CAMERA", runtime: true, granted: true },
        { name: "android.permission.READ_CONTACTS", runtime: true, granted: false },
        { name: "android.permission.CUSTOM_ONLY", runtime: false },
        { name: "android.permission.WAKE_LOCK", runtime: false, granted: true },
      ],
    });
  });

  it("installer 不为 null 时返回包名", () => {
    const out = ANDROID13.replace("installerPackageName=null", "installerPackageName=com.android.vending");
    expect(parseAppDetail(out, PKG).installer).toBe("com.android.vending");
  });

  it("不在 Hidden system packages 中时 updatedSystem 为 false", () => {
    const out = ANDROID13.slice(0, ANDROID13.indexOf("Hidden system packages:"));
    expect(parseAppDetail(out, PKG).updatedSystem).toBe(false);
  });

  it("解析老格式：grantedPermissions，无 minSdk，CRLF", () => {
    const old = [
      "Packages:",
      `  Package [${PKG}] (1):`,
      "    userId=10050",
      "    codePath=/data/app/com.example.app-1",
      "    versionCode=21 targetSdk=21",
      "    versionName=0.9",
      "    pkgFlags=[ HAS_CODE ]",
      "    installerPackageName=com.android.vending",
      "    requested permissions:",
      "      android.permission.INTERNET",
      "      android.permission.VIBRATE",
      "    grantedPermissions:",
      "      android.permission.INTERNET",
      "",
    ].join("\r\n");
    const d = parseAppDetail(old, PKG);
    expect(d).toMatchObject({ versionCode: 21, targetSdk: 21, uid: 10050, installer: "com.android.vending" });
    expect(d.minSdk).toBeUndefined();
    expect(d.updatedSystem).toBe(false);
    expect(d.permissions).toEqual([
      { name: "android.permission.INTERNET", runtime: false, granted: true },
      { name: "android.permission.VIBRATE", runtime: false },
    ]);
  });

  it("找不到包时抛出 404", () => {
    expect(() => parseAppDetail(ANDROID13, "com.missing")).toThrow(AdbError);
    try {
      parseAppDetail("Unable to find package: com.missing\n", "com.missing");
    } catch (e) {
      expect((e as AdbError).status).toBe(404);
    }
  });

  it("包名只是另一个包名的前缀时不会误匹配", () => {
    expect(() => parseAppDetail(ANDROID13, "com.example")).toThrow(AdbError);
  });
});
