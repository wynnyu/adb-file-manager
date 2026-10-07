import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tz } from "../test/utils.tsx";
import type { JobSnapshot } from "../types.ts";
import { ApiError, api, JobCanceled, onRootLost } from "./api.ts";

/** 只实现 watchJob 用到的部分：事件监听、onerror、readyState、close */
class FakeEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static last: FakeEventSource;
  readyState = FakeEventSource.OPEN;
  onerror: (() => void) | null = null;
  closed = false;
  private listeners = new Map<string, (e: MessageEvent<string>) => void>();

  constructor(public url: string) {
    FakeEventSource.last = this;
  }

  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.set(type, fn);
  }

  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }

  emit(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

const snap = (patch: Partial<JobSnapshot>): JobSnapshot => ({ id: "j1", state: "running", cancelable: true, ...patch });

describe("api.watchJob", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", FakeEventSource);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    onRootLost(() => {});
  });

  it("订阅对应任务的事件流，每个快照都回调，done 时返回结果并关闭连接", async () => {
    const seen: JobSnapshot[] = [];
    const done = api.watchJob("j1", (s) => seen.push(s));
    const es = FakeEventSource.last;
    expect(es.url).toBe("/api/jobs/j1/events");
    es.emit("state", snap({ phase: "pulling", progress: 0.3 }));
    es.emit("state", snap({ state: "done", result: { token: "t" } }));
    await expect(done).resolves.toEqual({ token: "t" });
    expect(seen.map((s) => s.state)).toEqual(["running", "done"]);
    expect(es.closed).toBe(true);
  });

  it("error 时抛出任务的错误信息", async () => {
    const done = api.watchJob("j1", () => {});
    FakeEventSource.last.emit("state", snap({ state: "error", error: "空间不足" }));
    await expect(done).rejects.toThrow("空间不足");
    expect(FakeEventSource.last.closed).toBe(true);
  });

  it("code 为 root_lost 时通知 root 失效", async () => {
    const lost = vi.fn();
    onRootLost(lost);
    const done = api.watchJob("j1", () => {});
    FakeEventSource.last.emit("state", snap({ state: "error", error: "root 已失效", code: "root_lost" }));
    await expect(done).rejects.toThrow("root 已失效");
    expect(lost).toHaveBeenCalledWith("root 已失效");
  });

  it("canceled 时抛出 JobCanceled", async () => {
    const done = api.watchJob("j1", () => {});
    FakeEventSource.last.emit("state", snap({ state: "canceled" }));
    await expect(done).rejects.toBeInstanceOf(JobCanceled);
  });

  it("连接断开且不会重连时抛出网络错误", async () => {
    const done = api.watchJob("j1", () => {});
    const es = FakeEventSource.last;
    es.readyState = FakeEventSource.CLOSED;
    es.onerror?.();
    await expect(done).rejects.toThrow(tz("common.networkError"));
  });

  it("正在重连时继续等待，重连后收到快照照常结束", async () => {
    const done = api.watchJob("j1", () => {});
    const es = FakeEventSource.last;
    es.readyState = FakeEventSource.CONNECTING;
    es.onerror?.();
    es.readyState = FakeEventSource.OPEN;
    es.emit("state", snap({ state: "done", result: 1 }));
    await expect(done).resolves.toBe(1);
  });
});

describe("api.download", () => {
  afterEach(() => vi.restoreAllMocks());

  it("启动任务，等到完成后用 token 触发浏览器下载", async () => {
    vi.spyOn(api, "pull").mockResolvedValue({ id: "j1" });
    vi.spyOn(api, "watchJob").mockResolvedValue({ token: "tok", name: "a.zip" } as never);
    const hrefs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.getAttribute("href") ?? "");
    });
    const onJob = vi.fn();
    await api.download({ serial: "A", root: false }, ["/sdcard/a"], { onJob });
    expect(onJob).toHaveBeenCalledWith("j1");
    expect(hrefs).toEqual(["/api/files/fetch/tok"]);
  });
});

const jsonResponse = (data: unknown, status = 200) =>
  Promise.resolve({ ok: status < 300, status, json: async () => data } as Response);

describe("api.appAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("以 JSON 提交 serial、包名和附加参数到对应接口", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await api.appAction("S", "uninstall", "com.a", { user0: true, force: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/apps/uninstall");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ serial: "S", pkg: "com.a", user0: true, force: true });
  });

  it("失败时抛出后端给出的错误信息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "该应用是系统关键组件" }, 409)),
    );
    await expect(api.appAction("S", "disable", "com.android.systemui")).rejects.toThrow("该应用是系统关键组件");
  });
});

