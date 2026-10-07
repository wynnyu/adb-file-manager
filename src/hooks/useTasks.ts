import { useCallback, useState } from "react";
import type { Task } from "../types.ts";

/** 传输队列：完成的任务 4 秒后自动移除，失败的和带说明的留到手动关闭 */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const startTask = useCallback((t: Omit<Task, "id">) => {
    const id = crypto.randomUUID();
    setTasks((list) => [...list, { ...t, id }]);
    return id;
  }, []);

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    if (patch.status === "done" && !patch.note) {
      setTimeout(() => setTasks((list) => list.filter((t) => t.id !== id)), 4000);
    }
  }, []);

  const dismissTask = useCallback((id: string) => setTasks((list) => list.filter((t) => t.id !== id)), []);

  return { tasks, startTask, patchTask, dismissTask };
}

export type Tasks = ReturnType<typeof useTasks>;
