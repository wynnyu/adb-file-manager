import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import type { Device } from "../../types.ts";
import { DeviceSelect } from "./DeviceSelect.tsx";

const pixel: Device = { serial: "R5CT", state: "device", model: "Pixel 9", name: "Pixel 9" };
const tablet: Device = { serial: "TAB01", state: "unauthorized", model: "Tab", name: "Galaxy Tab" };

function show(devices: Device[], serial: string | null) {
  const onChange = vi.fn();
  render(<DeviceSelect devices={devices} serial={serial} onChange={onChange} />, { wrapper: providers() });
  const toggle = () => fireEvent.click(screen.getAllByRole("button")[0]);
  return { onChange, toggle };
}

describe("DeviceSelect", () => {
  it("显示当前设备的名称和连接状态", () => {
    show([pixel, tablet], "R5CT");
    expect(screen.getByText("Pixel 9")).toBeTruthy();
    expect(screen.getByText(tz("device.device"))).toBeTruthy();
  });

  it("没有选中设备时提示等待连接", () => {
    show([], null);
    expect(screen.getByText(tz("device.none"))).toBeTruthy();
    expect(screen.getByText(tz("device.waiting"))).toBeTruthy();
  });

  it("展开后列出全部设备，选中后收起", async () => {
    const { onChange, toggle } = show([pixel, tablet], "R5CT");
    toggle();
    expect(screen.getByText("TAB01")).toBeTruthy();
    fireEvent.click(screen.getByText("Galaxy Tab"));
    expect(onChange).toHaveBeenCalledWith("TAB01");
    await waitFor(() => expect(screen.queryByText("TAB01")).toBeNull());
  });

  it("没有设备时列表里写明未检测到", () => {
    const { toggle } = show([], null);
    toggle();
    expect(screen.getByText(tz("device.noneDetected"))).toBeTruthy();
  });

  it("点击外面时收起", async () => {
    const { toggle } = show([pixel], "R5CT");
    toggle();
    expect(screen.getByText("R5CT")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("R5CT")).toBeNull());
  });
});
