import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/index.ts";
import { providers, tz } from "../test/utils.tsx";
import type { Device, DeviceMode } from "../types.ts";
import { NoDevice } from "./NoDevice.tsx";

const dev = (mode: DeviceMode): Device => ({ serial: "A", transport: "adb", mode, model: "", name: "A" });

function setup(devices: Device[], { device = devices[0] ?? null, reconnecting = false } = {}) {
  render(
    <NoDevice devices={devices} device={device} reconnecting={reconnecting} modes={["system"]} adbError={null} />,
    {
      wrapper: providers(),
    },
  );
}

describe("NoDevice", () => {
  afterEach(() => vi.restoreAllMocks());

  it("有待授权设备时显示两个按钮", () => {
    setup([dev("unauthorized")]);
    expect(screen.getByRole("button", { name: tz("nodevice.reauthorize") })).toBeTruthy();
    expect(screen.getByRole("button", { name: tz("nodevice.restartAdb") })).toBeTruthy();
  });

  it("没有待授权设备时不显示按钮", () => {
    setup([dev("offline")]);
    expect(screen.queryByRole("button", { name: tz("nodevice.reauthorize") })).toBeNull();
    expect(screen.queryByRole("button", { name: tz("nodevice.restartAdb") })).toBeNull();
  });

  it("设备处于不符的模式时显示当前模式和所需模式，不显示连接引导", () => {
    setup([{ ...dev("bootloader"), transport: "fastboot" }]);
    expect(screen.getByText(tz("nodevice.wrongMode", { mode: tz("device.mode.bootloader") }))).toBeTruthy();
    expect(screen.getByText(tz("nodevice.needMode", { modes: tz("device.mode.system") }))).toBeTruthy();
    expect(screen.queryByText(tz("nodevice.step1.title"))).toBeNull();
    expect(screen.queryByRole("button", { name: tz("nodevice.reauthorize") })).toBeNull();
  });

  it("离线的设备仍显示连接引导", () => {
    setup([dev("offline")]);
    expect(screen.getByText(tz("nodevice.connect"))).toBeTruthy();
    expect(screen.getByText(tz("nodevice.step1.title"))).toBeTruthy();
  });

  it("等待重新连接时显示提示，不显示连接引导", () => {
    setup([], { device: dev("system"), reconnecting: true });
    expect(screen.getByText(tz("nodevice.reconnecting"))).toBeTruthy();
    expect(screen.queryByText(tz("nodevice.step1.title"))).toBeNull();
  });

  it("点击按钮调用对应接口", async () => {
    const reconnect = vi.spyOn(api, "reconnectDevices").mockResolvedValue({ ok: true });
    const restart = vi.spyOn(api, "restartAdb").mockResolvedValue({ ok: true });
    setup([dev("unauthorized")]);
    fireEvent.click(screen.getByRole("button", { name: tz("nodevice.reauthorize") }));
    await waitFor(() => expect(reconnect).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: tz("nodevice.restartAdb") }));
    await waitFor(() => expect(restart).toHaveBeenCalledOnce());
  });

  it("请求失败时显示错误", async () => {
    vi.spyOn(api, "reconnectDevices").mockRejectedValue(new Error("boom"));
    setup([dev("unauthorized")]);
    fireEvent.click(screen.getByRole("button", { name: tz("nodevice.reauthorize") }));
    await waitFor(() => expect(screen.getByText("boom")).toBeTruthy());
  });
});
