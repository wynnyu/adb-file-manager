import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sort } from "../lib/index.ts";
import { api, lsQuery, type Target } from "../lib/index.ts";
import { deferred, file, folder, newQueryClient, providers } from "../test/utils.tsx";
import type { FileEntry } from "../types.ts";
import { useDirectory, useListings } from "./useDirectory.ts";
import { useSelection } from "./useSelection.ts";

const T: Target = { serial: "A", root: false };
const SORT: Sort = { key: "name", asc: true };

/** 设备上的目录内容，ls 从这里读 */
let fs: Record<string, FileEntry[]>;

beforeEach(() => {
  fs = {
    "/sdcard": [file("/sdcard/a.txt"), folder("/sdcard/DCIM"), file("/sdcard/.nomedia")],
    "/sdcard/DCIM": [folder("/sdcard/DCIM/Camera"), file("/sdcard/DCIM/b.jpg")],
    "/sdcard/DCIM/Camera": [file("/sdcard/DCIM/Camera/1.jpg")],
  };
  vi.spyOn(api, "ls").mockImplementation(async (_t, p) => {
    if (!fs[p]) throw new Error(`目录不存在：${p}`);
    return [...fs[p]];
  });
});

function setup({ target = T as Target | null, online = true, client = newQueryClient() } = {}) {
  const hook = renderHook(
    (p: { target: Target | null; online: boolean }) => {
      const selection = useSelection();
      const dir = useDirectory({ target: p.target, online: p.online, sort: SORT, showHidden: false, selection });
      return { selection, dir };
    },
    { initialProps: { target, online }, wrapper: providers(client) },
  );
  const selected = () => [...hook.result.current.selection.selected];
  const names = () => hook.result.current.dir.visible.map((e) => e.name);
  return { ...hook, client, selected, names };
}

const cached = (client: QueryClient, p: string, t: Target = T) => client.getQueryState(lsQuery(t, p).queryKey);

