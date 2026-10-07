import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tz } from "../test/utils.tsx";
import type { JobSnapshot } from "../types.ts";
import { api, JobCanceled, onRootLost } from "./api.ts";

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
