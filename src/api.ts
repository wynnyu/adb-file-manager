import type { Device, FileEntry } from "./types.ts";

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

function fail(data: { error?: string; code?: string }, status: number) {
  const message = data.error ?? `HTTP ${status}`;
  if (data.code === "root_lost") rootLostListener?.(message);
  return new Error(message);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
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

  rootCheck: (serial: string) => post<{ method: "adbd" | "su" }>("/api/root-check", { serial }),

  storage: (serial: string) =>
    request<{ total: number; free: number }>(`/api/storage?${new URLSearchParams({ serial })}`),

  ls: (t: Target, path: string) => request<FileEntry[]>(`/api/ls?${qs(t, { path })}`),

  mkdir: (t: Target, path: string) => post("/api/mkdir", { ...t, path }),

  rename: (t: Target, from: string, to: string) => post("/api/rename", { ...t, from, to }),

  remove: (t: Target, paths: string[]) => post("/api/delete", { ...t, paths }),

  /** adb pull 到电脑，然后触发浏览器下载 */
  async download(t: Target, paths: string[]) {
    const { token } = await post<{ token: string; name: string }>("/api/pull", { ...t, paths });
    const a = document.createElement("a");
    a.href = `/api/fetch/${token}`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  /** 上传：浏览器 → 电脑（有进度），然后电脑 adb push → 手机 */
  upload(t: Target, dest: string, files: { file: File; path: string }[], onProgress: (p: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append("paths", JSON.stringify(files.map((f) => f.path)));
      for (const f of files) form.append("files", f.file, "blob");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/upload?${qs(t, { path: dest })}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        if (xhr.status < 300) return resolve();
        let data = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* 非 JSON 响应 */
        }
        reject(fail(data, xhr.status));
      };
      xhr.onerror = () => reject(new Error("网络错误"));
      xhr.send(form);
    });
  },
};
