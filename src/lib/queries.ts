import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    // 读不了的目录重试也没用；切回窗口不自动刷新，刷新只在进入目录、点刷新和增删改之后
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});
