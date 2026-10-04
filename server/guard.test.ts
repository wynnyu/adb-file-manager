import { describe, expect, it } from "vitest";
import { isProtected } from "./guard.ts";

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
