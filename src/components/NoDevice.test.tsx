import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api.ts";
import { providers, tz } from "../test/utils.tsx";
import type { Device } from "../types.ts";
import { NoDevice } from "./NoDevice.tsx";

const dev = (state: string): Device => ({ serial: "A", state, model: "", name: "A" });

function setup(devices: Device[]) {
  render(<NoDevice devices={devices} adbError={null} />, { wrapper: providers() });
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
