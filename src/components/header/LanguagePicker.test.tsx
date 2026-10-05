import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { format } from "../../i18n/translate.ts";
import { providers, tz } from "../../test/utils.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";

function show() {
  render(<LanguagePicker />, { wrapper: providers() });
  const button = () =>
    screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") !== null) as HTMLElement;
  return { button, toggle: () => fireEvent.click(button()) };
}

const option = (name: string) => screen.queryByRole("button", { name });

describe("LanguagePicker", () => {
  it("展开后列出全部语言，当前语言处于按下状态", () => {
    const { button, toggle } = show();
    expect(button().title).toBe(tz("lang.title"));
    expect(button().getAttribute("aria-expanded")).toBe("false");
    toggle();
    expect(button().getAttribute("aria-expanded")).toBe("true");
    expect(option("中文")!.getAttribute("aria-pressed")).toBe("true");
    expect(option("English")!.getAttribute("aria-pressed")).toBe("false");
  });

  it("选择语言后切换界面文案、保存并收起", async () => {
    const { button, toggle } = show();
    toggle();
    fireEvent.click(option("English")!);
    expect(button().title).toBe(format("en", "lang.title"));
    expect(localStorage.getItem("afm.lang")).toBe(JSON.stringify("en"));
    expect(document.documentElement.lang).toBe("en");
    await waitFor(() => expect(option("English")).toBeNull());
  });

  it("选择当前语言只收起", async () => {
    const { button, toggle } = show();
    toggle();
    fireEvent.click(option("中文")!);
    expect(button().title).toBe(tz("lang.title"));
    expect(document.documentElement.lang).toBe("zh-CN");
    await waitFor(() => expect(option("中文")).toBeNull());
  });

  it("按 Esc 收起", async () => {
    const { toggle } = show();
    toggle();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(option("English")).toBeNull());
  });

  it("点击外面收起，点击内部不收起", async () => {
    const { toggle } = show();
    toggle();
    fireEvent.mouseDown(option("English")!);
    expect(option("English")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(option("English")).toBeNull());
  });

  it("再点一次按钮收起", async () => {
    const { toggle } = show();
    toggle();
    toggle();
    await waitFor(() => expect(option("English")).toBeNull());
  });
});
