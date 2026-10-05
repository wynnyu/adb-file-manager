import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type BookmarkFields, imageToIcon, PRESETS, presetFields } from "../../lib/bookmarks.ts";
import { providers, tz } from "../../test/utils.tsx";
import { BookmarkForm } from "./BookmarkForm.tsx";

// 图片解码要用 canvas，jsdom 里换成可控的结果
vi.mock("../../lib/bookmarks.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/bookmarks.ts")>()),
  imageToIcon: vi.fn(),
}));

const TEMPLATES = PRESETS.map(presetFields);
const downloads = TEMPLATES.find((x) => x.preset === "downloads")!;
const PNG = "data:image/png;base64,AAAA";

const blank: BookmarkFields = { name: "", path: "/sdcard/Work", icon: "bookmark", color: "green" };

/** 受控表单：值保存在 state 里，每次变化同时交给 onChange */
function show(initial: BookmarkFields, templates?: BookmarkFields[]) {
  const onChange = vi.fn();
  const onError = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    const nameInput = useRef<HTMLInputElement>(null);
    return (
      <BookmarkForm
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
        templates={templates}
        nameInput={nameInput}
        onError={onError}
      />
    );
  }
  const { container } = render(<Harness />, { wrapper: providers() });
  const upload = (f: File) =>
    act(async () => {
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [f] } });
    });
  return { onChange, onError, upload };
}

const nameInput = () => screen.getByLabelText(tz("bookmark.name")) as HTMLInputElement;
const pathInput = () => screen.getByLabelText(tz("bookmark.path")) as HTMLInputElement;
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");
const lastValue = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.lastCall![0] as BookmarkFields;

describe("BookmarkForm", () => {
  it("编辑名称和路径", () => {
    const { onChange } = show(blank);
    fireEvent.change(nameInput(), { target: { value: "工作" } });
    expect(lastValue(onChange)).toEqual({ ...blank, name: "工作" });
    fireEvent.change(pathInput(), { target: { value: "/sdcard/Work2" } });
    expect(lastValue(onChange)).toEqual({ ...blank, name: "工作", path: "/sdcard/Work2" });
  });

  it("没有模板时不显示从模板添加", () => {
    show(blank);
    expect(screen.queryByText(tz("bookmark.templates"))).toBeNull();
  });

  it("模板列表为空时不显示从模板添加", () => {
    show(blank, []);
    expect(screen.queryByText(tz("bookmark.templates"))).toBeNull();
  });

  it("点模板填入它的内容，名称取当前语言并全选", () => {
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    const { onChange } = show(blank, TEMPLATES);
    fireEvent.click(screen.getByRole("button", { name: tz("quick.downloads") }));
    expect(lastValue(onChange)).toEqual({ ...downloads, name: tz("quick.downloads") });
    expect(nameInput().value).toBe(tz("quick.downloads"));
    expect(document.activeElement).toBe(nameInput());
    expect(raf).toHaveBeenCalled();
    expect(pressed(tz("quick.downloads"))).toBe("true");
  });

  it("新建时改动模板的任一项就不再算作模板", () => {
    const { onChange } = show({ ...downloads, name: tz("quick.downloads") }, TEMPLATES);
    fireEvent.change(pathInput(), { target: { value: "/sdcard/Download/x" } });
    expect(lastValue(onChange).preset).toBeUndefined();
    expect(pressed(tz("quick.downloads"))).toBe("false");
  });

  it("新建时内容改回和模板一致又算作模板，名称前后的空格不计", () => {
    const { onChange } = show(blank, TEMPLATES);
    fireEvent.change(pathInput(), { target: { value: " /sdcard/Download " } });
    fireEvent.click(screen.getByRole("button", { name: "download" }));
    fireEvent.click(screen.getByRole("button", { name: "Blue" }));
    expect(lastValue(onChange).preset).toBeUndefined();
    fireEvent.change(nameInput(), { target: { value: ` ${tz("quick.downloads")}` } });
    expect(lastValue(onChange).preset).toBe("downloads");
  });

  it("编辑已有书签时不提供模板，内置书签的 preset 保持不变", () => {
    const { onChange } = show({ ...downloads, name: tz("quick.downloads") });
    fireEvent.change(pathInput(), { target: { value: "/sdcard/Downloads" } });
    expect(lastValue(onChange).preset).toBe("downloads");
  });

  it("从图标库选图标，当前图标处于按下状态", () => {
    const { onChange } = show(blank);
    expect(pressed("bookmark")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "star" }));
    expect(lastValue(onChange).icon).toBe("star");
    expect(pressed("star")).toBe("true");
    expect(pressed("bookmark")).toBe("false");
  });

  it("选颜色；第一格跟随主色，其余按颜色名称标注", () => {
    const { onChange } = show(blank);
    expect(pressed("Green")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: tz("bookmark.followAccent") }));
    expect(lastValue(onChange).color).toBe("accent");
    fireEvent.click(screen.getByRole("button", { name: "Lavender" }));
    expect(lastValue(onChange).color).toBe("lavender");
    expect(pressed("Lavender")).toBe("true");
  });

  it("上传图片后用作图标，颜色不再可选", async () => {
    vi.mocked(imageToIcon).mockResolvedValueOnce(PNG);
    const { onChange, onError, upload } = show(blank);
    expect(screen.queryByRole("button", { name: tz("bookmark.image") })).toBeNull();

    await upload(new File(["x"], "a.png", { type: "image/png" }));
    expect(onError).toHaveBeenCalledWith(null);
    expect(lastValue(onChange).icon).toBe(PNG);
    expect(pressed(tz("bookmark.image"))).toBe("true");
    const colors = screen.getByText(tz("bookmark.color")).nextElementSibling!;
    expect(colors.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: "Green" }).tabIndex).toBe(-1);
  });

  it("换回图标库图标后，上传的图片仍可再选回来", async () => {
    vi.mocked(imageToIcon).mockResolvedValueOnce(PNG);
    const { onChange, upload } = show(blank);
    await upload(new File(["x"], "a.png", { type: "image/png" }));
    fireEvent.click(screen.getByRole("button", { name: "star" }));
    expect(pressed(tz("bookmark.image"))).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: tz("bookmark.image") }));
    expect(lastValue(onChange).icon).toBe(PNG);
  });

  it("编辑以图片为图标的书签时，图片出现在图标库里", () => {
    show({ ...blank, icon: PNG });
    expect(pressed(tz("bookmark.image"))).toBe("true");
  });

  it("图片无法读取时报错，图标不变", async () => {
    vi.mocked(imageToIcon).mockRejectedValueOnce(new Error("decode failed"));
    const { onChange, onError, upload } = show(blank);
    await upload(new File(["x"], "a.txt", { type: "text/plain" }));
    expect(onError).toHaveBeenCalledWith(tz("bookmark.imageFailed"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("上传图片按钮打开文件选择", () => {
    show(blank);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: tz("bookmark.upload") }));
    expect(click).toHaveBeenCalled();
  });
});
