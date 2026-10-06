import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/index.ts";
import { deferred, file, folder, newQueryClient, providers, tz } from "../../test/utils.tsx";
import type { DirUsage, FileStat } from "../../types.ts";
import { Properties } from "./Properties.tsx";

const target = { serial: "R5CT", root: true };

function statOf(path: string, patch: Partial<FileStat> = {}): FileStat {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    type: "file",
    size: 2048,
    mtime: 1700000000,
    ctime: 1700000100,
    mode: 0o644,
    uid: 1023,
    gid: 1015,
    user: "media_rw",
    group: "sdcard_rw",
    inode: 42,
    links: 1,
    context: "u:object_r:sdcardfs:s0",
    protected: false,
    ...patch,
  };
}

const usageOf = (patch: Partial<DirUsage> = {}): DirUsage => ({
  size: 5 * 1024 * 1024,
  files: 12,
  dirs: 3,
  partial: false,
  ...patch,
});

type Props = ComponentProps<typeof Properties>;

function show(patch: Partial<Props> = {}) {
  const props: Props = {
    entries: [file("/sdcard/a.txt", { size: 2048 })],
    target,
    onClose: vi.fn(),
    onNavigate: vi.fn(),
    onCopy: vi.fn(),
    flash: vi.fn(),
    ...patch,
  };
  const view = render(<Properties {...props} />, { wrapper: providers(newQueryClient()) });
  return { props, ...view };
}

const toggle = (
  who: "props.owner" | "props.group" | "props.others",
  what: "props.read" | "props.write" | "props.exec",
) => screen.getByRole("button", { name: `${tz(who)} ${tz(what)}` });
const modeInput = () => screen.getByRole("textbox", { name: tz("props.mode") }) as HTMLInputElement;
const apply = () => screen.getByRole("button", { name: tz("props.apply") });

beforeEach(() => {
  vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path));
  vi.spyOn(api, "usage").mockResolvedValue(usageOf());
  vi.spyOn(api, "chmod").mockResolvedValue({ ok: true });
  vi.spyOn(api, "chown").mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Properties 单项", () => {
  it("显示路径、修改时间、变更时间和权限，不显示访问时间", async () => {
    show();
    expect(await screen.findByText(tz("props.ctime"))).toBeTruthy();
    expect(screen.getByText("/sdcard/a.txt")).toBeTruthy();
    expect(screen.getByText(tz("props.mtime"))).toBeTruthy();
    expect(screen.queryByText(tz("gallery.atime"))).toBeNull();
    expect(screen.getByText("rw-r--r--")).toBeTruthy();
    expect(modeInput().value).toBe("644");
    expect((screen.getByRole("combobox", { name: tz("props.owner") }) as HTMLInputElement).value).toBe("media_rw");
    expect((screen.getByRole("combobox", { name: tz("props.group") }) as HTMLInputElement).value).toBe("sdcard_rw");
    expect(screen.getByText("u:object_r:sdcardfs:s0")).toBeTruthy();
  });

  it("文件不请求递归统计，大小直接显示", async () => {
    show();
    await screen.findByText(tz("props.ctime"));
    expect(screen.getByText("2.0 KB")).toBeTruthy();
    expect(screen.getByText(tz("props.sizeBytes", { n: "2,048" }))).toBeTruthy();
    expect(api.usage).not.toHaveBeenCalled();
  });

  it("基本信息读取失败时显示错误，不出现权限编辑", async () => {
    vi.spyOn(api, "stat").mockRejectedValue(new Error("无读取权限"));
    show();
    expect(await screen.findByText("无读取权限")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: tz("props.mode") })).toBeNull();
  });

  it("点击路径拷贝", async () => {
    const { props } = show();
    fireEvent.click(await screen.findByTitle(tz("menu.copyPath")));
    expect(props.onCopy).toHaveBeenCalledWith("/sdcard/a.txt");
  });

  it("Esc 和关闭按钮都会关闭", async () => {
    const { props } = show();
    await screen.findByText(tz("props.ctime"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: tz("common.close") }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});

describe("Properties 文件夹统计", () => {
  const dir = folder("/sdcard/DCIM");

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path, { type: "dir", mode: 0o775 }));
  });

  it("等待 500 毫秒后才开始统计", async () => {
    show({ entries: [dir] });
    expect(screen.getByText(tz("props.counting"))).toBeTruthy();
    // shouldAdvanceTime 会让假时钟随真实时间多走几毫秒，所以不卡在 499 和 501 上
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(api.usage).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(200));
    await waitFor(() => expect(api.usage).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.usage).mock.calls[0].slice(1, 2)).toEqual(["/sdcard/DCIM"]);
    expect(await screen.findByText("5.0 MB")).toBeTruthy();
    expect(
      screen.getByText(
        tz("props.countJoin", { files: tz("props.fileCount", { n: 12 }), dirs: tz("props.dirCount", { n: 3 }) }),
      ),
    ).toBeTruthy();
  });

  it("500 毫秒内关闭则不发出统计请求", async () => {
    const { unmount } = show({ entries: [dir] });
    await act(() => vi.advanceTimersByTimeAsync(300));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(api.usage).not.toHaveBeenCalled();
  });

  it("统计中关闭会取消请求", async () => {
    const pending = deferred<DirUsage>();
    let signal: AbortSignal | undefined;
    vi.spyOn(api, "usage").mockImplementation((_t, _p, s) => {
      signal = s;
      return pending.promise;
    });
    const { unmount } = show({ entries: [dir] });
    await act(() => vi.advanceTimersByTimeAsync(600));
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it("部分子项读不了时提示统计不完整", async () => {
    vi.spyOn(api, "usage").mockResolvedValue(usageOf({ partial: true }));
    show({ entries: [dir] });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(await screen.findByText(tz("props.partial"))).toBeTruthy();
  });

  it("统计失败时在大小处显示错误", async () => {
    vi.spyOn(api, "usage").mockRejectedValue(new Error("设备已断开"));
    show({ entries: [dir] });
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(await screen.findByText("设备已断开")).toBeTruthy();
  });
});