describe("useDirectory", () => {
  it("默认打开 /sdcard，文件夹在前，隐藏文件不显示", async () => {
    const { result, names } = setup();
    expect(result.current.dir.path).toBe("/sdcard");
    await waitFor(() => expect(result.current.dir.ready).toBe(true));
    expect(result.current.dir.entries).toHaveLength(3);
    expect(names()).toEqual(["DCIM", "a.txt"]);
    expect(localStorage.getItem("afm.path")).toBe(JSON.stringify("/sdcard"));
  });

  it("打开上次所在的目录", async () => {
    localStorage.setItem("afm.path", JSON.stringify("/sdcard/DCIM"));
    const { result } = setup();
    await waitFor(() => expect(result.current.dir.ready).toBe(true));
    expect(api.ls).toHaveBeenCalledWith(T, "/sdcard/DCIM");
  });

  it("筛选只匹配名称，不区分大小写", async () => {
    const { result, names } = setup();
    await waitFor(() => expect(result.current.dir.ready).toBe(true));
    act(() => result.current.dir.setFilter("dc"));
    expect(names()).toEqual(["DCIM"]);
  });

  it("读取失败时返回错误信息", async () => {
    localStorage.setItem("afm.path", JSON.stringify("/data"));
    const { result } = setup();
    await waitFor(() => expect(result.current.dir.listError).toBe("目录不存在：/data"));
    expect(result.current.dir.entries).toEqual([]);
    expect(result.current.dir.ready).toBe(false);
  });

  it("设备离线时不请求", () => {
    setup({ online: false });
    expect(api.ls).not.toHaveBeenCalled();
  });

  describe("navigate", () => {
    it("进入目录，清空筛选，加载完选中第一项", async () => {
      const { result, selected } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      act(() => result.current.dir.setFilter("a"));
      act(() => result.current.dir.navigate("/sdcard/DCIM", true));
      expect(result.current.dir.path).toBe("/sdcard/DCIM");
      expect(result.current.dir.filter).toBe("");
      await waitFor(() => expect(selected()).toEqual(["/sdcard/DCIM/Camera"]));
    });

    it("进入缓存里有的目录：立刻显示并选好，重新加载完不再改动选择", async () => {
      const { result, selected } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      act(() => result.current.dir.navigate("/sdcard/DCIM"));
      await waitFor(() => expect(result.current.dir.entries).toHaveLength(2));

      const pending = deferred<FileEntry[]>();
      vi.mocked(api.ls).mockReturnValueOnce(pending.promise);
      act(() => result.current.dir.navigate("/sdcard", "/sdcard/DCIM"));
      expect(result.current.dir.entries).toHaveLength(3);
      expect(selected()).toEqual(["/sdcard/DCIM"]);

      // 后台加载期间用户改了选择，加载完成后保留
      act(() => result.current.selection.selectOnly("/sdcard/a.txt"));
      pending.resolve(fs["/sdcard"]);
      await waitFor(() => expect(result.current.dir.loading).toBe(false));
      expect(selected()).toEqual(["/sdcard/a.txt"]);
    });

    it("点当前目录时重新加载", async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      act(() => result.current.dir.navigate("/sdcard"));
      await waitFor(() => expect(api.ls).toHaveBeenCalledTimes(2));
      expect(result.current.dir.entries).toHaveLength(3);
    });

    it("在当前目录里指定 focus 时只改动选择", async () => {
      const { result, selected } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      act(() => result.current.dir.navigate("/sdcard", true));
      expect(selected()).toEqual(["/sdcard/DCIM"]);
      expect(api.ls).toHaveBeenCalledTimes(1);
    });

    it("连续进入多个目录时，只有最后一次能改动选择", async () => {
      const { result, selected, client } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      const slow = deferred<FileEntry[]>();
      vi.mocked(api.ls).mockReturnValueOnce(slow.promise);
      act(() => result.current.dir.navigate("/sdcard/DCIM", true));
      act(() => result.current.dir.navigate("/sdcard/DCIM/Camera", true));
      await waitFor(() => expect(selected()).toEqual(["/sdcard/DCIM/Camera/1.jpg"]));
      slow.resolve(fs["/sdcard/DCIM"]);
      await waitFor(() => expect(cached(client, "/sdcard/DCIM")?.status).toBe("success"));
      expect(selected()).toEqual(["/sdcard/DCIM/Camera/1.jpg"]);
    });
  });

  describe("reload", () => {
    it("keepSelection 为 true 时保留选择，否则清空", async () => {
      const { result, selected } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      act(() => result.current.selection.selectOnly("/sdcard/a.txt"));
      await act(() => result.current.dir.reload(true));
      expect(selected()).toEqual(["/sdcard/a.txt"]);
      await act(() => result.current.dir.reload());
      expect(selected()).toEqual([]);
    });

    it("缓存的其他目录一并过期", async () => {
      const { result, client } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      client.setQueryData(lsQuery(T, "/sdcard/DCIM").queryKey, fs["/sdcard/DCIM"]);
      await act(() => result.current.dir.reload());
      expect(cached(client, "/sdcard/DCIM")?.isInvalidated).toBe(true);
    });

    it("另一种 root 模式下的当前目录也过期", async () => {
      const { result, client } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      const rooted = { serial: "A", root: true };
      client.setQueryData(lsQuery(rooted, "/sdcard").queryKey, fs["/sdcard"]);
      await act(() => result.current.dir.reload());
      expect(cached(client, "/sdcard", rooted)?.isInvalidated).toBe(true);
    });

    it("传输期间切换了 root 模式：完成后用旧的 reload 刷新，新模式下的列表也重新加载", async () => {
      const { result, rerender } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      const staleReload = result.current.dir.reload;
      const rooted = { serial: "A", root: true };
      rerender({ target: rooted, online: true });
      await waitFor(() => expect(api.ls).toHaveBeenLastCalledWith(rooted, "/sdcard"));

      fs["/sdcard"] = [...fs["/sdcard"], file("/sdcard/new.txt")];
      await act(() => staleReload(true));
      await waitFor(() => expect(result.current.dir.entries).toHaveLength(4));
    });
  });

  describe("afterChange", () => {
    it("所在目录的上层被改名：跟到新路径", async () => {
      localStorage.setItem("afm.path", JSON.stringify("/sdcard/DCIM/Camera"));
      const { result } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      fs["/sdcard/Photos/Camera"] = fs["/sdcard/DCIM/Camera"];
      await act(() => result.current.dir.afterChange([["/sdcard/DCIM", "/sdcard/Photos"]]));
      expect(result.current.dir.path).toBe("/sdcard/Photos/Camera");
      await waitFor(() => expect(api.ls).toHaveBeenLastCalledWith(T, "/sdcard/Photos/Camera"));
    });

    it("所在目录被删掉：退到它的上一级", async () => {
      localStorage.setItem("afm.path", JSON.stringify("/sdcard/DCIM/Camera"));
      const { result } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      await act(() => result.current.dir.afterChange([["/sdcard/DCIM", null]]));
      expect(result.current.dir.path).toBe("/sdcard");
    });

    it("其他目录变动：丢掉不在了的目录的缓存，原地刷新", async () => {
      const { result, client } = setup();
      await waitFor(() => expect(result.current.dir.ready).toBe(true));
      for (const p of ["/sdcard/DCIM", "/sdcard/DCIM/Camera", "/sdcard/DCIMx"]) {
        client.setQueryData(lsQuery(T, p).queryKey, []);
      }
      await act(() => result.current.dir.afterChange([["/sdcard/DCIM", null]]));
      expect(result.current.dir.path).toBe("/sdcard");
      expect(cached(client, "/sdcard/DCIM")).toBeUndefined();
      expect(cached(client, "/sdcard/DCIM/Camera")).toBeUndefined();
      // 只是前缀相同的目录不受影响
      expect(cached(client, "/sdcard/DCIMx")?.isInvalidated).toBe(true);
      expect(api.ls).toHaveBeenCalledTimes(2);
    });
  });

  it("换设备时清空选择", async () => {
    const { result, rerender, selected } = setup();
    await waitFor(() => expect(result.current.dir.ready).toBe(true));
    act(() => result.current.selection.selectOnly("/sdcard/a.txt"));
    rerender({ target: { serial: "B", root: false }, online: true });
    expect(selected()).toEqual([]);
  });

  it("切换 root 模式时目录不变，新列表回来之前接着显示原来的", async () => {
    const { result, rerender } = setup();
    await waitFor(() => expect(result.current.dir.ready).toBe(true));
    const pending = deferred<FileEntry[]>();
    vi.mocked(api.ls).mockReturnValueOnce(pending.promise);
    const rooted = { serial: "A", root: true };
    rerender({ target: rooted, online: true });
    expect(api.ls).toHaveBeenLastCalledWith(rooted, "/sdcard");
    expect(result.current.dir.entries).toHaveLength(3);

    pending.resolve([file("/sdcard/only-root")]);
    await waitFor(() => expect(result.current.dir.entries.map((e) => e.name)).toEqual(["only-root"]));
  });
});

