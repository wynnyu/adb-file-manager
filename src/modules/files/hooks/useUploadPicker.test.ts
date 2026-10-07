import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { useUploadPicker } from "./useUploadPicker.ts";

const txt = new File(["x"], "a.txt");

describe("useUploadPicker", () => {
  function setup() {
    const upload = vi.fn(async () => {});
    const hook = renderHook(() => useUploadPicker(upload));
    const files = document.createElement("input");
    const folder = document.createElement("input");
    const clicks = { files: vi.spyOn(files, "click"), folder: vi.spyOn(folder, "click") };
    hook.result.current.inputs.filesRef.current = files;
    hook.result.current.inputs.folderRef.current = folder;
    const change = (list: File[]) => {
      const target = { files: list, value: "C:\\fakepath\\a.txt" };
      act(() => hook.result.current.inputs.onChange({ target } as unknown as ChangeEvent<HTMLInputElement>));
      return target;
    };
    return { ...hook, upload, clicks, change };
  }

  it("pick 打开对应的选择框", () => {
    const { result, clicks } = setup();
    result.current.pick("folder", null);
    expect(clicks.folder).toHaveBeenCalled();
    result.current.pick("files", null);
    expect(clicks.files).toHaveBeenCalled();
  });

  it("选好文件后上传到指定目录，然后清空选择框，下次默认上传到当前目录", () => {
    const { result, upload, change } = setup();
    result.current.pick("files", "/sdcard/Download");
    const target = change([txt]);
    expect(upload).toHaveBeenLastCalledWith([{ file: txt, path: "a.txt" }], "/sdcard/Download");
    expect(target.value).toBe("");

    result.current.pick("files", null);
    change([txt]);
    expect(upload).toHaveBeenLastCalledWith([{ file: txt, path: "a.txt" }], undefined);
  });

  it("重新渲染后返回的回调保持不变", () => {
    const { result, rerender } = setup();
    const before = result.current;
    rerender();
    expect(result.current.pick).toBe(before.pick);
    expect(result.current.inputs).toBe(before.inputs);
  });
});