describe("Properties 修改权限", () => {
  it("勾选权限与八进制输入联动，没有改动时不能应用", async () => {
    show();
    await screen.findByText(tz("props.ctime"));
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
    expect(toggle("props.owner", "props.write").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("props.others", "props.write").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(toggle("props.others", "props.exec"));
    expect(modeInput().value).toBe("645");
    fireEvent.change(modeInput(), { target: { value: "700" } });
    expect(toggle("props.group", "props.read").getAttribute("aria-pressed")).toBe("false");
    expect(toggle("props.owner", "props.exec").getAttribute("aria-pressed")).toBe("true");
  });

  it("八进制不合法时不能应用", async () => {
    show();
    await screen.findByText(tz("props.ctime"));
    fireEvent.change(modeInput(), { target: { value: "89" } });
    expect(modeInput().getAttribute("aria-invalid")).toBe("true");
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
  });

  it("应用时以 4 位八进制调用 chmod，不改所有者就不调用 chown", async () => {
    const { props } = show();
    await screen.findByText(tz("props.ctime"));
    fireEvent.click(toggle("props.owner", "props.exec"));
    fireEvent.click(apply());
    await waitFor(() => expect(api.chmod).toHaveBeenCalledWith(target, ["/sdcard/a.txt"], "0744", false));
    expect(api.chown).not.toHaveBeenCalled();
    await waitFor(() => expect(props.flash).toHaveBeenCalledWith(tz("props.applied", { name: "a.txt" })));
  });

  it("保留 setgid 等特殊位，清除时也写满 4 位", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path, { type: "dir", mode: 0o2775 }));
    show({ entries: [folder("/sdcard/Shared")] });
    await screen.findByText(tz("props.ctime"));
    expect(modeInput().value).toBe("2775");
    fireEvent.change(modeInput(), { target: { value: "775" } });
    fireEvent.click(apply());
    await waitFor(() => expect(api.chmod).toHaveBeenCalledWith(target, ["/sdcard/Shared"], "0775", false));
  });

  it("只改了所有者时只传所有者", async () => {
    show();
    await screen.findByText(tz("props.ctime"));
    fireEvent.change(screen.getByRole("combobox", { name: tz("props.owner") }), { target: { value: "root" } });
    fireEvent.click(apply());
    await waitFor(() => expect(api.chown).toHaveBeenCalledWith(target, ["/sdcard/a.txt"], "root", undefined, false));
    expect(api.chmod).not.toHaveBeenCalled();
  });

  it("设备拒绝时显示错误，已填的值保留", async () => {
    vi.spyOn(api, "chmod").mockRejectedValue(new Error("Operation not permitted"));
    show();
    await screen.findByText(tz("props.ctime"));
    fireEvent.click(toggle("props.owner", "props.exec"));
    fireEvent.click(apply());
    expect(await screen.findByText("Operation not permitted")).toBeTruthy();
    expect(modeInput().value).toBe("744");
  });

  it("应用后重新读取，界面回到设备上的实际值", async () => {
    const stat = vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path));
    show();
    await screen.findByText(tz("props.ctime"));
    stat.mockImplementation(async (_t, path) => statOf(path, { mode: 0o744 }));
    fireEvent.click(toggle("props.owner", "props.exec"));
    fireEvent.click(apply());
    await waitFor(() => expect(stat).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("rwxr--r--")).toBeTruthy());
    expect((apply() as HTMLButtonElement).disabled).toBe(true);
  });

  it("递归应用要先确认，确认后才调用并带上 recursive", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path, { type: "dir", mode: 0o755 }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show({ entries: [folder("/sdcard/DCIM")] });
    await screen.findByText(tz("props.ctime"));
    fireEvent.click(toggle("props.group", "props.write"));
    fireEvent.click(screen.getByRole("button", { name: tz("props.recursive") }));
    fireEvent.click(apply());
    expect(screen.getByText(tz("props.confirmRecursive", { name: "DCIM" }))).toBeTruthy();
    expect(api.chmod).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: tz("props.confirmApply") }));
    await waitFor(() => expect(api.chmod).toHaveBeenCalledWith(target, ["/sdcard/DCIM"], "0775", true));
  });

  it("确认时可以取消，不会调用", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path, { type: "dir", mode: 0o755 }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show({ entries: [folder("/sdcard/DCIM")] });
    await screen.findByText(tz("props.ctime"));
    fireEvent.click(toggle("props.group", "props.write"));
    fireEvent.click(screen.getByRole("button", { name: tz("props.recursive") }));
    fireEvent.click(apply());
    fireEvent.click(screen.getByRole("button", { name: tz("common.cancel") }));
    expect(screen.queryByText(tz("props.confirmRecursive", { name: "DCIM" }))).toBeNull();
    expect(api.chmod).not.toHaveBeenCalled();
  });

  it("文件没有“应用到所有子项”", async () => {
    show();
    await screen.findByText(tz("props.ctime"));
    expect(screen.queryByRole("button", { name: tz("props.recursive") })).toBeNull();
  });

  it("受保护的路径不能修改", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) => statOf(path, { type: "dir", protected: true }));
    show({ entries: [folder("/sdcard")] });
    expect(await screen.findByText(tz("props.protected"))).toBeTruthy();
    expect((toggle("props.owner", "props.read") as HTMLButtonElement).disabled).toBe(true);
    expect(modeInput().disabled).toBe(true);
    expect(screen.queryByRole("button", { name: tz("props.apply") })).toBeNull();
  });
});

