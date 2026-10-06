import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

type Lang = "zh" | "en";

const zh = {
  adbFailed: "adb 执行失败",
  pathNotAbsolute: "路径必须是绝对路径",
  noSu: "未找到 su，无法以 root 身份执行操作",
  suNotRoot: "su 未能切换到 root（uid={uid}）",
  rootDenied: "无法获取 root 权限：{msg}。请在设备的 root 管理器中为 Shell 授权",
  suRefused: "su 被拒绝",
  noDir: "目录不存在：{path}",
  noReadRoot: "无读取权限：{path}",
  noRead: "无读取权限：{path}。可开启 root 模式后重试",
  noFile: "文件不存在：{path}",
  targetExists: "目标已存在",
  noStorage: "无法读取存储空间",
  missingSerial: "缺少 serial 参数",
  missingPaths: "缺少 paths 参数",
  badUploadPaths: "paths 参数必须是路径数组的 JSON 字符串",
  protectedPath: "为安全起见，不允许删除或移动 {shown}",
  resolvesTo: "{path}（即 {real}）",
  noFilesReceived: "未收到文件",
  downloadExpired: "下载已过期，请重试",
  intoItself: "无法将 {name} 移动或拷贝到其自身内部",
  notPreviewable: "不支持预览此类型的文件",
  badRange: "请求的范围超出文件大小",
  forbiddenHost: "仅允许从本机访问",
  forbiddenOrigin: "拒绝来自其他网页的请求",
  badMode: "权限必须是 3 到 4 位八进制数字，例如 755",
  badOwner: "所有者和用户组只能包含字母、数字、下划线、点和连字符",
  missingOwner: "至少需要指定所有者或用户组之一",
  protectedChange: "为安全起见，不允许修改 {shown} 的权限或所有者",
  notDir: "不是目录：{path}",
  notArchive: "不支持的压缩包格式",
  archiveToolMissing: "设备上没有 {tool} 命令，无法处理此压缩包",
  unsafeArchive: "压缩包含有指向目录之外的路径，已拒绝解压",
};

export type MsgKey = keyof typeof zh;

const en: Record<MsgKey, string> = {
  adbFailed: "adb command failed",
  pathNotAbsolute: "Path must be absolute",
  noSu: "su not found. Operations cannot run as root",
  suNotRoot: "su did not switch to root (uid={uid})",
  rootDenied: "Failed to obtain root access: {msg}. Grant root access to Shell in the root manager on the device",
  suRefused: "su was denied",
  noDir: "Directory not found: {path}",
  noReadRoot: "Permission denied reading: {path}",
  noRead: "Permission denied reading {path}. Enable root mode to access it",
  noFile: "File not found: {path}",
  targetExists: "Target already exists",
  noStorage: "Could not read storage info",
  missingSerial: "Missing serial parameter",
  missingPaths: "Missing paths parameter",
  badUploadPaths: "The paths parameter must be a JSON-encoded array of paths",
  protectedPath: "For safety, deleting or moving {shown} is not allowed",
  resolvesTo: "{path} (resolves to {real})",
  noFilesReceived: "No files received",
  downloadExpired: "Download expired. Please try again",
  intoItself: "Cannot move or copy {name} into itself",
  notPreviewable: "Preview is not supported for this file type",
  badRange: "Requested range is outside the file",
  forbiddenHost: "Only local access is allowed",
  forbiddenOrigin: "Requests from other pages are rejected",
  badMode: "Mode must be 3 to 4 octal digits, for example 755",
  badOwner: "Owner and group may only contain letters, digits, underscores, dots and hyphens",
  missingOwner: "Specify at least one of owner and group",
  protectedChange: "For safety, changing the permissions or owner of {shown} is not allowed",
  notDir: "Not a directory: {path}",
  notArchive: "Unsupported archive format",
  archiveToolMissing: "The {tool} command is not available on the device, so this archive cannot be processed",
  unsafeArchive: "The archive contains paths that point outside the target folder. Extraction was rejected",
};

const DICTS: Record<Lang, Record<MsgKey, string>> = { zh, en };
const store = new AsyncLocalStorage<Lang>();

function pick(req: Request): Lang {
  const explicit = req.get("x-lang");
  if (explicit === "zh" || explicit === "en") return explicit;
  return /^\s*zh/i.test(req.get("accept-language") ?? "") ? "zh" : "en";
}

/** 按请求头里的界面语言（X-Lang，缺省看 Accept-Language）决定本次请求的错误信息语言 */
export const langMiddleware = (req: Request, _res: Response, next: NextFunction) => store.run(pick(req), next);

/** 取当前请求语言的文案；请求上下文之外退回中文 */
export function msg(key: MsgKey, params: Record<string, string | number> = {}) {
  const tpl = DICTS[store.getStore() ?? "zh"][key];
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}
