import { getLang, tr } from "../i18n/translate.ts";
import type { Device, ErrorResponse, FileEntry, OkResult, PullResult, RootCheckResult, StorageInfo } from "../types.ts";

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

  rootCheck: (serial: string) => post<RootCheckResult>("/api/root-check", { serial }),

  storage: (serial: string) => request<StorageInfo>(`/api/storage?${new URLSearchParams({ serial })}`),

  ls: (t: Target, path: string) => request<FileEntry[]>(`/api/ls?${qs(t, { path })}`),

  mkdir: (t: Target, path: string) => post<OkResult>("/api/mkdir", { ...t, path }),

  rename: (t: Target, from: string, to: string) => post<OkResult>("/api/rename", { ...t, from, to }),

  remove: (t: Target, paths: string[]) => post<OkResult>("/api/delete", { ...t, paths }),

  copy: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/copy", { ...t, paths, dest }),

  move: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/move", { ...t, paths, dest }),

  previewUrl: (t: Target, path: string) => `/api/preview?${qs(t, { path })}`,

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
