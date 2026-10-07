import { fireEvent, render, screen } from "@testing-library/react";
import { File, Smartphone } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import { ModuleNav, type ModuleNavItem } from "./ModuleNav.tsx";

const FILES: ModuleNavItem = { id: "files", icon: File, label: "nav.files" };
const OTHER: ModuleNavItem = { id: "other", icon: Smartphone, label: "nav.label" };

describe("ModuleNav", () => {
  it("只有一个模块时不渲染", () => {
    const { container } = render(<ModuleNav items={[FILES]} current="files" onChange={vi.fn()} />, {
      wrapper: providers(),
    });
    expect(container.firstChild).toBeNull();
  });

  it("有多个模块时用 aria-pressed 标出当前模块，点击后调用 onChange", () => {
    const onChange = vi.fn();
    render(<ModuleNav items={[FILES, OTHER]} current="files" onChange={onChange} />, { wrapper: providers() });
    const files = screen.getByRole("button", { name: tz("nav.files") });
    const other = screen.getByRole("button", { name: tz("nav.label") });
    expect(files.getAttribute("aria-pressed")).toBe("true");
    expect(other.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(other);
    expect(onChange).toHaveBeenCalledWith("other");
  });
});
