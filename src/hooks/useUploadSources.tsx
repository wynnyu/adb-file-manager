import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { collectDropped, fromInput, type UploadItem } from "../drop.ts";

type Upload = (items: UploadItem[], dest?: string) => Promise<void>;

/**
 * 隐藏的文件 / 文件夹选择框。pick 打开选择框；dest 为 null 时上传到 upload 的默认目录（当前目录），
 * 右键“上传到这里”时为所点的目录。inputs 需要渲染到页面上
 */
export function useUploadPicker(upload: Upload) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const dest = useRef<string | null>(null);

  const pick = (kind: "files" | "folder", to: string | null) => {
    dest.current = to;
    (kind === "folder" ? folder : files).current?.click();
  };

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    void upload(fromInput(e.target.files), dest.current ?? undefined);
    dest.current = null;
    e.target.value = "";
  };

  const inputs = (
    <>
      <input ref={files} type="file" multiple hidden onChange={onChange} />
      <input ref={folder} type="file" hidden {...{ webkitdirectory: "" }} onChange={onChange} />
    </>
  );

  return { pick, inputs };
}

/** 把文件、文件夹拖进窗口上传。enabled 为 false 时不响应拖拽；dragProps 放在接收拖放的容器上 */
export function useDropUpload(enabled: boolean, upload: Upload, onError: (e: Error) => void) {
  const [dragging, setDragging] = useState(false);
  /** 拖过子元素时 enter / leave 成对触发，计数归零才算真正离开 */
  const depth = useRef(0);

  const dragProps = enabled
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          depth.current++;
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        },
        onDragLeave: () => {
          if (--depth.current <= 0) {
            depth.current = 0;
            setDragging(false);
          }
        },
        onDrop: async (e: DragEvent) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          try {
            await upload(await collectDropped(e.dataTransfer));
          } catch (err) {
            onError(err as Error);
          }
        },
      }
    : {};

  return { dragging, dragProps };
}