describe("useListings", () => {
  it("按路径返回内容或错误，还在加载的不在表里", async () => {
    const slow = deferred<FileEntry[]>();
    vi.mocked(api.ls).mockImplementation(async (_t, p) => {
      if (p === "/slow") return slow.promise;
      if (!fs[p]) throw new Error("无读取权限");
      return fs[p];
    });
    const { result } = renderHook(() => useListings(T, true, ["/sdcard/DCIM", "/data", "/slow"]), {
      wrapper: providers(newQueryClient()),
    });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get("/sdcard/DCIM")).toEqual({ entries: fs["/sdcard/DCIM"] });
    expect(result.current.get("/data")).toEqual({ error: "无读取权限" });
    expect(result.current.has("/slow")).toBe(false);

    slow.resolve([]);
    await waitFor(() => expect(result.current.get("/slow")).toEqual({ entries: [] }));
  });

  it("缓存里有就不再请求", async () => {
    const client = newQueryClient();
    client.setQueryData(lsQuery(T, "/sdcard/DCIM").queryKey, fs["/sdcard/DCIM"]);
    const { result } = renderHook(() => useListings(T, true, ["/sdcard/DCIM"]), { wrapper: providers(client) });
    expect(result.current.get("/sdcard/DCIM")?.entries).toHaveLength(2);
    expect(api.ls).not.toHaveBeenCalled();
  });
});
