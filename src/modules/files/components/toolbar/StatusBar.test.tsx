import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { file, folder, providers, tz } from "../../../../test/utils.tsx";
import { StatusBar } from "./StatusBar.tsx";

type Props = ComponentProps<typeof StatusBar>;

const ENTRIES = [folder("/sdcard/DCIM"), file("/sdcard/a.txt"), file("/sdcard/.nomedia")];

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    entries: ENTRIES,
    shown: 2,
    ready: true,
    showHidden: false,
    onToggleHidden: vi.fn(),
    storage: null,
    ...patch,
  };
  const { container } = render(<StatusBar {...props} />, { wrapper: providers() });
  return { props, text: () => container.textContent };
}

describe("StatusBar", () => {
  it("有隐藏文件时写明隐藏了几项，并提供开关", () => {
    const { props, text } = show();
    expect(text()).toContain(tz("toolbar.countHidden", { n: 2, hidden: 1 }));
    const toggle = screen.getByRole("button", { name: tz("toolbar.showHidden") });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(props.onToggleHidden).toHaveBeenCalled();
  });

  it("显示隐藏文件时只写总数，开关为按下状态", () => {
    const { text } = show({ showHidden: true, shown: 3 });
    expect(text()).toContain(tz("toolbar.count", { n: 3 }));
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });

  it("没有隐藏文件时不显示开关", () => {
    const { text } = show({ entries: ENTRIES.slice(0, 2) });
    expect(text()).toContain(tz("toolbar.count", { n: 2 }));
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("目录还没加载好时不显示项目数", () => {
    const { text } = show({ ready: false, entries: [] });
    expect(text()).toBe("");
  });

  it("显示剩余空间", () => {
    const { text } = show({ storage: { total: 64 * 1024 ** 3, free: 12.5 * 1024 ** 3 } });
    expect(text()).toContain(tz("toolbar.free", { size: "13 GB" }));
  });
});
