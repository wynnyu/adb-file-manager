import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { providers, tz } from "../../test/utils.tsx";
import type { Device, DeviceMode } from "../../types.ts";
import { DeviceSelect } from "./DeviceSelect.tsx";

const pixel: Device = { serial: "R5CT", transport: "adb", mode: "system", model: "Pixel 9", name: "Pixel 9" };
const tablet: Device = { serial: "TAB01", transport: "adb", mode: "unauthorized", model: "Tab", name: "Galaxy Tab" };

function show(devices: Device[], serial: string | null, fastbootMissing = false) {
  const onChange = vi.fn();
  render(<DeviceSelect devices={devices} fastbootMissing={fastbootMissing} serial={serial} onChange={onChange} />, {
    wrapper: providers(),
  });
  const toggle = () => fireEvent.click(screen.getAllByRole("button")[0]);
  return { onChange, toggle };
}

describe("DeviceSelect", () => {
  it("显示当前设备的名称和连接状态", () => {
    show([pixel, tablet], "R5CT");
    expect(screen.getByText("Pixel 9")).toBeTruthy();
    expect(screen.getByText(tz("device.mode.system"))).toBeTruthy();
  });

  it.each<[DeviceMode, string]>([
    ["system", "device.mode.system"],
    ["recovery", "device.mode.recovery"],
    ["sideload", "device.mode.sideload"],
    ["bootloader", "device.mode.bootloader"],
    ["fastbootd", "device.mode.fastbootd"],
    ["unauthorized", "device.mode.unauthorized"],
    ["offline", "device.mode.offline"],
  ] as const)("模式 %s 显示对应文案", (mode, key) => {
    show([{ ...pixel, mode }], "R5CT");
    expect(screen.getByText(tz(key as Parameters<typeof tz>[0]))).toBeTruthy();
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

  it("展开后每项在序列号旁显示模式", () => {
    const { toggle } = show([pixel, tablet], "R5CT");
    toggle();
    expect(screen.getByText(tz("device.mode.unauthorized"))).toBeTruthy();
  });

  it("没有设备时列表里写明未检测到", () => {
    const { toggle } = show([], null);
    toggle();
    expect(screen.getByText(tz("device.noneDetected"))).toBeTruthy();
  });

  it.each([
    [true, 1],
    [false, 0],
  ])("fastboot 缺失为 %s 时提示出现 %i 次", (missing, count) => {
    const { toggle } = show([pixel], "R5CT", missing);
    toggle();
    expect(screen.queryAllByText(tz("device.fastbootMissing"))).toHaveLength(count);
  });

  it("点击外面时收起", async () => {
    const { toggle } = show([pixel], "R5CT");
    toggle();
    expect(screen.getByText("R5CT")).toBeTruthy();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByText("R5CT")).toBeNull());
  });
});
