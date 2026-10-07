import { getLang, tr } from "../i18n/translate.ts";
import type {
  AppDetail,
  AppEntry,
  AppUninstallRequest,
  ArchiveFormat,
  ArchiveListing,
  DeviceList,
  DirUsage,
  ErrorResponse,
  ExtractResult,
  FileEntry,
  FileStat,
  JobRef,
  JobSnapshot,
  OkResult,
  PullResult,
  RootCheckResult,
  StorageInfo,
  TextPreview,
  UploadResult,
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

/** 任务被取消时 watchJob 抛出的错误，调用方据此区分取消和失败 */
export class JobCanceled extends Error {
  constructor() {
    super(tr("task.canceled"));
    this.name = "JobCanceled";
  }
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

/** 应用操作的接口名，对应 POST /api/apps/<action> */
export type AppAction = "uninstall" | "uninstall-updates" | "restore" | "disable" | "enable" | "force-stop" | "clear";

/** 任务启动后的回调：onJob 给出任务 id（用于取消），onUpdate 在任务状态变化时调用 */
export interface JobHooks<R> {
  onJob?: (id: string) => void;
  onUpdate?: (snap: JobSnapshot<R>) => void;
}

/**
 * 以 multipart 表单 POST，上传阶段回调进度（0 到 1）。响应体为 JSON 时解析后返回；
 * signal 触发时中止上传并抛出 JobCanceled
 */
function xhrForm<T>(url: string, form: FormData, onProgress: (p: number) => void, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Lang", getLang());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: unknown = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* 非 JSON 响应 */
      }
      if (xhr.status < 300) return resolve(data as T);
      reject(fail(data as Partial<ErrorResponse>, xhr.status));
    };
    xhr.onerror = () => reject(new Error(tr("common.networkError")));
    xhr.onabort = () => reject(new JobCanceled());
    if (signal?.aborted) return reject(new JobCanceled());
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** 触发浏览器下载一次性 token 对应的文件 */
function saveFile(token: string) {
  const a = document.createElement("a");
  a.href = `/api/files/fetch/${token}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** 启动一个产出 PullResult 的任务，等它完成后触发浏览器下载 */
async function saveFromJob(start: () => Promise<JobRef>, hooks: JobHooks<PullResult> = {}) {
  const { id } = await start();
  hooks.onJob?.(id);
  const { token } = await api.watchJob<PullResult>(id, (snap) => hooks.onUpdate?.(snap));
  saveFile(token);
}

export const api = {
  devices: () => request<DeviceList>("/api/devices"),
  reconnectDevices: () => post<OkResult>("/api/devices/reconnect", {}),
  restartAdb: () => post<OkResult>("/api/devices/restart-server", {}),

  rootCheck: (serial: string) => post<RootCheckResult>("/api/devices/root-check", { serial }),

  storage: (serial: string) => request<StorageInfo>(`/api/devices/storage?${new URLSearchParams({ serial })}`),

  apps: (serial: string) => request<AppEntry[]>(`/api/apps?${new URLSearchParams({ serial })}`),

  appInfo: (serial: string, pkg: string) =>
    request<AppDetail>(`/api/apps/info?${new URLSearchParams({ serial, pkg })}`),

  /** 对应用执行操作；目标是关键包时需带 force: true，否则返回 409 */
  appAction: (serial: string, action: AppAction, pkg: string, opts: Omit<AppUninstallRequest, "pkg"> = {}) =>
    post<OkResult>(`/api/apps/${action}`, { serial, pkg, ...opts }),

  /** 提取应用的 APK 并触发浏览器下载；分包应用得到可重新安装的 .apks */
  extractApk: (serial: string, pkg: string, hooks: JobHooks<PullResult> = {}) =>
    saveFromJob(() => post<JobRef>("/api/apps/extract", { serial, pkg }), hooks),

  /**
   * 上传安装包并启动安装任务，返回任务（结果为 InstallResult，用 watchJob 取得）。
   * 上传阶段有进度，signal 可取消上传；.apks 和 .xapk 只能单独一个
   */
  installApps(serial: string, files: File[], onProgress: (p: number) => void, signal?: AbortSignal) {
    const form = new FormData();
    form.append("names", JSON.stringify(files.map((f) => f.name)));
    for (const f of files) form.append("files", f, "blob");
    return xhrForm<JobRef>(`/api/apps/install?${new URLSearchParams({ serial })}`, form, onProgress, signal);
  },

  ls: (t: Target, path: string) => request<FileEntry[]>(`/api/files/ls?${qs(t, { path })}`),

  mkdir: (t: Target, path: string) => post<OkResult>("/api/files/mkdir", { ...t, path }),

  rename: (t: Target, from: string, to: string) => post<OkResult>("/api/files/rename", { ...t, from, to }),

  remove: (t: Target, paths: string[]) => post<OkResult>("/api/files/delete", { ...t, paths }),

  copy: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/files/copy", { ...t, paths, dest }),

  move: (t: Target, paths: string[], dest: string) => post<OkResult>("/api/files/move", { ...t, paths, dest }),

  /** 图片、视频、音频的地址，直接用作媒体元素的 src */
  previewUrl: (t: Target, path: string) => `/api/files/preview?${qs(t, { path })}`,

  stat: (t: Target, path: string) => request<FileStat>(`/api/files/stat?${qs(t, { path })}`),

  /** 文件夹的递归统计，目录大时较慢，可用 signal 取消 */
  usage: (t: Target, path: string, signal?: AbortSignal) =>
    request<DirUsage>(`/api/files/usage?${qs(t, { path })}`, { signal }),

  chmod: (t: Target, paths: string[], mode: string, recursive: boolean) =>
    post<OkResult>("/api/files/chmod", { ...t, paths, mode, recursive }),

  /** owner 和 group 至少给一个 */
  chown: (t: Target, paths: string[], owner: string | undefined, group: string | undefined, recursive: boolean) =>
    post<OkResult>("/api/files/chown", { ...t, paths, owner, group, recursive }),

  /** 以文本读取文件开头，不是 UTF-8 文本时为 binary */
  text: (t: Target, path: string) => request<TextPreview>(`/api/files/text?${qs(t, { path })}`),

  /** 压缩包里的条目 */
  archive: (t: Target, path: string) => request<ArchiveListing>(`/api/files/archive?${qs(t, { path })}`),

  /** 在设备上解压，返回解出的文件夹或文件；耗时随压缩包大小而定 */
  extract: (t: Target, path: string) => post<ExtractResult>("/api/files/extract", { ...t, path }),

  /**
   * 启动压缩任务，结果（CompressResult）用 watchJob 取得；压缩到所选项的公共父目录。
   * zip 在电脑上生成，需要经过电脑中转，耗时随大小而定
   */
  compress: (t: Target, paths: string[], format: ArchiveFormat) =>
    post<JobRef>("/api/files/compress", { ...t, paths, format }),

  /** 启动下载任务，结果（PullResult）用 watchJob 取得 */
  pull: (t: Target, paths: string[]) => post<JobRef>("/api/files/pull", { ...t, paths }),

  /**
   * 订阅任务的进度（SSE），每次状态变化回调一次快照。done 时返回结果，error 时抛出错误（root_lost 同时通知
   * onRootLost），canceled 时抛出 JobCanceled。连接断开且无法重连时抛出网络错误；重连期间继续等待，
   * 服务端会在重连后重发当前快照
   */
  watchJob<R>(id: string, onUpdate: (snap: JobSnapshot<R>) => void) {
    return new Promise<R>((resolve, reject) => {
      const source = new EventSource(`/api/jobs/${id}/events`);
      source.addEventListener("state", (e) => {
        const snap = JSON.parse((e as MessageEvent<string>).data) as JobSnapshot<R>;
        onUpdate(snap);
        if (snap.state === "running") return;
        source.close();
        if (snap.state === "done") resolve(snap.result as R);
        else if (snap.state === "canceled") reject(new JobCanceled());
        else reject(fail({ error: snap.error, code: snap.code }, 500));
      });
      source.onerror = () => {
        if (source.readyState !== EventSource.CLOSED) return;
        reject(new Error(tr("common.networkError")));
      };
    });
  },

  cancelJob: (id: string) => post<OkResult>(`/api/jobs/${id}/cancel`, {}),

  /**
   * adb pull 到电脑，然后触发浏览器下载。onJob 在任务启动后回调任务 id（用于取消），
   * onUpdate 在任务状态变化时回调
   */
  download(t: Target, paths: string[], hooks: JobHooks<PullResult> = {}) {
    return saveFromJob(() => api.pull(t, paths), hooks);
  },

  /** 上传：先从浏览器传到电脑（有进度），再由电脑 adb push 到手机 */
  async upload(t: Target, dest: string, files: { file: File; path: string }[], onProgress: (p: number) => void) {
    const form = new FormData();
    form.append("paths", JSON.stringify(files.map((f) => f.path)));
    for (const f of files) form.append("files", f.file, "blob");
    await xhrForm<UploadResult>(`/api/files/upload?${qs(t, { path: dest })}`, form, onProgress);
  },
};
