import { ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogState } from "../components/Dialog.tsx";
import { useT } from "../i18n/index.tsx";
import { api, onRootLost } from "../lib/api.ts";
import { loadPref, savePref } from "../lib/prefs.ts";
import type { Flash } from "./useToast.ts";

/**
 * root 模式的开关。开启前先确认设备能拿到 root；勾选“记住选择”后下次自动开启，
 * 自动开启或操作途中发现 root 不可用时退出 root 模式并提示
 */
export function useRootMode({
  serial,
  online,
  flash,
  openDialog,
}: {
  serial: string | null;
  online: boolean;
  flash: Flash;
  openDialog: (d: DialogState) => void;
}) {
  const t = useT();
  const [rootMode, setRootMode] = useState(() => loadPref("afm.rootRemember", false));
  /** 已确认能拿到 root 的设备，切回这台设备时不再检查 */
  const rootVerified = useRef<string | null>(null);

  useEffect(() => {
    if (!rootMode || !online || !serial || rootVerified.current === serial) return;
    api.rootCheck(serial).then(
      () => (rootVerified.current = serial),
      (e: Error) => {
        rootVerified.current = null;
        setRootMode(false);
        flash(t("root.exited", { reason: e.message }));
      },
    );
  }, [rootMode, online, serial, flash, t]);

  const askEnableRoot = useCallback(() => {
    if (!serial) return;
    openDialog({
      kind: "confirm",
      tone: "warn",
      icon: ShieldAlert,
      title: t("root.enable.title"),
      message: { kind: "rootEnable" },
      checkbox: t("root.enable.remember"),
      confirm: t("root.enable.confirm"),
      onSubmit: async (remember) => {
        await api.rootCheck(serial);
        rootVerified.current = serial;
        savePref("afm.rootRemember", remember);
        setRootMode(true);
      },
    });
  }, [serial, openDialog, t]);

  const disableRoot = useCallback(() => {
    rootVerified.current = null;
    savePref("afm.rootRemember", false);
    setRootMode(false);
  }, []);

  // 操作途中 root 被撤销：退出 root 模式，但保留“记住选择”，重新授权后下次还能自动开启
  useEffect(() => {
    onRootLost((message) => {
      rootVerified.current = null;
      setRootMode(false);
      flash(t("root.exited", { reason: message }));
    });
    return () => onRootLost(() => {});
  }, [flash, t]);

  useEffect(() => {
    const name = t("app.name");
    document.title = rootMode ? t("app.rootTitle", { name }) : name;
  }, [rootMode, t]);

  return { rootMode, askEnableRoot, disableRoot };
}
