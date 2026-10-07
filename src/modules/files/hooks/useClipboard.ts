import { useCallback, useMemo, useState } from "react";
import type { Flash } from "../../../hooks/index.ts";
import { useT } from "../../../i18n/index.tsx";
import type { FileEntry } from "../../../types.ts";
import type { Clip } from "../types.ts";

/** 应用内的剪切 / 拷贝，以及把文字写入系统剪贴板 */
export function useClipboard(serial: string | null, flash: Flash) {
  const t = useT();
  const [clip, setClip] = useState<Clip | null>(null);
  const canPaste = !!clip && clip.serial === serial;
  /** 已剪切、等待粘贴的条目，界面上淡化显示 */
  const cutPaths = useMemo(
    () => new Set(clip?.mode === "cut" && clip.serial === serial ? clip.entries.map((e) => e.path) : []),
    [clip, serial],
  );

  const toClip = useCallback(
    (mode: Clip["mode"], items: FileEntry[]) => {
      if (!serial || !items.length) return;
      setClip({ mode, entries: items, serial });
      flash(t(mode === "cut" ? "clip.cut" : "clip.copied", { n: items.length }), "info");
    },
    [serial, flash, t],
  );

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => flash(t("clip.pathCopied"), "info"),
        () => flash(t("clip.failed")),
      );
    },
    [flash, t],
  );

  return { clip, setClip, canPaste, cutPaths, toClip, copyText };
}
