import { getLang, tr } from "../i18n/translate.ts";
import type {
  ArchiveListing,
  Device,
  DirUsage,
  ErrorResponse,
  ExtractResult,
  FileEntry,
  FileStat,
  OkResult,
  PullResult,
  RootCheckResult,
  StorageInfo,
  TextPreview,
} from "../types.ts";

/** 当前操作的设备；root 为 true 时后端以 root 身份执行 */
export interface Target {
  serial: string;
  root: boolean;
}

let rootLostListener: ((message: string) => void) | null = null;

/** 后端发现 root 权限失效（root_lost）时回调 */
export function onRootLost(fn: (message: string) => void) {
  rootLostListener = fn;
}

/** 响应可能不是后端生成的 JSON（例如代理返回的错误页），字段都按可缺省处理 */
function fail(data: Partial<ErrorResponse>, status: number) {
  const message = data.error ?? `HTTP ${status}`;
  if (data.code === "root_lost") rootLostListener?.(message);
  return new Error(message);
}

/** 让后端按界面语言返回错误信息 */
const langHeaders = (extra?: HeadersInit) => ({ ...(extra as Record<string, string>), "X-Lang": getLang() });

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: langHeaders(init?.headers) });
  const data = await res.json().catch((): ErrorResponse => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw fail(data, res.status);
  return data as T;
}

const post = <T>(url: string, body: unknown) =>
  request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const qs = (t: Target, extra: Record<string, string> = {}) =>
  new URLSearchParams({ serial: t.serial, ...(t.root ? { root: "1" } : {}), ...extra });

export const api = {
  devices: () => request<Device[]>("/api/devices"),
  reconnectDevices: () => post<OkResult>("/api/devices/reconnect", {}),
  restartAdb: () => post<OkResult>("/api/devices/restart-server", {}),

  rootCheck: (serial: string) => post<RootCheckResult>("/api/root-check", { serial }),

  storage: (serial: string) => request<StorageInfo>(`/api/storage?${new URLSearchParams({ serial })}`),

  ls: (t: Target, path: string) => request<FileEntry[]>(`/api/ls?${qs(t, { path })}`),

  mkdir: (t: Target, path: string) => post<OkResult>("/api/mkdir", { ...t, path }),

  rename: (t: Target, from: string, to: string) => post<OkResult>("/api/rename", { ...t, from, to }),

  remove: (t: Target, paths: string[]) => post<OkResult>("/api/delete", { ...t, paths }),

  copy: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/copy", { ...t, paths, dest }),

  move: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/move", { ...t, paths, dest }),

  /** 图片、视频、音频的地址，直接用作媒体元素的 src */
  previewUrl: (t: Target, path: string) => `/api/preview?${qs(t, { path })}`,

  stat: (t: Target, path: string) => request<FileStat>(`/api/stat?${qs(t, { path })}`),

  /** 文件夹的递归统计，目录大时较慢，可用 signal 取消 */
  usage: (t: Target, path: string, signal?: AbortSignal) =>
    request<DirUsage>(`/api/usage?${qs(t, { path })}`, { signal }),

  chmod: (t: Target, paths: string[], mode: string, recursive: boolean) =>
    post<OkResult>("/api/chmod", { ...t, paths, mode, recursive }),

  /** owner 和 group 至少给一个 */
  chown: (t: Target, paths: string[], owner: string | undefined, group: string | undefined, recursive: boolean) =>
    post<OkResult>("/api/chown", { ...t, paths, owner, group, recursive }),

  /** 以文本读取文件开头，不是 UTF-8 文本时为 binary */
  text: (t: Target, path: string) => request<TextPreview>(`/api/text?${qs(t, { path })}`),

  /** 压缩包里的条目 */
  archive: (t: Target, path: string) => request<ArchiveListing>(`/api/archive?${qs(t, { path })}`),

  /** 在设备上解压，返回解出的文件夹或文件；耗时随压缩包大小而定 */
  extract: (t: Target, path: string) => post<ExtractResult>("/api/extract", { ...t, path }),

  /** adb pull 到电脑，然后触发浏览器下载 */
  async download(t: Target, paths: string[]) {
    const { token } = await post<PullResult>("/api/pull", { ...t, paths });
    const a = document.createElement("a");
    a.href = `/api/fetch/${token}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  /** 上传：先从浏览器传到电脑（有进度），再由电脑 adb push 到手机 */
  upload(t: Target, dest: string, files: { file: File; path: string }[], onProgress: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append("paths", JSON.stringify(files.map((f) => f.path)));
      for (const f of files) form.append("files", f.file, "blob");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload?${qs(t, { path: dest })}`);
      xhr.setRequestHeader("X-Lang", getLang());
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status < 300) return resolve();
        let data: Partial<ErrorResponse> = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* 非 JSON 响应 */
        }
        reject(fail(data, xhr.status));
      };
      xhr.onerror = () => reject(new Error(tr("common.networkError")));
      xhr.send(form);
    });
  },
};
