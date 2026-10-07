import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../../../test/utils.tsx";
import { SelectionBar } from "./SelectionBar.tsx";

function show(showBar: boolean, count = 3) {
  const fns = { onDownload: vi.fn(), onCompress: vi.fn(), onDelete: vi.fn(), onClear: vi.fn() };
  render(<SelectionBar show={showBar} count={count} {...fns} />, { wrapper: providers() });
  return fns;
}

describe("SelectionBar", () => {
  it("不显示时什么都不渲染", () => {
    show(false);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("显示已选数量，按钮分别调用对应操作", () => {
    const fns = show(true, 3);
    expect(screen.getByText("3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tz("selection.download") }));
    fireEvent.click(screen.getByRole("button", { name: tz("selection.compress") }));
    fireEvent.click(screen.getByRole("button", { name: tz("selection.delete") }));
    fireEvent.click(screen.getByRole("button", { name: tz("selection.cancel") }));
    expect(fns.onDownload).toHaveBeenCalled();
    expect(fns.onCompress).toHaveBeenCalled();
    expect(fns.onDelete).toHaveBeenCalled();
    expect(fns.onClear).toHaveBeenCalled();
  });
});
