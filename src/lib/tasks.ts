import type { JobPhase, JobSnapshot, Task, TaskStatus } from "../types.ts";

/** 任务阶段对应的卡片状态 */
const PHASE_STATUS: Record<JobPhase, TaskStatus> = {
  preparing: "preparing",
  pulling: "pulling",
  compressing: "compressing",
  pushing: "pushing",
  installing: "installing",
};

/** 把任务快照转为卡片补丁：阶段对应状态，进度原样，当前阶段不可取消时去掉取消按钮；任务已结束时为 undefined */
export function jobTaskPatch(snap: JobSnapshot): Partial<Task> | undefined {
  if (snap.state !== "running") return undefined;
  return {
    ...(snap.phase ? { status: PHASE_STATUS[snap.phase] } : {}),
    progress: snap.progress,
    ...(snap.cancelable ? {} : { cancel: undefined }),
  };
}