describe("Properties 符号链接", () => {
  const link = file("/sdcard/link", { type: "link" });

  it("显示目标并只读，跳转到目标文件时进入它所在的目录并选中", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) =>
      statOf(path, {
        type: "link",
        mode: 0o777,
        link: { target: "../real/b.txt", resolved: "/real/b.txt", broken: false, targetType: "file", targetSize: 2048 },
      }),
    );
    const { props } = show({ entries: [link] });
    expect(await screen.findByText("../real/b.txt")).toBeTruthy();
    expect(screen.getByText(tz("props.linkReadonly"))).toBeTruthy();
    expect(modeInput().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: tz("props.gotoTarget") }));
    expect(props.onClose).toHaveBeenCalled();
    expect(props.onNavigate).toHaveBeenCalledWith("/real", "/real/b.txt");
  });

  it("目标是文件夹时直接进入", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) =>
      statOf(path, {
        type: "link",
        link: {
          target: "/data/media/0",
          resolved: "/data/media/0",
          broken: false,
          targetType: "dir",
          targetSize: 4096,
        },
      }),
    );
    const { props } = show({ entries: [link] });
    fireEvent.click(await screen.findByRole("button", { name: tz("props.gotoTarget") }));
    expect(props.onNavigate).toHaveBeenCalledWith("/data/media/0", undefined);
  });

  it("目标不存在时标明，且不能跳转", async () => {
    vi.spyOn(api, "stat").mockImplementation(async (_t, path) =>
      statOf(path, { type: "link", link: { target: "/nowhere", resolved: "/nowhere", broken: true } }),
    );
    show({ entries: [link] });
    expect(await screen.findByText(tz("props.linkBroken"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: tz("props.gotoTarget") })).toBeNull();
  });
});

describe("Properties 多选", () => {
  it("只显示汇总，文件和文件夹的大小合计，没有权限编辑", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show({
      entries: [file("/sdcard/a.txt", { size: 1024 }), file("/sdcard/b.txt", { size: 1024 }), folder("/sdcard/DCIM")],
    });
    expect(screen.getByText(tz("props.itemsTitle", { n: 3 }))).toBeTruthy();
    expect(screen.getByText(tz("props.counting"))).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(600));
    // 两个文件共 2048 字节，加上文件夹的 5 MB
    expect(
      await screen.findByText(tz("props.sizeBytes", { n: (5 * 1024 * 1024 + 2048).toLocaleString() })),
    ).toBeTruthy();
    expect(
      screen.getByText(
        tz("props.countJoin", { files: tz("props.fileCount", { n: 2 }), dirs: tz("props.dirCount", { n: 1 }) }),
      ),
    ).toBeTruthy();
    expect(screen.getByText("/sdcard")).toBeTruthy();
    expect(api.stat).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: tz("props.mode") })).toBeNull();
  });

  it("位置不同时写明多个位置", () => {
    show({ entries: [file("/sdcard/a.txt"), file("/sdcard/DCIM/b.txt")] });
    expect(screen.getByText(tz("props.mixedLocation"))).toBeTruthy();
  });
});
