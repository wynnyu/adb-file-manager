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
