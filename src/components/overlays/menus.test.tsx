import { describe, expect, it, vi } from "vitest";
import type { Bookmark } from "../../lib/bookmarks.ts";
import { file, folder, tz } from "../../test/utils.tsx";
import type { MenuItem } from "./ContextMenu.tsx";
import { backgroundMenu, bookmarkMenu, itemMenu, type MenuActions } from "./menus.tsx";

function actions(patch: Partial<MenuActions> = {}): MenuActions {
  return {
    t: tz,
    path: "/sdcard",
    view: "list",
    showHidden: false,
    canPaste: false,
    clipCount: 0,
    selectable: [file("/sdcard/a.txt")],
    navigate: vi.fn(),
    open: vi.fn(),
    paste: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
    toClip: vi.fn(),
    copyText: vi.fn(),
    askRename: vi.fn(),
    askDelete: vi.fn(),
    askMkdir: vi.fn(),
    pickUpload: vi.fn(),
    selectAll: vi.fn(),
    reload: vi.fn(async () => {}),
    toggleHidden: vi.fn(),
    setView: vi.fn(),
    askBookmark: vi.fn(),
    askDeleteBookmark: vi.fn(),
    ...patch,
  };
}

type Item = Exclude<MenuItem, "sep">;
/** 菜单的文字轮廓，分隔线写成 --- */
const labels = (items: MenuItem[]) => items.map((i) => (i === "sep" ? "---" : i.label));
const find = (items: MenuItem[], label: string) => items.find((i): i is Item => i !== "sep" && i.label === label)!;

const dir = folder("/sdcard/DCIM");
const a = file("/sdcard/a.txt");
const b = file("/sdcard/b.txt");

describe("itemMenu", () => {
  it("单个文件夹：打开、可粘贴时粘贴到其中，以及重命名", () => {
    const act = actions({ canPaste: true });
    const items = itemMenu([dir], act);
    expect(labels(items)).toEqual([
      tz("menu.open"),
      tz("menu.pasteInto", { name: "DCIM" }),
      tz("menu.download"),
      "---",
      tz("menu.cut"),
      tz("menu.copy"),
      tz("menu.copyPath"),
      "---",
      tz("menu.rename"),
      tz("menu.delete"),
    ]);
    find(items, tz("menu.open")).onSelect();
    expect(act.navigate).toHaveBeenCalledWith(dir.path);
    expect(act.open).not.toHaveBeenCalled();
    find(items, tz("menu.pasteInto", { name: "DCIM" })).onSelect();
    expect(act.paste).toHaveBeenCalledWith(dir.path);
  });

  it("单个文件：首项为打开，回车是打开而不是下载", () => {
    const act = actions({ canPaste: true });
    const items = itemMenu([a], act);
    expect(labels(items)[0]).toBe(tz("menu.open"));
    expect(find(items, tz("menu.open")).shortcut).toEqual(["enter"]);
    expect(find(items, tz("menu.download")).shortcut).toBeUndefined();
    find(items, tz("menu.open")).onSelect();
    expect(act.open).toHaveBeenCalledWith(a);
    expect(act.navigate).not.toHaveBeenCalled();
  });

  it("指向文件的符号链接同样可以打开", () => {
    const link = file("/sdcard/link", { type: "link" });
    const act = actions();
    find(itemMenu([link], act), tz("menu.open")).onSelect();
    expect(act.open).toHaveBeenCalledWith(link);
  });

  it("多项：标明数量，没有打开和重命名，操作作用于全部", () => {
    const act = actions();
    const items = itemMenu([a, b], act);
    expect(labels(items)).not.toContain(tz("menu.open"));
    expect(labels(items)).not.toContain(tz("menu.rename"));
    find(items, tz("menu.downloadMany", { n: 2 })).onSelect();
    expect(act.download).toHaveBeenCalledWith([a, b]);
    find(items, tz("menu.cut")).onSelect();
    expect(act.toClip).toHaveBeenCalledWith("cut", [a, b]);
    find(items, tz("menu.copyPath")).onSelect();
    expect(act.copyText).toHaveBeenCalledWith("/sdcard/a.txt\n/sdcard/b.txt");
    const del = find(items, tz("menu.deleteMany", { n: 2 }));
    expect(del.danger).toBe(true);
    del.onSelect();
    expect(act.askDelete).toHaveBeenCalledWith([a, b]);
  });
});

describe("backgroundMenu", () => {
  it("不能粘贴时粘贴项不可用", () => {
    const items = backgroundMenu("/sdcard", actions());
    expect(find(items, tz("menu.paste")).disabled).toBe(true);
  });

  it("剪贴板里有多项时写明数量，粘贴到所点的目录", () => {
    const act = actions({ canPaste: true, clipCount: 3 });
    const items = backgroundMenu("/sdcard/Download", act);
    const paste = find(items, tz("menu.pasteN", { n: 3 }));
    expect(paste.disabled).toBe(false);
    paste.onSelect();
    expect(act.paste).toHaveBeenCalledWith("/sdcard/Download");
  });

  it("新建文件夹和上传作用于所点的目录", () => {
    const act = actions();
    const items = backgroundMenu("/sdcard/Music", act);
    find(items, tz("menu.newFolder")).onSelect();
    find(items, tz("menu.uploadFolder")).onSelect();
    expect(act.askMkdir).toHaveBeenCalledWith("/sdcard/Music");
    expect(act.pickUpload).toHaveBeenCalledWith("folder", "/sdcard/Music");
  });

  it("只有当前目录有“全选”，没有条目时不可用", () => {
    expect(labels(backgroundMenu("/", actions()))).not.toContain(tz("menu.selectAll"));
    const empty = backgroundMenu("/sdcard", actions({ selectable: [] }));
    expect(find(empty, tz("menu.selectAll")).disabled).toBe(true);
  });

  it("显示隐藏文件和视图是开关项，标出当前状态", () => {
    const act = actions({ showHidden: true, view: "columns" });
    const items = backgroundMenu("/sdcard", act);
    expect(find(items, tz("menu.showHidden")).checked).toBe(true);
    const checked = items.filter((i): i is Item => i !== "sep" && !!i.checked);
    expect(checked.map((i) => i.label)).toEqual([tz("menu.showHidden"), tz("view.columns")]);
    find(items, tz("view.icons")).onSelect();
    expect(act.setView).toHaveBeenCalledWith("icons");
  });
});

describe("bookmarkMenu", () => {
  const bm: Bookmark = { id: "x", name: "Telegram", path: "/sdcard/Telegram", icon: "bookmark", color: "blue" };

  it("打开、拷贝路径、编辑和删除书签", () => {
    const act = actions();
    const items = bookmarkMenu(bm, act);
    find(items, tz("menu.open")).onSelect();
    find(items, tz("menu.copyPath")).onSelect();
    find(items, tz("bookmark.edit")).onSelect();
    find(items, tz("bookmark.delete")).onSelect();
    expect(act.navigate).toHaveBeenCalledWith(bm.path);
    expect(act.copyText).toHaveBeenCalledWith(bm.path);
    expect(act.askBookmark).toHaveBeenCalledWith(bm);
    expect(act.askDeleteBookmark).toHaveBeenCalledWith(bm);
    expect(find(items, tz("bookmark.delete")).danger).toBe(true);
  });
});
