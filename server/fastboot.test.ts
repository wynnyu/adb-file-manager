import { describe, expect, it } from "vitest";
import { parseFastbootDevices, parseGetvar } from "./fastboot.ts";

describe("parseFastbootDevices", () => {
  it.each([
    ["空输出", "", []],
    ["制表符分隔", "ABC123\tfastboot usb:1-1\n", [{ serial: "ABC123", state: "fastboot" }]],
    ["空格分隔", "ABC123          fastboot usb:1-1\n", [{ serial: "ABC123", state: "fastboot" }]],
    ["不带 -l 的输出", "ABC123\tfastboot\n", [{ serial: "ABC123", state: "fastboot" }]],
    [
      "多台设备和空行",
      "A\tfastboot usb:1-1\n\nB\toffline\n",
      [
        { serial: "A", state: "fastboot" },
        { serial: "B", state: "offline" },
      ],
    ],
  ])("%s", (_name, out, expected) => {
    expect(parseFastbootDevices(out)).toEqual(expected);
  });
});

describe("parseGetvar", () => {
  it.each([
    ["is-userspace: yes\nFinished. Total time: 0.001s\n", "is-userspace", "yes"],
    ["product: husky\nFinished. Total time: 0.002s\n", "product", "husky"],
    ["(bootloader) product: husky\nFinished. Total time: 0.002s\n", "product", "husky"],
    ["\nis-userspace: no\r\n", "is-userspace", "no"],
    ["product: \nFinished.", "product", ""],
    ["getvar:product FAILED (remote: 'unknown command')\n", "product", undefined],
    ["", "product", undefined],
  ])("从 %j 取 %s 得到 %j", (out, key, expected) => {
    expect(parseGetvar(out, key)).toBe(expected);
  });
});