describe("ApiError", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("请求失败时抛出带 code 的 ApiError，缺省 code 时为 undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "风险说明", code: "needs_force" }, 409)),
    );
    const err = await api.setProp({ serial: "S", root: false }, "persist.a", "1").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "风险说明", code: "needs_force" });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "失败" }, 400)),
    );
    const plain = await api.setProp({ serial: "S", root: false }, "persist.a", "1").catch((e) => e);
    expect(plain).toBeInstanceOf(ApiError);
    expect((plain as ApiError).code).toBeUndefined();
  });

  it("root_lost 仍通知 root 失效", async () => {
    const lost = vi.fn();
    onRootLost(lost);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse({ error: "root 已失效", code: "root_lost" }, 403)),
    );
    const err = await api.props({ serial: "S", root: true }).catch((e) => e);
    expect(err).toMatchObject({ code: "root_lost" });
    expect(lost).toHaveBeenCalledWith("root 已失效");
    onRootLost(() => {});
  });
});

describe("api.props、setProp、deleteProp", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub() {
    const fetchMock = vi.fn(() => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    return () => fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  }

  it("列表带 serial，root 模式带 root=1", async () => {
    const call = stub();
    await api.props({ serial: "S", root: true });
    expect(call()[0]).toBe("/api/props?serial=S&root=1");
  });

  it("修改只在需要时带 force，body 带 root", async () => {
    const call = stub();
    await api.setProp({ serial: "S", root: true }, "ro.a", "1");
    expect(call()[0]).toBe("/api/props/set");
    expect(JSON.parse(call()[1].body as string)).toEqual({ serial: "S", root: true, key: "ro.a", value: "1" });
    vi.unstubAllGlobals();
    const call2 = stub();
    await api.setProp({ serial: "S", root: true }, "ro.a", "1", true);
    expect(JSON.parse(call2()[1].body as string)).toEqual({
      serial: "S",
      root: true,
      key: "ro.a",
      value: "1",
      force: true,
    });
  });

  it("删除带 force 重试", async () => {
    const call = stub();
    await api.deleteProp({ serial: "S", root: true }, "ro.a", true);
    expect(call()[0]).toBe("/api/props/delete");
    expect(JSON.parse(call()[1].body as string)).toEqual({ serial: "S", root: true, key: "ro.a", force: true });
  });
});

describe("api.extractApk", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("启动提取任务，完成后触发浏览器下载", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ id: "j1" }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(api, "watchJob").mockResolvedValue({ token: "tok", name: "com.a.apks" } as never);
    const hrefs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      hrefs.push(this.getAttribute("href") ?? "");
    });
    const onJob = vi.fn();
    await api.extractApk("S", "com.a", { onJob });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/apps/extract");
    expect(onJob).toHaveBeenCalledWith("j1");
    expect(hrefs).toEqual(["/api/files/fetch/tok"]);
  });
});

/** 只实现 xhrForm 用到的部分 */
class FakeXhr {
  static last: FakeXhr;
  status = 200;
  responseText = "";
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  headers: Record<string, string> = {};
  body: FormData | null = null;
  url = "";
  aborted = false;

  constructor() {
    FakeXhr.last = this;
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.aborted = true;
    this.onabort?.();
  }

  respond(status: number, text: string) {
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

describe("api.installApps", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });
  afterEach(() => vi.unstubAllGlobals());

  const apk = new File(["x"], "a.apk");

  it("上传文件和文件名到 serial 对应的接口，回调上传进度，成功时返回任务", async () => {
    const onProgress = vi.fn();
    const done = api.installApps("S 1", [apk], onProgress);
    const xhr = FakeXhr.last;
    expect(xhr.url).toBe("/api/apps/install?serial=S+1");
    expect(xhr.headers["X-Lang"]).toBeTruthy();
    expect(xhr.body?.get("names")).toBe(JSON.stringify(["a.apk"]));
    expect(xhr.body?.getAll("files")).toHaveLength(1);
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
    expect(onProgress).toHaveBeenCalledWith(0.25);
    xhr.respond(200, JSON.stringify({ id: "j1" }));
    await expect(done).resolves.toEqual({ id: "j1" });
  });

  it("后端返回错误时抛出错误信息", async () => {
    const done = api.installApps("S", [apk], vi.fn());
    FakeXhr.last.respond(400, JSON.stringify({ error: "仅支持安装 .apk、.apks、.xapk 文件" }));
    await expect(done).rejects.toThrow("仅支持安装 .apk、.apks、.xapk 文件");
  });

  it("响应不是 JSON 时用状态码报错", async () => {
    const done = api.installApps("S", [apk], vi.fn());
    FakeXhr.last.respond(502, "<html>Bad Gateway</html>");
    await expect(done).rejects.toThrow("HTTP 502");
  });

  it("signal 触发时中止上传并抛出 JobCanceled", async () => {
    const controller = new AbortController();
    const done = api.installApps("S", [apk], vi.fn(), controller.signal);
    controller.abort();
    await expect(done).rejects.toBeInstanceOf(JobCanceled);
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it("signal 已触发时不发送请求", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(api.installApps("S", [apk], vi.fn(), controller.signal)).rejects.toBeInstanceOf(JobCanceled);
    expect(FakeXhr.last.body).toBeNull();
  });

  it("网络错误时抛出网络错误", async () => {
    const done = api.installApps("S", [apk], vi.fn());
    FakeXhr.last.onerror?.();
    await expect(done).rejects.toThrow(tz("common.networkError"));
  });
});
