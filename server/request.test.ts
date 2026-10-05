import { describe, expect, it } from "vitest";
import { AdbError } from "./adb.ts";
import { uploadPathsOf } from "./request.ts";

describe("uploadPathsOf", () => {
  it("缺省时返回空数组", () => {
    expect(uploadPathsOf(undefined)).toEqual([]);
  });

  it("解析 JSON 编码的路径数组", () => {
    expect(uploadPathsOf('["photos/1.jpg","a.txt"]')).toEqual(["photos/1.jpg", "a.txt"]);
  });

  it.each([
    ["不是 JSON", "photos/1.jpg"],
    ["不是数组", '{"0":"a.txt"}'],
    ["元素不是字符串", '["a.txt",1]'],
    ["null", "null"],
  ])("%s时返回 400", (_, raw) => {
    let err: unknown;
    try {
      uploadPathsOf(raw);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(AdbError);
    expect((err as AdbError).status).toBe(400);
  });
});
