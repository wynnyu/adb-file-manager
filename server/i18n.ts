import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

type Lang = "zh" | "en";

const zh = {
  adbFailed: "adb 执行失败",
  pathNotAbsolute: "路径必须是绝对路径",
  noSu: "这台设备没有 root（找不到 su）",
  suNotRoot: "su 没有切换到 root（uid={uid}）",
  rootDenied: "无法获取 root 权限：{msg}。请在手机的 root 管理器里给 Shell 授权",
  suRefused: "su 被拒绝",
  noDir: "目录不存在：{path}",
  noReadRoot: "没有权限读取：{path}",
  noRead: "没有权限读取 {path}，可以开启 root 模式后再试",
  noFile: "文件不存在：{path}",
  targetExists: "目标已存在",
  noStorage: "无法读取存储空间",
  missingSerial: "缺少 serial 参数",
  missingPaths: "缺少 paths 参数",
  protectedPath: "为安全起见，不允许删除或移动 {shown}",
  resolvesTo: "{path}（即 {real}）",
  noFilesReceived: "没有收到文件",
  downloadExpired: "下载已过期，请重试",
  intoItself: "不能把 {name} 放进它自己里面",
  notPreviewable: "不支持预览这种文件",
};

export type MsgKey = keyof typeof zh;

const en: Record<MsgKey, string> = {
  adbFailed: "adb command failed",
  pathNotAbsolute: "Path must be absolute",
  noSu: "This device is not rooted (su not found)",
  suNotRoot: "su did not switch to root (uid={uid})",
  rootDenied: "Could not get root: {msg}. Grant Shell access in your phone's root manager",
  suRefused: "su was denied",
  noDir: "Directory not found: {path}",
  noReadRoot: "Permission denied reading: {path}",
  noRead: "Permission denied reading {path}. Try enabling root mode",
  noFile: "File not found: {path}",
  targetExists: "Target already exists",
  noStorage: "Could not read storage info",
  missingSerial: "Missing serial parameter",
  missingPaths: "Missing paths parameter",
  protectedPath: "For safety, deleting or moving {shown} is not allowed",
  resolvesTo: "{path} (resolves to {real})",
  noFilesReceived: "No files received",
  downloadExpired: "Download expired, please try again",
  intoItself: "Can't put {name} inside itself",
  notPreviewable: "This file type can't be previewed",
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
