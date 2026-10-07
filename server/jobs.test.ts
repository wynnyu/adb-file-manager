import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Request, Response } from "express";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { JobSnapshot } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { createApp } from "./app.ts";
import { langMiddleware, msg } from "./i18n.ts";
import { type JobHandle, jobLogs, jobSnapshot, startJob } from "./jobs.ts";

vi.mock("./adb.ts", async (orig) => ({ ...(await orig<typeof import("./adb.ts")>()), rootMethod: vi.fn() }));

const plainReq = { query: {}, body: {} } as Request;
const rootReq = { query: { root: "1", serial: "S1" }, body: {} } as unknown as Request;

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** 等任务离开 running */
const settled = async (id: string) => {
  while (jobSnapshot(id)?.state === "running") await sleep(1);
  return jobSnapshot(id) as JobSnapshot;
};

let server: Server;
let base: string;

beforeAll(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => vi.restoreAllMocks());

interface SseEvent {
  event: string;
  data: unknown;
}

/** 读完整个 SSE 流（任务结束后服务端会关闭连接），按事件解析；注释行（保活）忽略 */
async function readEvents(id: string) {
  const res = await fetch(`${base}/api/jobs/${id}/events`);
  expect(res.headers.get("content-type")).toBe("text/event-stream");
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((block) => block.startsWith("event:"))
    .map((block): SseEvent => {
      const [event, data] = block.split("\n").map((l) => l.slice(l.indexOf(": ") + 2));
      return { event, data: JSON.parse(data) };
    });
}

