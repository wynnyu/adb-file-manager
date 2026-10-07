import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DialogState } from "../../../components/overlays/index.ts";
import { loadPref } from "../../../lib/index.ts";
import { providers, tz } from "../../../test/utils.tsx";
import { type Bookmark, PRESETS } from "../lib/index.ts";
import { useBookmarks } from "./useBookmarks.ts";

type BookmarkDialog = Extract<DialogState, { kind: "bookmark" }>;
type ConfirmDialog = Extract<DialogState, { kind: "confirm" }>;

function setup(path = "/sdcard/Download/Telegram") {
  const openDialog = vi.fn<(d: DialogState) => void>();
  const hook = renderHook((p: { path: string }) => useBookmarks(p.path, openDialog), {
    initialProps: { path },
    wrapper: providers(),
  });
  const dialog = <D extends DialogState>() => openDialog.mock.lastCall![0] as D;
  return { ...hook, openDialog, dialog };
}

const ids = (list: Bookmark[]) => list.map((b) => b.id);
const stored = () => loadPref<{ items: Bookmark[] }>("afm.bookmarks", { items: [] }).items;

describe("useBookmarks", () => {
  it("初次使用时是全部内置书签", () => {
    const { result } = setup();
    expect(ids(result.current.bookmarks)).toEqual(PRESETS.map((p) => p.preset));
    expect(stored()).toHaveLength(PRESETS.length);
  });

  it("新建书签：默认名称和路径取当前目录，路径去掉末尾的 /", async () => {
    const { result, dialog } = setup();
    act(() => result.current.askBookmark());
    const d = dialog<BookmarkDialog>();
    expect(d.title).toBe(tz("bookmark.new"));
    expect(d.initial).toMatchObject({ name: "Telegram", path: "/sdcard/Download/Telegram", icon: "bookmark" });
    // 内置书签都在，没有可添加回来的模板
    expect(d.templates).toEqual([]);

    await act(() => d.onSubmit({ ...d.initial, path: "/sdcard/Download/Telegram/" }));
    const added = result.current.bookmarks.at(-1)!;
    expect(added).toMatchObject({ name: "Telegram", path: "/sdcard/Download/Telegram" });
    expect(stored().at(-1)).toEqual(added);
  });

  it("在根目录新建时名称为“根目录”", () => {
    const { result, dialog } = setup("/");
    act(() => result.current.askBookmark());
    expect(dialog<BookmarkDialog>().initial.name).toBe(tz("crumbs.root"));
  });

  it("路径不是绝对路径时报错", async () => {
    const { result, dialog } = setup();
    act(() => result.current.askBookmark());
    const d = dialog<BookmarkDialog>();
    await expect(d.onSubmit({ ...d.initial, path: "sdcard" })).rejects.toThrow(tz("bookmark.badPath"));
    expect(result.current.bookmarks).toHaveLength(PRESETS.length);
  });

  it("编辑书签只改动这一项；内置书签的名称和默认名称相同时存为空", async () => {
    const { result, dialog } = setup();
    const camera = result.current.bookmarks.find((b) => b.preset === "camera")!;
    act(() => result.current.askBookmark(camera));
    const d = dialog<BookmarkDialog>();
    expect(d.title).toBe(tz("bookmark.edit"));
    expect(d.templates).toBeUndefined();
    expect(d.initial.name).toBe(tz("quick.camera"));

    await act(() => d.onSubmit({ ...d.initial, color: "green" }));
    const edited = result.current.bookmarks.find((b) => b.id === camera.id)!;
    expect(edited).toMatchObject({ name: "", color: "green", path: camera.path });

    act(() => result.current.askBookmark(edited));
    await act(() => dialog<BookmarkDialog>().onSubmit({ ...dialog<BookmarkDialog>().initial, name: "相册" }));
    expect(result.current.bookmarks.find((b) => b.id === camera.id)!.name).toBe("相册");
  });

  it("删除书签后可以从模板加回原来的位置", async () => {
    const { result, dialog } = setup();
    const camera = result.current.bookmarks.find((b) => b.preset === "camera")!;
    act(() => result.current.askDeleteBookmark(camera));
    const del = dialog<ConfirmDialog>();
    expect(del).toMatchObject({ kind: "confirm", tone: "danger" });
    expect(del.title).toBe(tz("bookmark.deleteTitle", { name: tz("quick.camera") }));
    await act(() => del.onSubmit(false));
    expect(ids(result.current.bookmarks)).not.toContain("camera");

    act(() => result.current.askBookmark());
    const add = dialog<BookmarkDialog>();
    expect(add.templates).toEqual([expect.objectContaining({ preset: "camera", name: "" })]);
    await act(() => add.onSubmit(add.templates![0]));
    expect(result.current.bookmarks.map((b) => b.preset)).toEqual(PRESETS.map((p) => p.preset));
  });
});
