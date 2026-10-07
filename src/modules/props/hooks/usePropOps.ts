import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldAlert } from "lucide-react";
import { useCallback } from "react";
import { useShell } from "../../../hooks/index.ts";
import { useT } from "../../../i18n/index.tsx";
import { ApiError, api } from "../../../lib/index.ts";
import type { PropEntry } from "../../../types.ts";
import { propsKey } from "../lib/index.ts";

/** 强确认的倒计时秒数 */
const FORCE_COUNTDOWN = 5;

/** 属性的操作：修改、新建、删除。后端对有风险的操作返回 409 和 needs_force，这里据此强确认后带 force 重试 */
export function usePropOps() {
  const { target, flash, openDialog } = useShell();
  const client = useQueryClient();
  const t = useT();

  const refresh = useCallback(
    (serial: string) => void client.invalidateQueries({ queryKey: propsKey(serial) }),
    [client],
  );

  /**
   * 执行一次修改或删除：先不带 force，后端返回 needs_force 时换成 danger 确认框（内容是后端给出的风险说明），
   * 确认后带 force 重试。其他错误原样抛出，由调用方显示
   */
  const attempt = useCallback(
    async (op: {
      /** 确认框的标题和确认按钮文案 */
      title: string;
      confirm: string;
      /** 成功后的提示 */
      done: string;
      call: (force?: boolean) => Promise<unknown>;
    }): Promise<void> => {
      if (!target) return;
      const serial = target.serial;
      try {
        await op.call();
      } catch (e) {
        if (!(e instanceof ApiError && e.code === "needs_force")) throw e;
        // 换掉当前对话框；原对话框稍后调用的关闭不会影响新的对话框
        openDialog({
          kind: "confirm",
          tone: "danger",
          icon: ShieldAlert,
          title: op.title,
          message: e.message,
          confirm: op.confirm,
          countdown: FORCE_COUNTDOWN,
          onSubmit: async () => {
            await op.call(true);
            refresh(serial);
            flash(op.done);
          },
        });
        return;
      }
      refresh(serial);
      flash(op.done);
    },
    [target, openDialog, refresh, flash],
  );

  const edit = useCallback(
    (row: PropEntry) => {
      if (!target) return;
      openDialog({
        kind: "form",
        icon: Pencil,
        title: t("prop.edit.title"),
        fields: [
          { label: t("prop.field.key"), initial: row.key, readOnly: true, mono: true },
          { label: t("prop.field.value"), initial: row.value, trim: true, mono: true },
        ],
        confirm: t("prop.save"),
        onSubmit: ([, value]) =>
          attempt({
            title: t("prop.confirm.setTitle", { key: row.key }),
            confirm: t("prop.confirm.apply"),
            done: t("prop.flash.saved", { key: row.key }),
            call: (force) => api.setProp(target, row.key, value, force),
          }),
      });
    },
    [target, openDialog, attempt, t],
  );

  const add = useCallback(() => {
    if (!target) return;
    openDialog({
      kind: "form",
      icon: Plus,
      title: t("prop.add.title"),
      message: t("prop.add.hint"),
      fields: [
        { label: t("prop.field.key"), initial: "", required: true, trim: true, mono: true },
        { label: t("prop.field.value"), initial: "", trim: true, mono: true },
      ],
      confirm: t("prop.add.confirm"),
      onSubmit: ([key, value]) =>
        attempt({
          title: t("prop.confirm.setTitle", { key }),
          confirm: t("prop.confirm.apply"),
          done: t("prop.flash.saved", { key }),
          call: (force) => api.setProp(target, key, value, force),
        }),
    });
  }, [target, openDialog, attempt, t]);

  /** 删除总是有风险：先请求一次拿到后端的风险说明，再强确认；其他错误用提示显示 */
  const remove = useCallback(
    (row: PropEntry) => {
      if (!target) return;
      attempt({
        title: t("prop.confirm.deleteTitle", { key: row.key }),
        confirm: t("prop.confirm.delete"),
        done: t("prop.flash.deleted", { key: row.key }),
        call: (force) => api.deleteProp(target, row.key, force),
      }).catch((e: Error) => flash(e.message));
    },
    [target, attempt, flash, t],
  );

  return { edit, add, remove };
}

export type PropOps = ReturnType<typeof usePropOps>;
