import type { ChangeEvent, RefObject } from "react";

/** useUploadPicker 用的隐藏文件 / 文件夹选择框 */
export function UploadInputs({
  filesRef,
  folderRef,
  onChange,
}: {
  filesRef: RefObject<HTMLInputElement | null>;
  folderRef: RefObject<HTMLInputElement | null>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <input ref={filesRef} type="file" multiple hidden onChange={onChange} />
      <input ref={folderRef} type="file" hidden {...{ webkitdirectory: "" }} onChange={onChange} />
    </>
  );
}
