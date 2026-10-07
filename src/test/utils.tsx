import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { type Shell, ShellContext } from "../hooks/useShell.ts";
import type { MessageKey } from "../i18n/index.tsx";
import { format, I18nProvider, type Params } from "../i18n/index.tsx";
import type { FileEntry } from "../types.ts";

/** 中文界面上的文案；测试里的期望值从词典取，改文案时不用跟着改测试 */
export const tz = (key: MessageKey, params?: Params) => format("zh", key, params);

/** 构造一个条目，名称取路径最后一段 */
export function file(path: string, patch: Partial<FileEntry> = {}): FileEntry {
  return {
    name: path.slice(path.lastIndexOf("/") + 1),
    path,
    type: "file",
    isDir: false,
    size: 0,
    mtime: 0,
    atime: 0,
    ...patch,
  };
}

export const folder = (path: string, patch: Partial<FileEntry> = {}) =>
  file(path, { type: "dir", isDir: true, ...patch });

/** 和 lib/queries.ts 的默认设置一致：不重试，切回窗口不刷新 */
export const newQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

/** renderHook / render 用的外层：语言，以及可选的查询缓存 */
export function providers(client?: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    const inner = <I18nProvider>{children}</I18nProvider>;
    return client ? <QueryClientProvider client={client}>{inner}</QueryClientProvider> : inner;
  };
}

/** 可以从外部决定何时完成的 Promise */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 提供外壳状态的外层：只填测试用到的字段，其余缺省；在 providers 之内再包一层 ShellContext */
export function shellProviders(shell: Partial<Shell>, client: QueryClient = newQueryClient()) {
  const Base = providers(client);
  return function ShellProviders({ children }: { children: ReactNode }) {
    return (
      <Base>
        <ShellContext.Provider value={shell as Shell}>{children}</ShellContext.Provider>
      </Base>
    );
  };
}