describe("startJob", () => {
  it("立即返回 id，成功后为 done 并带结果", async () => {
    const gate = deferred<string>();
    const { id } = startJob(plainReq, () => gate.promise);
    expect(jobSnapshot(id)).toEqual({ id, state: "running", cancelable: true });
    gate.resolve("ok");
    expect(await settled(id)).toMatchObject({ state: "done", result: "ok", cancelable: false });
  });

  it("phase 切换阶段并清零进度，cancelable 缺省为 true", async () => {
    const gate = deferred();
    const { id } = startJob(plainReq, async (job) => {
      job.phase("pulling");
      job.progress(0.4);
      job.phase("pushing", { cancelable: false });
      await gate.promise;
    });
    expect(jobSnapshot(id)).toMatchObject({ phase: "pushing", progress: undefined, cancelable: false });
    gate.resolve();
    await settled(id);
  });

  it("progress 限制在 0 到 1", async () => {
    const gate = deferred();
    const { id } = startJob(plainReq, async (job) => {
      job.progress(3);
      await gate.promise;
    });
    expect(jobSnapshot(id)?.progress).toBe(1);
    gate.resolve();
    await settled(id);
  });

  it("日志只保留最近 500 行", async () => {
    const { id } = startJob(plainReq, async (job) => {
      for (let i = 0; i < 520; i++) job.log(`line ${i}`);
    });
    await settled(id);
    const logs = jobLogs(id);
    expect(logs).toHaveLength(500);
    expect(logs[0]).toBe("line 20");
    expect(logs.at(-1)).toBe("line 519");
  });

  it("异常为 error，带 message 和 code", async () => {
    const { id } = startJob(plainReq, async () => {
      throw new adb.AdbError("设备断开", 500, "no_root");
    });
    expect(await settled(id)).toMatchObject({ state: "error", error: "设备断开", code: "no_root", cancelable: false });
  });

  it("非 Error 的异常也转为字符串", async () => {
    const { id } = startJob(plainReq, async () => {
      throw "boom";
    });
    expect(await settled(id)).toMatchObject({ state: "error", error: "boom" });
  });

  it("root 请求失败后 su 已失效，转为 root_lost", async () => {
    vi.mocked(adb.rootMethod).mockRejectedValue(new adb.AdbError("无 su", 403, "no_root"));
    const { id } = startJob(rootReq, async () => {
      throw new adb.AdbError("Permission denied");
    });
    expect(await settled(id)).toMatchObject({ state: "error", code: "root_lost" });
  });

  it("root 请求失败但 su 仍可用，保持原错误", async () => {
    vi.mocked(adb.rootMethod).mockResolvedValue("su");
    const { id } = startJob(rootReq, async () => {
      throw new adb.AdbError("Permission denied");
    });
    const snap = await settled(id);
    expect(snap).toMatchObject({ state: "error", error: "Permission denied" });
    expect(snap.code).toBeUndefined();
  });

  it("错误信息沿用发起请求的语言", async () => {
    let id = "";
    langMiddleware({ get: (h: string) => (h === "x-lang" ? "en" : undefined) } as Request, {} as Response, () => {
      id = startJob(plainReq, async () => {
        await sleep(1);
        throw new adb.AdbError(msg("noFilesReceived"), 400);
      }).id;
    });
    expect(await settled(id)).toMatchObject({ error: "No files received" });
  });

  it("取消后无论 run 抛出什么都是 canceled", async () => {
    const started = deferred();
    const { id } = startJob(plainReq, async (job) => {
      started.resolve();
      await new Promise((_, reject) => job.signal.addEventListener("abort", () => reject(new Error("其他错误"))));
    });
    await started.promise;
    const res = await fetch(`${base}/api/jobs/${id}/cancel`, { method: "POST" });
    expect(await res.json()).toEqual({ ok: true });
    expect(await settled(id)).toMatchObject({ state: "canceled", cancelable: false });
  });

  it("阶段不允许取消时 cancel 不生效", async () => {
    const gate = deferred();
    let signal: AbortSignal | undefined;
    const { id } = startJob(plainReq, async (job) => {
      signal = job.signal;
      job.phase("pushing", { cancelable: false });
      await gate.promise;
      return "done";
    });
    await fetch(`${base}/api/jobs/${id}/cancel`, { method: "POST" });
    expect(signal?.aborted).toBe(false);
    gate.resolve();
    expect(await settled(id)).toMatchObject({ state: "done", result: "done" });
  });

  it("结束后保留 60 秒，之后从表中删除", async () => {
    vi.useFakeTimers();
    try {
      const { id } = startJob(plainReq, async () => 1);
      await vi.advanceTimersByTimeAsync(0);
      expect(jobSnapshot(id)?.state).toBe("done");
      await vi.advanceTimersByTimeAsync(59_000);
      expect(jobSnapshot(id)).toBeDefined();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(jobSnapshot(id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("结束后的 progress 和 phase 调用被忽略", async () => {
    let handle: JobHandle | undefined;
    const { id } = startJob(plainReq, async (job) => {
      handle = job;
    });
    await settled(id);
    handle?.phase("pulling");
    handle?.progress(0.5);
    const snap = jobSnapshot(id);
    expect(snap?.state).toBe("done");
    expect(snap?.phase).toBeUndefined();
    expect(snap?.progress).toBeUndefined();
  });
});

describe("GET /api/jobs/:id/events", () => {
  it("未知 id 返回 404", async () => {
    const res = await fetch(`${base}/api/jobs/nope/events`, { headers: { "x-lang": "zh" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: msg("jobNotFound") });
  });

  it("任务结束后订阅：回放快照和日志，随即关闭", async () => {
    const { id } = startJob(plainReq, async (job) => {
      job.log("a");
      job.log("b\nc");
      return { path: "/x" };
    });
    await settled(id);
    const events = await readEvents(id);
    expect(events.map((e) => e.event)).toEqual(["state", "log", "log"]);
    expect(events[0].data).toMatchObject({ id, state: "done", result: { path: "/x" } });
    expect(events.slice(1).map((e) => e.data)).toEqual(["a", "b\nc"]);
  });

  it("运行中订阅：先收到当前状态和日志，再收到增量，结束时发最后一个 state", async () => {
    const gate = deferred();
    const { id } = startJob(plainReq, async (job) => {
      job.phase("pulling");
      job.log("start");
      await gate.promise;
      job.log("end");
      return 7;
    });
    const reading = readEvents(id);
    await sleep(50);
    gate.resolve();
    const events = await reading;
    expect(events.map((e) => e.event)).toEqual(["state", "log", "log", "state"]);
    expect(events[0].data).toMatchObject({ state: "running", phase: "pulling" });
    expect(events[2].data).toBe("end");
    expect(events[3].data).toMatchObject({ state: "done", result: 7 });
  });

  it("progress 限流：短时间内的多次更新合并，最终值不丢", async () => {
    const gate = deferred();
    const { id } = startJob(plainReq, async (job) => {
      await gate.promise;
      for (let i = 1; i <= 50; i++) job.progress(i / 100);
      await sleep(400);
    });
    const reading = readEvents(id);
    await sleep(50);
    gate.resolve();
    const states = (await reading).filter((e) => e.event === "state").map((e) => e.data as JobSnapshot);
    const progressed = states.filter((s) => s.state === "running" && s.progress != null);
    expect(progressed.length).toBeLessThanOrEqual(3);
    expect(progressed.at(-1)?.progress).toBe(0.5);
  });
});

describe("POST /api/jobs/:id/cancel", () => {
  it("未知 id 返回 404", async () => {
    const res = await fetch(`${base}/api/jobs/nope/cancel`, { method: "POST", headers: { "x-lang": "zh" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: msg("jobNotFound") });
  });
});
