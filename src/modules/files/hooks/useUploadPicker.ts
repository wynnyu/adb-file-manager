import { type ChangeEvent, useCallback, useMemo, useRef } from "react";
import { fromInput, type UploadItem } from "../lib/index.ts";

type Upload = (items: UploadItem[], dest?: string) => Promise<void>;

/**
 * 隐藏的文件 / 文件夹选择框。pick 打开选择框；dest 为 null 时上传到 upload 的默认目录（当前目录），
 * 右键“上传到这里”时为所点的目录。inputs 需要传给 UploadInputs 渲染到页面上
 */
export function useUploadPicker(upload: Upload) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const dest = useRef<string | null>(null);

  const pick = useCallback((kind: "files" | "folder", to: string | null) => {
    dest.current = to;
    (kind === "folder" ? folder : files).current?.click();
  }, []);

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      void upload(fromInput(e.target.files), dest.current ?? undefined);
      dest.current = null;
      e.target.value = "";
    },
    [upload],
  );

  const inputs = useMemo(() => ({ filesRef: files, folderRef: folder, onChange }), [onChange]);

  return { pick, inputs };
}
