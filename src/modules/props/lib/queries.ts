import { queryOptions, skipToken } from "@tanstack/react-query";
import { api, type Target } from "../../../lib/index.ts";

/** 属性列表的查询键前缀；修改或删除后按它让某台设备的列表失效（root 与否的缓存都会失效） */
export const propsKey = (serial: string) => ["props", serial] as const;

/** 某台设备的属性列表；root 模式下能看到更多属性并检测 resetprop，所以 root 也在键里。target 为 null 时不请求 */
export const propsQuery = (target: Target | null) =>
  queryOptions({
    queryKey: [...propsKey(target?.serial ?? ""), target?.root ?? false] as const,
    queryFn: target ? () => api.props(target) : skipToken,
  });
