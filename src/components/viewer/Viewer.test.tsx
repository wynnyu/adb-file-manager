import { tags } from "@lezer/highlight";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaPlayer } from "../../hooks/useMediaPlayer.ts";
import { api } from "../../lib/api.ts";
import { codeHighlight } from "../../lib/code.ts";
import { file, newQueryClient, providers, tz } from "../../test/utils.tsx";
import type { TextPreview } from "../../types.ts";
import { Viewer } from "./Viewer.tsx";

const target = { serial: "R5CT", root: false };
const txt = file("/sdcard/log.txt", { size: 2048 });
const png = file("/sdcard/a.png", { size: 10 });

type Props = Omit<ComponentProps<typeof Viewer>, "media">;

/** 同 App：播放状态由外层的 useMediaPlayer 提供 */
function Harness(props: Props) {
  const media = useMediaPlayer(props.entry.path);
  return <Viewer {...props} media={media} />;
}

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    target,
    entry: txt,
    index: 1,
    count: 3,
    hasPrev: true,
    hasNext: true,
    onStep: vi.fn(),
    onClose: vi.fn(),
    onDownload: vi.fn(),
    ...patch,
  };
  const view = render(<Harness {...props} />, { wrapper: providers(newQueryClient()) });
  return { props, ...view };
}

const text = (data: TextPreview) => vi.spyOn(api, "text").mockResolvedValue(data);
const button = (name: string) => screen.getByRole("button", { name });

