import { useQueryClient } from "@tanstack/react-query";
import { Eraser, PowerOff, ShieldAlert, Trash2, Undo2 } from "lucide-react";
import { useCallback } from "react";
import { useShell } from "../../../hooks/index.ts";
import { useT } from "../../../i18n/index.tsx";
import { type AppAction, api, JobCanceled, jobTaskPatch } from "../../../lib/index.ts";
import type { AppEntry, InstallResult, JobSnapshot } from "../../../types.ts";
import { appQuery, appsQuery, groupInstall } from "../lib/index.ts";

/** 应用详情里的操作：强行停止、启用、恢复直接执行，其余先确认 */
export type AppOpName = "stop" | "enable" | "restore" | "disable" | "clear" | "uninstall" | "uninstallUpdates";

/** 操作对应的接口名 */
const ACTIONS: Record<AppOpName, AppAction> = {
  stop: "force-stop",
  enable: "enable",
  restore: "restore",
  disable: "disable",
  clear: "clear",
  uninstall: "uninstall",
  uninstallUpdates: "uninstall-updates",
};

/** 操作成功后的提示 */
const FLASH = {
  stop: "apps.flash.stopped",
  enable: "apps.flash.enabled",
  restore: "apps.flash.restored",
  disable: "apps.flash.disabled",
  clear: "apps.flash.cleared",
  uninstall: "apps.flash.uninstalled",
  uninstallUpdates: "apps.flash.updatesRemoved",
} as const satisfies Record<AppOpName, string>;

/** 需要确认的操作的图标 */
const CONFIRM_ICONS = { disable: PowerOff, clear: Eraser, uninstall: Trash2, uninstallUpdates: Undo2 } as const;

/** 强确认的倒计时秒数 */
const CRITICAL_COUNTDOWN = 5;

/** 应用的操作：安装 APK、卸载、停用、清除数据等，以及提取 APK。成功后让应用列表和详情的缓存失效 */
export function useAppOps() {
  const { serial, flash, openDialog, startTask, patchTask } = useShell();
  const client = useQueryClient();
  const t = useT();

  const refresh = useCallback(
    (forSerial: string, pkg?: string) => {
      void client.invalidateQueries({ queryKey: appsQuery(forSerial).queryKey });
      // 安装后不知道装的是哪个包，让该设备的全部详情失效
      void client.invalidateQueries({ queryKey: pkg ? appQuery(forSerial, pkg).queryKey : ["app", forSerial] });
    },
    [client],
  );

  /** 把任务快照写进卡片 */
  const syncTask = useCallback(
    (id: string) => (snap: JobSnapshot) => {
      const patch = jobTaskPatch(snap);
      if (patch) patchTask(id, patch);
    },
    [patchTask],
  );

  const install = useCallback(
    async (files: File[]) => {
      if (!serial || !files.length) return;
      const { groups, unsupported } = groupInstall(files);
      if (unsupported.length)
        flash(t("apps.install.unsupported", { names: unsupported.map((f) => f.name).join(", ") }));
      // 一组一张卡片，按顺序安装：同时装多个会争用 adb 和设备的包管理器
      for (const group of groups) {
        const label =
          group.length === 1
            ? group[0].name
            : t("common.itemsEtc", { name: group[0].name, n: group.length, rest: group.length - 1 });
        const controller = new AbortController();
        const id = startTask({
          kind: "install",
          label,
          status: "uploading",
          progress: 0,
          cancel: () => controller.abort(),
        });
        try {
          const { id: jobId } = await api.installApps(
            serial,
            group,
            (p) =>
              patchTask(id, p >= 1 ? { status: "preparing", progress: undefined, cancel: undefined } : { progress: p }),
            controller.signal,
          );
          patchTask(id, { cancel: () => void api.cancelJob(jobId).catch(() => {}) });
          const result = await api.watchJob<InstallResult>(jobId, syncTask(id));
          patchTask(
            id,
            result.obb ? { status: "done", note: t("apps.install.obb", { n: result.obb }) } : { status: "done" },
          );
        } catch (e) {
          patchTask(
            id,
            e instanceof JobCanceled ? { status: "canceled" } : { status: "error", error: (e as Error).message },
          );
        }
        // 失败时也刷新：分包可能已经装上，或装到一半状态已变
        refresh(serial);
      }
    },
    [serial, flash, startTask, patchTask, syncTask, refresh, t],
  );

  const extract = useCallback(
    async (entry: AppEntry) => {
      if (!serial) return;
      const id = startTask({ kind: "download", label: entry.pkg, status: "pulling" });
      try {
        await api.extractApk(serial, entry.pkg, {
          onJob: (jobId) => patchTask(id, { cancel: () => void api.cancelJob(jobId).catch(() => {}) }),
          onUpdate: syncTask(id),
        });
        patchTask(id, { status: "done" });
      } catch (e) {
        patchTask(
          id,
          e instanceof JobCanceled ? { status: "canceled" } : { status: "error", error: (e as Error).message },
        );
      }
    },
    [serial, startTask, patchTask, syncTask],
  );

  /** 直接执行的操作；失败时提示原因 */
  const execute = useCallback(
    async (
      op: AppOpName,
      entry: AppEntry,
      opts: { force?: boolean; user0?: boolean; keepData?: boolean } = {},
      raise = false,
    ) => {
      if (!serial) return;
      try {
        await api.appAction(serial, ACTIONS[op], entry.pkg, opts);
      } catch (e) {
        // 对话框里的失败显示在对话框中，由它的 onSubmit 抛出；直接执行的操作用提示
        if (raise) throw e;
        flash((e as Error).message);
        return;
      } finally {
        refresh(serial, entry.pkg);
      }
      flash(t(FLASH[op], { pkg: entry.pkg }));
    },
    [serial, flash, refresh, t],
  );

  const run = useCallback(
    (op: AppOpName, entry: AppEntry) => {
      if (op === "stop" || op === "enable" || op === "restore") {
        void execute(op, entry);
        return;
      }
      // 系统应用只能为当前用户卸载
      const userUninstall = op === "uninstall" && entry.system;
      const key = userUninstall ? "uninstallUser" : op;
      const critical = entry.critical;
      openDialog({
        kind: "confirm",
        tone: "danger",
        icon: critical ? ShieldAlert : CONFIRM_ICONS[op],
        title: t(`apps.confirm.${key}.title`, { pkg: entry.pkg }),
        message: critical ? t(`apps.critical.${critical}`) : t(`apps.confirm.${key}.message`),
        confirm: t(userUninstall ? "apps.action.uninstallUser" : `apps.action.${op}`),
        ...(critical ? { countdown: CRITICAL_COUNTDOWN } : {}),
        ...(op === "uninstall" ? { checkbox: t("apps.confirm.keepData") } : {}),
        onSubmit: (keepData) =>
          execute(
            op,
            entry,
            {
              ...(critical ? { force: true } : {}),
              ...(userUninstall ? { user0: true } : {}),
              ...(op === "uninstall" && keepData ? { keepData: true } : {}),
            },
            true,
          ),
      });
    },
    [openDialog, execute, t],
  );

  return { install, extract, run };
}

export type AppOps = ReturnType<typeof useAppOps>;
