import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import { type DialogMessage, DialogMessageBody } from "./DialogMessage.tsx";

const show = (message: DialogMessage) => render(<DialogMessageBody message={message} />, { wrapper: providers() });

describe("DialogMessageBody", () => {
  it("字符串原样显示", () => {
    const { container } = show("将永久删除，无法恢复。");
    expect(container.textContent).toBe("将永久删除，无法恢复。");
  });

  it("删除书签：内置书签提示可以从模板加回来，并显示路径", () => {
    show({ kind: "bookmarkDelete", preset: true, path: "/sdcard/DCIM" });
    expect(screen.getByText(tz("bookmark.deletePresetMessage"))).toBeTruthy();
    expect(screen.getByText("/sdcard/DCIM")).toBeTruthy();
  });

  it("删除自建书签用普通提示", () => {
    show({ kind: "bookmarkDelete", preset: false, path: "/x" });
    expect(screen.getByText(tz("bookmark.deleteMessage"))).toBeTruthy();
  });

  it("root 删除最多列出 4 个路径，其余合并成一行", () => {
    const paths = ["/a", "/b", "/c", "/d", "/e", "/f"];
    show({ kind: "rootDelete", paths });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toEqual(["/a", "/b", "/c", "/d", tz("common.moreItems", { n: 2 })]);
  });

  it("文案里的标记渲染成元素，不显示尖括号", () => {
    const { container } = show({ kind: "rootEnable" });
    expect(container.querySelector("code")).toBeTruthy();
    expect(container.textContent).not.toMatch(/<\/?code>/);
  });
});
