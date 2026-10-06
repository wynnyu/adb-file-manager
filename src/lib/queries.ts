import { QueryClient, queryOptions, skipToken } from "@tanstack/react-query";
import { api, type Target } from "./api.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    // 读不了的目录重试也没用；切回窗口不自动刷新，刷新只在进入目录、点刷新和增删改之后
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

/** 某台设备上全部目录列表的键前缀，增删改之后用它让缓存过期 */
export const lsDeviceKey = (serial: string) => ["ls", serial] as const;

/** 某个目录的内容；target 为 null 时不请求 */
export const lsQuery = (target: Target | null, path: string) =>
  queryOptions({
    queryKey: ["ls", target?.serial ?? null, target?.root ?? false, path] as const,
    queryFn: target ? () => api.ls(target, path) : skipToken,
  });

/** 查看器里显示的文本；关闭后不保留，重新打开时重新读取 */
export const textQuery = (target: Target, path: string) =>
  queryOptions({
    queryKey: ["text", target.serial, target.root, path] as const,
    queryFn: () => api.text(target, path),
    gcTime: 0,
  });

/** 属性页的基本信息；关闭后不保留，每次打开都重新读取 */
export const statQuery = (target: Target, path: string) =>
  queryOptions({
    queryKey: ["stat", target.serial, target.root, path] as const,
    queryFn: () => api.stat(target, path),
    gcTime: 0,
  });

/** 打开属性页后等待这么久才开始递归统计，快速关闭时不去打扰设备 */
export const USAGE_DELAY = 500;

/** 等待 ms 毫秒；signal 被取消时立即结束并抛出 */
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** 文件夹的递归统计；先等待 USAGE_DELAY，关闭属性页时随查询一起取消，等待中取消则不会发出请求 */
export const usageQuery = (target: Target, path: string) =>
  queryOptions({
    queryKey: ["usage", target.serial, target.root, path] as const,
    queryFn: async ({ signal }) => {
      await wait(USAGE_DELAY, signal);
      return api.usage(target, path, signal);
    },
    gcTime: 0,
  });