describe("Viewer", () => {
  it("标题栏显示文件名、位置和大小", () => {
    text({ kind: "text", text: "hi", truncated: false, limit: 1024 });
    show();
    expect(screen.getByRole("dialog", { name: txt.name })).toBeTruthy();
    expect(screen.getByText(tz("viewer.position", { i: 2, n: 3 }))).toBeTruthy();
    expect(screen.getByText("2.0 KB")).toBeTruthy();
  });

  it("Esc 关闭，右方向键切到下一个，左方向键切到上一个", () => {
    text({ kind: "text", text: "hi", truncated: false, limit: 1024 });
    const { props } = show();
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(props.onStep).toHaveBeenLastCalledWith(1);
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(props.onStep).toHaveBeenLastCalledWith(-1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("到两端时方向键不切换，按钮不可用", () => {
    text({ kind: "text", text: "hi", truncated: false, limit: 1024 });
    const { props } = show({ hasNext: false, hasPrev: false });
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    fireEvent.keyDown(document.body, { key: "ArrowLeft" });
    expect(props.onStep).not.toHaveBeenCalled();
    expect(button(tz("viewer.next"))).toHaveProperty("disabled", true);
    expect(button(tz("viewer.prev"))).toHaveProperty("disabled", true);
  });

  it("焦点在滑块上时方向键交给滑块", () => {
    text({ kind: "text", text: "hi", truncated: false, limit: 1024 });
    const { props } = show();
    const slider = document.createElement("input");
    slider.type = "range";
    document.body.append(slider);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(props.onStep).not.toHaveBeenCalled();
    slider.remove();
  });

  it("标题栏的下载按钮下载当前文件", () => {
    text({ kind: "text", text: "hi", truncated: false, limit: 1024 });
    const { props } = show();
    fireEvent.click(button(tz("files.download")));
    expect(props.onDownload).toHaveBeenCalledWith(txt);
  });
});

describe("TextViewer", () => {
  it("显示文本内容", async () => {
    const spy = text({ kind: "text", text: "ro.build.type=user", truncated: false, limit: 1024 });
    show();
    expect(await screen.findByText("ro.build.type=user")).toBeTruthy();
    expect(spy).toHaveBeenCalledWith(target, txt.path);
    expect(screen.queryByText(tz("viewer.truncated", { size: "1.0 MB" }))).toBeNull();
  });

  it("默认自动换行，可关闭，设置会被记住", async () => {
    text({ kind: "text", text: "a long line", truncated: false, limit: 1024 });
    const first = show();
    const content = await screen.findByRole("textbox", { name: txt.name });
    expect(content.classList.contains("cm-lineWrapping")).toBe(true);
    expect(button(tz("viewer.wrap")).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button(tz("viewer.wrap")));
    expect(button(tz("viewer.wrap")).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("textbox", { name: txt.name }).classList.contains("cm-lineWrapping")).toBe(false);

    first.unmount();
    show();
    expect((await screen.findByRole("textbox", { name: txt.name })).classList.contains("cm-lineWrapping")).toBe(false);
    expect(button(tz("viewer.wrap")).getAttribute("aria-pressed")).toBe("false");
  });

  it("内容区只读", async () => {
    text({ kind: "text", text: "a long line", truncated: false, limit: 1024 });
    show();
    const content = await screen.findByRole("textbox", { name: txt.name });
    expect(content.getAttribute("aria-readonly")).toBe("true");
  });

  it("Ctrl+F 打开搜索面板，Esc 先关闭面板，再关闭查看器", async () => {
    text({ kind: "text", text: "a long line", truncated: false, limit: 1024 });
    const { props } = show();
    const content = await screen.findByRole("textbox", { name: txt.name });
    fireEvent.keyDown(content, { key: "f", ctrlKey: true });
    const input = await screen.findByRole("textbox", { name: tz("viewer.find") });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: tz("viewer.find") })).toBeNull();
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(content, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("截断时提示只显示了开头", async () => {
    text({ kind: "text", text: "line", truncated: true, limit: 1024 * 1024 });
    show();
    expect(await screen.findByText(tz("viewer.truncated", { size: "1.0 MB" }))).toBeTruthy();
  });

  it("二进制文件提示不支持预览，可以下载", async () => {
    text({ kind: "binary" });
    const { props } = show();
    expect(await screen.findByText(tz("viewer.unsupported"))).toBeTruthy();
    const downloads = screen.getAllByRole("button", { name: tz("files.download") });
    fireEvent.click(downloads[downloads.length - 1]);
    expect(props.onDownload).toHaveBeenCalledWith(txt);
  });

  it("空文件显示“空文件”", async () => {
    text({ kind: "text", text: "", truncated: false, limit: 1024 });
    show();
    expect(await screen.findByText(tz("viewer.empty"))).toBeTruthy();
  });

  it("读取失败时显示错误信息", async () => {
    vi.spyOn(api, "text").mockRejectedValue(new Error("无读取权限：/data/x"));
    show();
    expect(await screen.findByText("无读取权限：/data/x")).toBeTruthy();
  });
});

describe("MarkdownView", () => {
  const md = file("/sdcard/docs/README.md", { size: 100 });
  const markdown = (source: string) => text({ kind: "text", text: source, truncated: false, limit: 1024 });
  const showMd = () => show({ entry: md });

  it("默认显示预览，可切回源码，设置会被记住", async () => {
    markdown("# Title\n\nbody");
    const first = showMd();
    expect(await screen.findByRole("heading", { level: 1, name: "Title" })).toBeTruthy();
    expect(screen.getByRole("article", { name: md.name })).toBeTruthy();
    expect(button(tz("viewer.markdownPreview")).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button(tz("viewer.markdownPreview")));
    expect(await screen.findByRole("textbox", { name: md.name })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(button(tz("viewer.markdownPreview")).getAttribute("aria-pressed")).toBe("false");

    first.unmount();
    showMd();
    expect(await screen.findByRole("textbox", { name: md.name })).toBeTruthy();
  });

  it("非 Markdown 文件没有预览按钮", async () => {
    text({ kind: "text", text: "# not markdown", truncated: false, limit: 1024 });
    show();
    expect(await screen.findByRole("textbox", { name: txt.name })).toBeTruthy();
    expect(screen.queryByRole("button", { name: tz("viewer.markdownPreview") })).toBeNull();
  });

  it("渲染 GFM：表格、任务列表、删除线、脚注", async () => {
    markdown(
      [
        "| a | b |",
        "|:-:|--:|",
        "| 1 | 2 |",
        "",
        "- [x] done",
        "- [ ] todo",
        "",
        "~~gone~~",
        "",
        "note[^1]",
        "",
        "[^1]: the footnote",
      ].join("\n"),
    );
    showMd();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("cell", { name: "1" }).style.textAlign).toBe("center");
    expect(screen.getByRole("cell", { name: "2" }).style.textAlign).toBe("right");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.map((b) => b.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(screen.getByRole("deletion").textContent).toBe("gone");
    const back = screen.getByRole("link", { name: tz("viewer.footnoteBack") });
    expect(back.textContent).toBe("");
    expect(screen.getByText(tz("viewer.footnotes")).className).toBe("sr-only");
  });

  it("净化原始 HTML", async () => {
    markdown(
      [
        "<details><summary>Sum</summary>inside</details>",
        "",
        "<script>alert(1)</script>",
        "",
        '<img src="https://e.com/a.png" alt="pic" onerror="alert(2)">',
        "",
        "[bad](javascript:alert(3))",
        "",
        '<p align="center">centered</p>',
      ].join("\n"),
    );
    showMd();
    const summary = await screen.findByText("Sum");
    expect(summary.closest("details")).toBeTruthy();
    const article = screen.getByRole("article");
    expect(article.querySelector("script")).toBeNull();
    expect(article.textContent).not.toContain("alert(1)");
    expect(screen.getByRole("img", { name: "pic" }).hasAttribute("onerror")).toBe(false);
    expect(screen.getByText("bad")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.getByText("centered").getAttribute("align")).toBe("center");
  });

  it("外部链接在新标签页打开，相对链接不可点击并提示设备路径", async () => {
    markdown("[site](https://example.com) and [next](../notes/b.md?x=1)");
    showMd();
    const site = await screen.findByRole("link", { name: "site" });
    expect(site.getAttribute("target")).toBe("_blank");
    expect(site.getAttribute("rel")).toBe("noreferrer");
    expect(screen.queryByRole("link", { name: "next" })).toBeNull();
    expect(screen.getByText("next").getAttribute("title")).toBe("/sdcard/notes/b.md");
  });

  it("相对路径的图片按 md 所在目录从设备读取", async () => {
    markdown("![logo](img/a.png) ![remote](https://e.com/b.png)");
    showMd();
    expect((await screen.findByRole("img", { name: "logo" })).getAttribute("src")).toBe(
      api.previewUrl(target, "/sdcard/docs/img/a.png"),
    );
    expect(screen.getByRole("img", { name: "remote" }).getAttribute("src")).toBe("https://e.com/b.png");
  });

  describe("代码块", () => {
    const code = "```js\nconst a = 1;\n```";

    it("按语言高亮，配色与源码视图一致", async () => {
      markdown(code);
      showMd();
      const keyword = await screen.findByText("const");
      await waitFor(() => expect(keyword.className).toBe(codeHighlight.style([tags.keyword])));
      expect(screen.getByText("js")).toBeTruthy();
    });

    it("点击拷贝按钮写入剪贴板，随后显示已拷贝", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
      markdown(code);
      showMd();
      fireEvent.click(await screen.findByRole("button", { name: tz("viewer.copyCode") }));
      expect(writeText).toHaveBeenCalledWith("const a = 1;");
      expect(await screen.findByRole("button", { name: tz("viewer.copied") })).toBeTruthy();
    });

    it("自动换行开关对代码块生效", async () => {
      markdown(code);
      showMd();
      const pre = (await screen.findByText("const")).closest("pre");
      expect(pre?.classList.contains("whitespace-pre-wrap")).toBe(true);
      fireEvent.click(button(tz("viewer.wrap")));
      expect(pre?.classList.contains("whitespace-pre-wrap")).toBe(false);
      expect(pre?.classList.contains("whitespace-pre")).toBe(true);
    });
  });

  it("点击目录链接和脚注链接滚动到对应位置", async () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    markdown(["[go](#usage-guide)", "", "## Usage Guide", "", "note[^1]", "", "[^1]: the footnote"].join("\n"));
    showMd();
    fireEvent.click(await screen.findByRole("link", { name: "go" }));
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(screen.getByRole("heading", { name: "Usage Guide" }));

    fireEvent.click(screen.getByRole("link", { name: "1" }));
    expect(scroll).toHaveBeenCalledTimes(2);
    expect((scroll.mock.contexts[1] as HTMLElement).id).toBe("user-content-fn-1");
  });
});

describe("ImageViewer", () => {
  /** 缩放百分比 */
  const zoom = () => screen.getByText(/^\d+%$/).textContent;

  function showImage() {
    const view = show({ entry: png });
    const img = screen.getByRole("img", { name: png.name });
    fireEvent.load(img);
    return { ...view, box: img.parentElement as HTMLElement };
  }

  it("Ctrl+滚轮改变缩放，普通滚轮不改变", () => {
    const { box } = showImage();
    expect(zoom()).toBe("100%");
    fireEvent.wheel(box, { deltaY: 30, clientX: 0, clientY: 0 });
    expect(zoom()).toBe("100%");
    act(() => void fireEvent.wheel(box, { deltaY: -100, ctrlKey: true, clientX: 0, clientY: 0 }));
    expect(zoom()).toBe("141%");
  });

  it("Ctrl+滚轮阻止浏览器缩放整个页面", () => {
    const { box } = showImage();
    expect(fireEvent.wheel(box, { deltaY: -100, ctrlKey: true })).toBe(false);
  });

  it("缩放后可以恢复到适合窗口", () => {
    const { box } = showImage();
    const reset = button(tz("viewer.zoomReset"));
    expect(reset).toHaveProperty("disabled", true);
    fireEvent.wheel(box, { deltaY: 100, ctrlKey: true });
    expect(zoom()).toBe("71%");
    fireEvent.click(reset);
    expect(zoom()).toBe("100%");
  });

  it("浏览器无法解码时提示并提供下载", () => {
    show({ entry: png });
    fireEvent.error(screen.getByRole("img", { name: png.name }));
    expect(screen.getByText(tz("viewer.cannotShow"))).toBeTruthy();
  });
});

describe("VideoPlayer", () => {
  it("自绘控制条，浏览器无法播放时提示", () => {
    show({ entry: file("/sdcard/a.mkv") });
    expect(button(tz("viewer.play"))).toBeTruthy();
    expect(screen.getByRole("slider", { name: tz("viewer.seek") })).toBeTruthy();
    expect(button(tz("viewer.fullscreen"))).toBeTruthy();
    const video = document.querySelector("video");
    expect(video?.controls).toBe(false);
    fireEvent.error(video as HTMLVideoElement);
    expect(screen.getByText(tz("viewer.cannotPlay"))).toBeTruthy();
  });

  it("空格播放或暂停", () => {
    // jsdom 没有实现播放
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    show({ entry: file("/sdcard/a.mp4") });
    fireEvent.keyDown(document.body, { key: " " });
    expect(play).toHaveBeenCalledOnce();
  });

  describe("F 切换全屏", () => {
    // jsdom 没有实现全屏接口
    let request: ReturnType<typeof vi.fn<() => Promise<void>>>;
    beforeEach(() => {
      request = vi.fn(async () => {});
      Element.prototype.requestFullscreen = request;
    });
    afterEach(() => {
      delete (Element.prototype as Partial<Element>).requestFullscreen;
    });

    it("按 F 或 Shift+F 让视频区域进入全屏", () => {
      show({ entry: file("/sdcard/a.mp4") });
      expect(fireEvent.keyDown(document.body, { key: "f" })).toBe(false);
      fireEvent.keyDown(document.body, { key: "F", shiftKey: true });
      expect(request).toHaveBeenCalledTimes(2);
      expect(request.mock.contexts[0]).toBe(document.querySelector("video")?.parentElement);
    });

    it("带 Cmd 或 Ctrl 时留给浏览器，长按不重复触发", () => {
      show({ entry: file("/sdcard/a.mp4") });
      expect(fireEvent.keyDown(document.body, { key: "f", metaKey: true })).toBe(true);
      fireEvent.keyDown(document.body, { key: "f", ctrlKey: true });
      fireEvent.keyDown(document.body, { key: "f", repeat: true });
      expect(request).not.toHaveBeenCalled();
    });

    it("音频和文本不响应 F", () => {
      show({ entry: file("/sdcard/a.flac") });
      fireEvent.keyDown(document.body, { key: "f" });
      expect(request).not.toHaveBeenCalled();
    });
  });
});

describe("AudioPlayer", () => {
  it("显示播放器卡片，没有全屏按钮", () => {
    show({ entry: file("/sdcard/a.flac") });
    expect(button(tz("viewer.play"))).toBeTruthy();
    expect(screen.getByRole("slider", { name: tz("viewer.volume") })).toBeTruthy();
    expect(screen.queryByRole("button", { name: tz("viewer.fullscreen") })).toBeNull();
  });
});
