import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { type Request, type Response, Router } from "express";
import type { JobPhase, JobRef, JobSnapshot, OkResult } from "../shared/types.d.ts";
import * as adb from "./adb.ts";
import { msg } from "./i18n.ts";
import { rootGuard, wrap } from "./request.ts";

/** progress 推送的最小间隔（毫秒） */
const PROGRESS_INTERVAL = 250;
/** 保留的日志行数 */
const LOG_LIMIT = 500;
/** 结束后保留多久（毫秒），让晚到的订阅者还能读到结果 */
const RETAIN = 60_000;
/** SSE 保活注释的间隔（毫秒） */
const PING_INTERVAL = 15_000;

/** 交给任务函数的句柄 */
export interface JobHandle {
  /** 取消时触发，传给 adb 调用或其他可中断的操作 */
  signal: AbortSignal;
  /** 进入新阶段，立即推送；进度清零；cancelable 缺省为 true */
  phase(phase: JobPhase, opts?: { cancelable?: boolean }): void;
  /** 0 到 1 的进度，推送有限流 */
  progress(fraction: number): void;
  /** 追加一行日志，只保留最近 LOG_LIMIT 行 */
  log(line: string): void;
}

interface Job {
  snap: JobSnapshot;
  logs: string[];
  controller: AbortController;
  events: EventEmitter;
  /** 最近一次推送 state 的时间 */
  lastPush: number;
  /** 被限流压住的 progress 的待发定时器 */
  pending?: NodeJS.Timeout;
}

const jobs = new Map<string, Job>();

const push = (job: Job) => {
  clearTimeout(job.pending);
  job.pending = undefined;
  job.lastPush = Date.now();
  job.events.emit("state", { ...job.snap } satisfies JobSnapshot);
};

/** 任务当前的快照；任务不存在或已过期时为 undefined */
export const jobSnapshot = (id: string) => {
  const job = jobs.get(id);
  return job && ({ ...job.snap } satisfies JobSnapshot);
};

/** 已有的日志，按时间顺序 */
export const jobLogs = (id: string) => [...(jobs.get(id)?.logs ?? [])];

/**
 * 在后台执行 run，立即返回任务 id。要在请求的处理函数里调用：msg() 靠 AsyncLocalStorage 取语言，
 * 上下文会随异步延续传给 run，任务里的错误信息与发起请求的语言一致。
 * 成功为 done；signal 已取消时无论抛出什么都是 canceled；其他异常经 rootGuard 复查后为 error
 */
export function startJob<R>(req: Request, run: (job: JobHandle) => Promise<R>): JobRef {
  const id = randomUUID();
  const job: Job = {
    snap: { id, state: "running", cancelable: true },
    logs: [],
    controller: new AbortController(),
    events: new EventEmitter(),
    lastPush: 0,
  };
  jobs.set(id, job);

  const handle: JobHandle = {
    signal: job.controller.signal,
    phase(phase, opts = {}) {
      if (job.snap.state !== "running") return;
      job.snap = { ...job.snap, phase, progress: undefined, cancelable: opts.cancelable ?? true };
      push(job);
    },
    progress(fraction) {
      if (job.snap.state !== "running") return;
      job.snap.progress = Math.min(1, Math.max(0, fraction));
      if (job.pending) return;
      const wait = job.lastPush + PROGRESS_INTERVAL - Date.now();
      if (wait <= 0) push(job);
      else job.pending = setTimeout(() => push(job), wait);
    },
    log(line) {
      job.logs.push(line);
      if (job.logs.length > LOG_LIMIT) job.logs.shift();
      job.events.emit("log", line);
    },
  };

  const finish = (patch: Partial<JobSnapshot>) => {
    job.snap = {
      ...job.snap,
      ...patch,
      progress: patch.state === "done" ? undefined : job.snap.progress,
      cancelable: false,
    };
    push(job);
    setTimeout(() => jobs.delete(id), RETAIN).unref();
  };

  (async () => {
    try {
      finish({ state: "done", result: await run(handle) });
    } catch (e) {
      if (job.controller.signal.aborted) return finish({ state: "canceled" });
      const err = await rootGuard(req, e);
      finish({
        state: "error",
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof adb.AdbError ? err.code : undefined,
      });
    }
  })();
  return { id };
}

const jobOf = (req: Request) => {
  const job = jobs.get(String(req.params.id));
  if (!job) throw new adb.AdbError(msg("jobNotFound"), 404);
  return job;
};

/** 任务的进度推送（SSE）和取消 */
export function jobRoutes() {
  const router = Router();

  router.get(
    "/:id/events",
    wrap(async (req: Request, res: Response) => {
      const job = jobOf(req);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        // no-transform 避免代理改写或缓冲
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ping = setInterval(() => res.write(": ping\n\n"), PING_INTERVAL);
      const onState = (snap: JobSnapshot) => {
        send("state", snap);
        if (snap.state !== "running") end();
      };
      const onLog = (line: string) => send("log", line);
      const end = () => {
        clearInterval(ping);
        job.events.off("state", onState);
        job.events.off("log", onLog);
        res.end();
      };
      // 先发当前快照和已有日志，再接增量；这几步同步完成，期间不会漏事件
      send("state", job.snap);
      for (const line of job.logs) send("log", line);
      if (job.snap.state !== "running") return end();
      job.events.on("state", onState);
      job.events.on("log", onLog);
      req.on("close", end);
    }),
  );

  router.post(
    "/:id/cancel",
    wrap(async (req, res) => {
      const job = jobOf(req);
      if (job.snap.state === "running" && job.snap.cancelable) job.controller.abort();
      res.json({ ok: true } satisfies OkResult);
    }),
  );

  return router;
}
