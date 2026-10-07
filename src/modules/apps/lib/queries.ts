import { queryOptions, skipToken } from "@tanstack/react-query";
import { api } from "../../../lib/index.ts";

/** 某台设备的应用列表；serial 为 null 时不请求。S7 的操作完成后让它和 appQuery 失效 */
export const appsQuery = (serial: string | null) =>
  queryOptions({
    queryKey: ["apps", serial] as const,
    queryFn: serial ? () => api.apps(serial) : skipToken,
  });

/** 单个应用的详情 */
export const appQuery = (serial: string, pkg: string) =>
  queryOptions({
    queryKey: ["app", serial, pkg] as const,
    queryFn: () => api.appInfo(serial, pkg),
  });
